mod context;
mod deepseek;
mod fetch;
mod http;
mod parse;
mod prompt;
mod sanitize;
mod search;

use std::collections::HashSet;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;

use crate::error::AppError;
use crate::inventory::{CharacterBuildPlan, InventoryStore};
use crate::model_provider::ModelProviderSettings;

pub use context::load_snapshot;
pub use parse::CharacterBuildAdvice;

use fetch::{fetch_page, reference_urls, FetchedPage};
use http::{AdvisorHttp, ReqwestAdvisorHttp};
use search::{search_web, SearchHit};

const ADVICE_TIMEOUT: Duration = Duration::from_secs(45);

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

pub fn character_snapshot(
    store: &InventoryStore,
    request: &AdviseCharacterRequest,
) -> Result<context::CharacterAdviceSnapshot, AppError> {
    load_snapshot(
        store,
        request.character_id,
        &request.slug,
        &request.element,
        request.current_plan.as_ref(),
    )
}

pub async fn advise_character_build(
    settings: ModelProviderSettings,
    snapshot: context::CharacterAdviceSnapshot,
) -> Result<CharacterBuildAdvice, AppError> {
    settings.require_ready()?;
    let client = ReqwestAdvisorHttp::new()?;
    tokio::time::timeout(
        ADVICE_TIMEOUT,
        advise_with_client(&client, &settings, snapshot),
    )
    .await
    .map_err(|_| AppError::Advisor("检索和生成耗时过长，请稍后重试。".to_owned()))?
}

async fn advise_with_client<C: AdvisorHttp>(
    client: &C,
    settings: &ModelProviderSettings,
    snapshot: context::CharacterAdviceSnapshot,
) -> Result<CharacterBuildAdvice, AppError> {
    let query = context::search_query(&snapshot.display_name);
    let mut warnings = Vec::new();
    let hits = match search_web(client, settings, &query).await {
        Ok(hits) => hits,
        Err(error) => {
            warnings.push(error.to_string());
            Vec::new()
        }
    };

    let mut pages = Vec::new();
    let mut seen = HashSet::new();
    for (title, url) in reference_urls(&snapshot.name, &snapshot.slug) {
        if !seen.insert(url.clone()) {
            continue;
        }
        match fetch_page(client, &title, &url).await {
            Ok(page) => pages.push(page),
            Err(error) => warnings.push(error.to_string()),
        }
    }
    for hit in hits.iter().take(3) {
        if !seen.insert(hit.url.clone()) {
            continue;
        }
        if pages.len() >= 4 {
            break;
        }
        match fetch_page(client, &hit.title, &hit.url).await {
            Ok(page) => pages.push(page),
            Err(error) => warnings.push(error.to_string()),
        }
    }

    if hits.is_empty() && pages.is_empty() {
        warnings
            .push("未能检索到公开攻略，建议将根据模型既有知识作答，结论请自行核对。".to_owned());
    }

    let user = prompt::user_prompt(
        &snapshot,
        &hits,
        &pages,
        warnings.first().map(String::as_str),
    )
    .map_err(|error| AppError::Advisor(error.to_string()))?;
    let content =
        deepseek::complete_json(client, settings, &prompt::system_prompt(), &user).await?;
    let mut advice = parse::parse_model_advice(&content)?;
    sanitize::correct_plan_for_character(&mut advice.plan, &snapshot.name);
    advice.character_id = snapshot.character_id;
    advice.display_name = snapshot.display_name;
    advice.searched_at = now_millis();
    for warning in warnings {
        if !advice.warnings.iter().any(|item| item == &warning) {
            advice.warnings.push(warning);
        }
    }
    if advice.sources.is_empty() {
        advice.sources = default_sources(&hits, &pages);
    }
    Ok(advice)
}

fn default_sources(hits: &[SearchHit], pages: &[FetchedPage]) -> Vec<parse::AdviceSource> {
    pages
        .iter()
        .map(|page| parse::AdviceSource {
            title: page.title.clone(),
            url: page.url.clone(),
        })
        .chain(hits.iter().map(|hit| parse::AdviceSource {
            title: hit.title.clone(),
            url: hit.url.clone(),
        }))
        .take(6)
        .collect()
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
    async fn combines_search_pages_and_model_json() {
        let ddg = r#"<a class="result__a" href="https://www.miyoushe.com/sr/article/1">飞霄配装</a><a class="result__snippet">4奔狼</a>"#;
        let model = r#"{"choices":[{"message":{"content":"{\"summary\":\"穿过客\",\"plan\":{\"cavernMode\":\"fourPiece\",\"cavernSetA\":101,\"planarSetId\":301,\"substatWeights\":{\"CRIT Rate\":1}},\"sources\":[{\"title\":\"飞霄配装\",\"url\":\"https://www.miyoushe.com/sr/article/1\"}]}"}}]}"#;
        let client = MockHttp {
            get: Mutex::new(vec![
                ("html.duckduckgo.com".into(), ddg.into()),
                (
                    "wiki.biligame.com".into(),
                    "飞霄 遗器 奔狼的功勋 四件套推荐。正文足够长用于通过最小长度检查。".into(),
                ),
                (
                    "starrailstation.com".into(),
                    "Feixiao relics Pioneer Diver of Dead Waters. 正文足够长用于通过最小长度检查。"
                        .into(),
                ),
                (
                    "miyoushe.com".into(),
                    "米游社攻略：飞霄主流四件套奔狼。正文足够长用于通过最小长度检查。".into(),
                ),
            ]),
            post: Mutex::new(vec![("chat/completions".into(), model.into())]),
        };
        let settings = ModelProviderSettings {
            api_key: "sk-test".to_owned(),
            ..ModelProviderSettings::default()
        };
        let advice = advise_with_client(&client, &settings, snapshot())
            .await
            .unwrap();
        assert_eq!(advice.display_name, "飞霄");
        assert_eq!(advice.plan.cavern_set_a, 101);
        assert_eq!(advice.character_id, 1220);
        assert!(!advice.sources.is_empty());
    }
}
