use serde_json::Value;

use super::http::AdvisorHttp;
use crate::error::AppError;
use crate::model_provider::ModelProviderSettings;

const MAX_INLINE_CONTENT_CHARS: usize = 6000;
const DEEPSEEK_MAX_QUERY_CHARS: usize = 128;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchHit {
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub content: Option<String>,
}

pub async fn search_web<C: AdvisorHttp>(
    client: &C,
    settings: &ModelProviderSettings,
    query: &str,
) -> Result<Vec<SearchHit>, AppError> {
    match settings.search_provider.as_str() {
        "tavily" => search_tavily(client, settings.search_api_key.trim(), query).await,
        "bocha" => search_bocha(client, settings.search_api_key.trim(), query).await,
        _ => {
            search_deepseek(
                client,
                settings.base_url.trim_end_matches('/'),
                settings.api_key.trim(),
                query,
            )
            .await
        }
    }
}

async fn search_deepseek<C: AdvisorHttp>(
    client: &C,
    base_url: &str,
    api_key: &str,
    query: &str,
) -> Result<Vec<SearchHit>, AppError> {
    let trimmed_query: String = query
        .trim()
        .chars()
        .take(DEEPSEEK_MAX_QUERY_CHARS)
        .collect();
    let url = format!("{base_url}/v1/tools/search");
    let body = serde_json::json!({
        "query": trimmed_query,
        "count": 8,
        "need_content": true,
    });
    let raw = client
        .post_json(
            &url,
            &[("Authorization", &format!("Bearer {api_key}"))],
            &body,
        )
        .await?;
    let parsed: Value = serde_json::from_str(&raw).map_err(|error| {
        AppError::Advisor(format!("DeepSeek 搜索返回了无法解析的内容：{error}"))
    })?;
    let hits = parse_deepseek_search_value(&parsed);
    if hits.is_empty() {
        Err(AppError::Advisor(
            "DeepSeek 搜索没有返回可用结果。".to_owned(),
        ))
    } else {
        Ok(hits)
    }
}

async fn search_tavily<C: AdvisorHttp>(
    client: &C,
    api_key: &str,
    query: &str,
) -> Result<Vec<SearchHit>, AppError> {
    let body = serde_json::json!({
        "query": query.trim(),
        "search_depth": "basic",
        "max_results": 8,
        "topic": "general",
        "include_raw_content": true,
    });
    let raw = client
        .post_json(
            "https://api.tavily.com/search",
            &[("Authorization", &format!("Bearer {api_key}"))],
            &body,
        )
        .await?;
    let parsed: Value = serde_json::from_str(&raw)
        .map_err(|error| AppError::Advisor(format!("Tavily 返回了无法解析的内容：{error}")))?;
    let hits = parse_tavily_value(&parsed);
    if hits.is_empty() {
        Err(AppError::Advisor("Tavily 没有返回可用结果。".to_owned()))
    } else {
        Ok(hits)
    }
}

async fn search_bocha<C: AdvisorHttp>(
    client: &C,
    api_key: &str,
    query: &str,
) -> Result<Vec<SearchHit>, AppError> {
    let body = serde_json::json!({
        "query": query,
        "summary": true,
        "count": 8,
        "freshness": "noLimit",
    });
    let raw = client
        .post_json(
            "https://api.bochaai.com/v1/web-search",
            &[("Authorization", &format!("Bearer {api_key}"))],
            &body,
        )
        .await?;
    let parsed: Value = serde_json::from_str(&raw)
        .map_err(|error| AppError::Advisor(format!("博查返回了无法解析的内容：{error}")))?;
    let hits = parse_bocha_value(&parsed);
    if hits.is_empty() {
        Err(AppError::Advisor("博查没有返回可用结果。".to_owned()))
    } else {
        Ok(hits)
    }
}

pub fn parse_deepseek_search_value(value: &Value) -> Vec<SearchHit> {
    value
        .pointer("/results")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let url = item.get("url").and_then(Value::as_str)?.trim();
            if url.is_empty() {
                return None;
            }
            let title = item
                .get("title")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .unwrap_or(url)
                .to_owned();
            let content = item
                .get("content")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|text| text.chars().count() >= 40)
                .map(|text| {
                    text.chars()
                        .take(MAX_INLINE_CONTENT_CHARS)
                        .collect::<String>()
                });
            let snippet = item
                .get("summary")
                .or_else(|| item.get("snippet"))
                .or_else(|| item.get("content"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .chars()
                .take(400)
                .collect();
            Some(SearchHit {
                title,
                url: url.to_owned(),
                snippet,
                content,
            })
        })
        .take(8)
        .collect()
}

pub fn parse_tavily_value(value: &Value) -> Vec<SearchHit> {
    value
        .pointer("/results")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let url = item.get("url").and_then(Value::as_str)?.trim();
            if url.is_empty() {
                return None;
            }
            let title = item
                .get("title")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .unwrap_or(url)
                .to_owned();
            let raw_content = item
                .get("raw_content")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|text| text.chars().count() >= 40)
                .map(|text| {
                    text.chars()
                        .take(MAX_INLINE_CONTENT_CHARS)
                        .collect::<String>()
                });
            let snippet = item
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .chars()
                .take(400)
                .collect();
            Some(SearchHit {
                title,
                url: url.to_owned(),
                snippet,
                content: raw_content,
            })
        })
        .take(8)
        .collect()
}

pub fn parse_bocha_value(value: &Value) -> Vec<SearchHit> {
    value
        .pointer("/data/webPages/value")
        .or_else(|| value.pointer("/data/webPages"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let url = item.get("url").and_then(Value::as_str)?.trim();
            if url.is_empty() {
                return None;
            }
            Some(SearchHit {
                title: item
                    .get("name")
                    .or_else(|| item.get("title"))
                    .and_then(Value::as_str)
                    .unwrap_or(url)
                    .trim()
                    .to_owned(),
                url: url.to_owned(),
                snippet: item
                    .get("summary")
                    .or_else(|| item.get("snippet"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim()
                    .chars()
                    .take(400)
                    .collect(),
                content: None,
            })
        })
        .take(8)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_bocha_web_pages() {
        let value = json!({
            "data": {
                "webPages": {
                    "value": [{
                        "name": "飞霄攻略",
                        "url": "https://www.miyoushe.com/sr/article/1",
                        "summary": "躯干暴击，脚部攻击或速度"
                    }]
                }
            }
        });
        let hits = parse_bocha_value(&value);
        assert_eq!(hits[0].title, "飞霄攻略");
        assert!(hits[0].snippet.contains("躯干"));
    }

    #[test]
    fn parses_deepseek_search_results_with_inline_content() {
        let value = json!({
            "results": [{
                "title": "遐蝶配装攻略",
                "url": "https://www.miyoushe.com/sr/article/100",
                "snippet": "推荐哀歌覆国的诗人四件套",
                "summary": "遐蝶推荐哀歌覆国的诗人四件套与谧宁拾骨地二件套。",
                "content": "遐蝶为记忆命途量子主C，毕业套装推荐哀歌覆国的诗人四件套搭配谧宁拾骨地二件套，主词条优先生命、暴伤与量子伤害。"
            }]
        });
        let hits = parse_deepseek_search_value(&value);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].title, "遐蝶配装攻略");
        assert!(hits[0].snippet.contains("谧宁拾骨地"));
        assert!(hits[0]
            .content
            .as_deref()
            .unwrap()
            .contains("哀歌覆国的诗人"));
    }

    #[test]
    fn parses_tavily_search_results_and_uses_raw_content_only_for_full_text() {
        let value = json!({
            "results": [
                {
                    "title": "Castorice Build Guide",
                    "url": "https://www.prydwen.gg/star-rail/characters/castorice",
                    "content": "Best relic set for Castorice is Poet of Mourning Collapse (4pc).",
                    "raw_content": "Castorice Build Guide: 4pc Poet of Mourning Collapse, 2pc Bone Collection's Serene Demesne, Body CRIT DMG, Feet HP%, Sphere Quantum DMG or HP%, Rope HP%."
                },
                {
                    "title": "Snippet Only Guide",
                    "url": "https://www.miyoushe.com/sr/article/200",
                    "content": "Short snippet without raw_content.",
                    "raw_content": null
                }
            ]
        });
        let hits = parse_tavily_value(&value);
        assert_eq!(hits.len(), 2);
        assert!(hits[0].snippet.contains("Poet of Mourning Collapse"));
        assert!(hits[0]
            .content
            .as_deref()
            .unwrap()
            .contains("Body CRIT DMG"));
        assert!(hits[1].content.is_none());
    }
}
