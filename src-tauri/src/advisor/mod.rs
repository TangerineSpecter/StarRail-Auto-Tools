mod context;
mod deepseek;
mod fetch;
mod http;
mod parse;
mod profile;
mod profile_data;
mod prompt;
mod sanitize;
mod search;
mod search_rank;
mod stat_aliases;
mod validate;

use std::collections::HashSet;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;

use crate::error::AppError;
use crate::inventory::{CharacterBuildPlan, InventoryStore};
use crate::model_provider::ModelProviderSettings;

use context::load_snapshot;
pub use parse::CharacterBuildAdvice;

use fetch::{fetch_page, reference_urls, FetchedPage};
use http::{AdvisorHttp, ReqwestAdvisorHttp};
use search::{search_web, SearchContext, SearchHit};

const ADVICE_TIMEOUT: Duration = Duration::from_secs(45);
const MAX_PROMPT_PAGES: usize = 4;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdviseCharacterRequest {
    pub character_id: u32,
    #[serde(default)]
    pub slug: String,
    #[serde(default)]
    pub element: String,
    #[serde(default)]
    pub current_plan: Option<CharacterBuildPlan>,
}

pub async fn advise_character_build(
    settings: ModelProviderSettings,
    store: InventoryStore,
    request: AdviseCharacterRequest,
) -> Result<CharacterBuildAdvice, AppError> {
    settings.require_ready()?;
    let snapshot_store = store.clone();
    let (account_uid, snapshot) = tokio::task::spawn_blocking(move || {
        let uid = snapshot_store.current_uid()?;
        let snapshot = load_snapshot(
            &snapshot_store,
            request.character_id,
            &request.slug,
            &request.element,
            request.current_plan.as_ref(),
        )?;
        Ok::<_, AppError>((uid, snapshot))
    })
    .await
    .map_err(|error| AppError::Advisor(format!("读取角色数据失败：{error}")))??;
    let client = ReqwestAdvisorHttp::new()?;
    let mut advice = tokio::time::timeout(
        ADVICE_TIMEOUT,
        advise_with_client(&client, &settings, snapshot),
    )
    .await
    .map_err(|_| AppError::Advisor("检索和生成耗时过长，请稍后重试。".to_owned()))??;
    let cached = advice.clone();
    let saved =
        tokio::task::spawn_blocking(move || store.save_build_advice(account_uid, &cached)).await;
    if !matches!(saved, Ok(Ok(()))) {
        advice.warnings.push("本次推荐未能保存到本地。".to_owned());
    }
    Ok(advice)
}

async fn advise_with_client<C: AdvisorHttp>(
    client: &C,
    settings: &ModelProviderSettings,
    snapshot: context::CharacterAdviceSnapshot,
) -> Result<CharacterBuildAdvice, AppError> {
    let profile = profile::resolve_profile(
        snapshot.character_id,
        &snapshot.name,
        &snapshot.slug,
        &snapshot.element,
    );
    let search_ctx = SearchContext {
        display_name: &snapshot.display_name,
        slug: &snapshot.slug,
        path_zh: if !snapshot.path_zh.is_empty() {
            &snapshot.path_zh
        } else {
            &profile.path_zh
        },
        hints: &profile.search_hints,
    };

    let mut search_error_note = None;
    let hits = match search_web(client, settings, &search_ctx).await {
        Ok(hits) => hits,
        Err(error) => {
            search_error_note = Some(advisor_warning(&error));
            Vec::new()
        }
    };

    let pages = collect_pages(client, &snapshot, &hits).await;

    let mut warnings = Vec::new();
    if hits.is_empty() && pages.is_empty() {
        warnings.push(match search_error_note.as_deref() {
            Some(detail) => format!(
                "未能检索到公开攻略（{detail}），本次建议主要基于当前版本角色实装数据生成，请结合实战核对。"
            ),
            None => "未能检索到公开攻略，本次建议主要基于当前版本角色实装数据生成，请结合实战核对。"
                .to_owned(),
        });
    }

    let user = prompt::user_prompt(
        &snapshot,
        &profile,
        &hits,
        &pages,
        search_error_note.as_deref(),
    )
    .map_err(|error| AppError::Advisor(error.to_string()))?;
    let system = prompt::system_prompt();
    let content = deepseek::complete_json(client, settings, &system, &user).await?;
    let mut advice = match parse::parse_model_advice(&content) {
        Ok(parsed) => parsed,
        Err(_) => {
            // Retry once if the model output truncated/malformed JSON.
            let retry = deepseek::complete_json(client, settings, &system, &user).await?;
            parse::parse_model_advice(&retry)?
        }
    };
    let validation_notes = validate::validate_and_correct_plan(&mut advice.plan, &profile);
    advice.character_id = snapshot.character_id;
    advice.display_name = snapshot.display_name;
    advice.searched_at = now_millis();
    for warning in validation_notes.into_iter().chain(warnings) {
        if !advice.warnings.iter().any(|item| item == &warning) {
            advice.warnings.push(warning);
        }
    }
    if advice.sources.is_empty() {
        advice.sources = default_sources(&hits, &pages);
    }
    Ok(advice)
}

async fn collect_pages<C: AdvisorHttp>(
    client: &C,
    snapshot: &context::CharacterAdviceSnapshot,
    hits: &[SearchHit],
) -> Vec<FetchedPage> {
    let mut pages = Vec::new();
    let mut seen = HashSet::new();
    let mut fetch_targets: Vec<(String, String)> = Vec::new();

    // 1. Prefer inline extracted full text already returned by Tavily / DeepSeek search.
    for hit in hits {
        if pages.len() >= MAX_PROMPT_PAGES {
            break;
        }
        if let Some(content) = &hit.content {
            if seen.insert(hit.url.clone()) {
                pages.push(FetchedPage {
                    title: hit.title.clone(),
                    url: hit.url.clone(),
                    text: content.clone(),
                });
            }
        }
    }

    // 2. Only fetch supplemental pages directly when inline results are scarce.
    if pages.len() < 3 {
        for hit in hits {
            if fetch_targets.len() >= 2 {
                break;
            }
            if hit.content.is_none() && seen.insert(hit.url.clone()) {
                fetch_targets.push((hit.title.clone(), hit.url.clone()));
            }
        }
        for (title, url) in reference_urls(&snapshot.name, &snapshot.display_name) {
            if fetch_targets.len() >= 2 {
                break;
            }
            if seen.insert(url.clone()) {
                fetch_targets.push((title, url));
            }
        }
    }

    // Fetch supplemental pages concurrently (at most 2) and drop failures silently
    // so transient wiki/network errors never pollute user-facing build advice warnings.
    match fetch_targets.as_slice() {
        [(t1, u1), (t2, u2)] => {
            let (r1, r2) = tokio::join!(fetch_page(client, t1, u1), fetch_page(client, t2, u2));
            for page in [r1, r2].into_iter().flatten() {
                if pages.len() < MAX_PROMPT_PAGES {
                    pages.push(page);
                }
            }
        }
        [(t1, u1)] => {
            if let Ok(page) = fetch_page(client, t1, u1).await {
                if pages.len() < MAX_PROMPT_PAGES {
                    pages.push(page);
                }
            }
        }
        _ => {}
    }

    pages
}

fn default_sources(hits: &[SearchHit], pages: &[FetchedPage]) -> Vec<parse::AdviceSource> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for (title, url) in pages
        .iter()
        .map(|page| (page.title.as_str(), page.url.as_str()))
        .chain(
            hits.iter()
                .map(|hit| (hit.title.as_str(), hit.url.as_str())),
        )
    {
        if url.trim().is_empty() || !seen.insert(url.to_owned()) {
            continue;
        }
        out.push(parse::AdviceSource {
            title: title.to_owned(),
            url: url.to_owned(),
        });
        if out.len() >= 5 {
            break;
        }
    }
    out
}

fn advisor_warning(error: &AppError) -> String {
    match error {
        AppError::Advisor(message) => message.clone(),
        other => other.to_string(),
    }
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::advisor::context::CharacterAdviceSnapshot;
    use serde_json::Value;
    use std::sync::Mutex;

    struct MockHttp {
        get: Mutex<Vec<(String, String)>>,
        post: Mutex<Vec<(String, String)>>,
    }

    impl AdvisorHttp for MockHttp {
        async fn get_text(&self, url: &str, _headers: &[(&str, &str)]) -> Result<String, AppError> {
            let mut queue = self.get.lock().expect("mock get queue");
            if queue.is_empty() {
                return Err(AppError::Advisor(format!("未配置 GET：{url}")));
            }
            let (expected, body) = queue.remove(0);
            if !url.contains(&expected) {
                return Err(AppError::Advisor(format!(
                    "GET 地址不符：期望 {expected}，实际 {url}"
                )));
            }
            Ok(body)
        }

        async fn post_json(
            &self,
            url: &str,
            _headers: &[(&str, &str)],
            _body: &Value,
        ) -> Result<String, AppError> {
            let mut queue = self.post.lock().expect("mock post queue");
            if queue.is_empty() {
                return Err(AppError::Advisor(format!("未配置 POST：{url}")));
            }
            let (expected, body) = queue.remove(0);
            if !url.contains(&expected) {
                return Err(AppError::Advisor(format!(
                    "POST 地址不符：期望 {expected}，实际 {url}"
                )));
            }
            Ok(body)
        }
    }

    fn snapshot() -> CharacterAdviceSnapshot {
        CharacterAdviceSnapshot {
            character_id: 1220,
            name: "飞霄".to_owned(),
            display_name: "飞霄".to_owned(),
            path: "Hunt".to_owned(),
            path_zh: "巡猎".to_owned(),
            element: "风".to_owned(),
            slug: "feixiao".to_owned(),
            level: 80,
            eidolon: 0,
            light_cone: None,
            relics: vec![],
            saved_plan: None,
            inventory_sets: vec![],
        }
    }

    #[tokio::test]
    async fn combines_search_pages_and_model_json_without_leaking_fetch_errors() {
        let search_json = r#"{"results":[{"title":"飞霄配装","url":"https://www.miyoushe.com/sr/article/1","snippet":"4奔狼"}]}"#;
        let model = r#"{"choices":[{"message":{"content":"{\"summary\":\"穿风举云飞\",\"plan\":{\"cavernMode\":\"fourPiece\",\"cavernSetA\":120,\"planarSetId\":315,\"substatWeights\":{\"CRIT Rate\":1}},\"sources\":[{\"title\":\"飞霄配装\",\"url\":\"https://www.miyoushe.com/sr/article/1\"}]}"}}]}"#;
        let client = MockHttp {
            get: Mutex::new(vec![
                (
                    "miyoushe.com".into(),
                    "米游社攻略：飞霄主流四件套风举云飞的勇烈，位面饰品奔狼的都蓝王朝。正文足够长用于通过最小长度检查。".into(),
                ),
            ]),
            post: Mutex::new(vec![
                ("v1/tools/search".into(), search_json.into()),
                ("chat/completions".into(), model.into()),
            ]),
        };
        let settings = ModelProviderSettings {
            api_key: "sk-test".to_owned(),
            ..ModelProviderSettings::default()
        };
        let advice = advise_with_client(&client, &settings, snapshot())
            .await
            .unwrap();
        assert_eq!(advice.display_name, "飞霄");
        assert_eq!(advice.plan.cavern_set_a, 120);
        assert_eq!(advice.character_id, 1220);
        assert!(!advice.sources.is_empty());
        assert!(advice
            .warnings
            .iter()
            .all(|w| !w.contains("抓取失败") && !w.contains("<html")));
    }
}
