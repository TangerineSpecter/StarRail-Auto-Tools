use serde_json::Value;

use super::fetch::extract_relevant_passages;
use super::http::AdvisorHttp;
use super::search_rank::{build_en_query, build_zh_query, rank_and_filter_hits};
use crate::error::AppError;
use crate::model_provider::ModelProviderSettings;

const MAX_INLINE_CONTENT_CHARS: usize = 4800;
const MAX_SNIPPET_CHARS: usize = 1200;
const DEEPSEEK_MAX_QUERY_CHARS: usize = 128;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchHit {
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub content: Option<String>,
    pub published_at: Option<String>,
}

pub struct SearchContext<'a> {
    pub display_name: &'a str,
    pub slug: &'a str,
    pub path_zh: &'a str,
    pub hints: &'a [&'a str],
}

pub async fn search_web<C: AdvisorHttp>(
    client: &C,
    settings: &ModelProviderSettings,
    ctx: &SearchContext<'_>,
) -> Result<Vec<SearchHit>, AppError> {
    let zh_query = build_zh_query(ctx.display_name, ctx.hints);
    match settings.search_provider.as_str() {
        "tavily" => {
            search_tavily_bilingual(client, settings.search_api_key.trim(), ctx, &zh_query).await
        }
        "bocha" => {
            let hits = search_bocha(client, settings.search_api_key.trim(), &zh_query).await?;
            Ok(rank_and_filter_hits(hits, ctx))
        }
        _ => {
            let hits = search_deepseek(
                client,
                settings.base_url.trim_end_matches('/'),
                settings.api_key.trim(),
                &zh_query,
            )
            .await?;
            Ok(rank_and_filter_hits(hits, ctx))
        }
    }
}

async fn search_tavily_bilingual<C: AdvisorHttp>(
    client: &C,
    api_key: &str,
    ctx: &SearchContext<'_>,
    zh_query: &str,
) -> Result<Vec<SearchHit>, AppError> {
    let en_query = build_en_query(ctx.slug, ctx.display_name, ctx.hints);
    let (zh_res, en_res) = match en_query.as_deref() {
        Some(en) => {
            let (zh, en) = tokio::join!(
                search_tavily_single(client, api_key, zh_query, 6),
                search_tavily_single(client, api_key, en, 5),
            );
            (zh, Some(en))
        }
        None => (
            search_tavily_single(client, api_key, zh_query, 8).await,
            None,
        ),
    };

    let mut combined = Vec::new();
    let mut first_error = None;
    match zh_res {
        Ok(hits) => combined.extend(hits),
        Err(error) => first_error = Some(error),
    }
    if let Some(res) = en_res {
        match res {
            Ok(hits) => combined.extend(hits),
            Err(error) if first_error.is_none() => first_error = Some(error),
            Err(_) => {}
        }
    }

    let ranked = rank_and_filter_hits(combined, ctx);
    if ranked.is_empty() {
        Err(first_error
            .unwrap_or_else(|| AppError::Advisor("Tavily 没有返回可用攻略结果。".to_owned())))
    } else {
        Ok(ranked)
    }
}

async fn search_tavily_single<C: AdvisorHttp>(
    client: &C,
    api_key: &str,
    query: &str,
    max_results: u8,
) -> Result<Vec<SearchHit>, AppError> {
    let body = serde_json::json!({
        "query": query.trim(),
        "search_depth": "basic",
        "max_results": max_results,
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
    Ok(parse_tavily_value(&parsed))
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
                .map(|text| extract_relevant_passages(text, MAX_INLINE_CONTENT_CHARS));
            let snippet = item
                .get("summary")
                .or_else(|| item.get("snippet"))
                .or_else(|| item.get("content"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .chars()
                .take(MAX_SNIPPET_CHARS)
                .collect();
            let published_at = item
                .get("date")
                .and_then(Value::as_str)
                .and_then(normalize_date_prefix);
            Some(SearchHit {
                title,
                url: url.to_owned(),
                snippet,
                content,
                published_at,
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
            let score = item.get("score").and_then(Value::as_f64).unwrap_or(0.5);
            if score < 0.2 {
                return None;
            }
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
            let snippet: String = item
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .chars()
                .take(MAX_SNIPPET_CHARS)
                .collect();
            let raw_content = item
                .get("raw_content")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|text| text.chars().count() >= 40)
                .map(|text| extract_relevant_passages(text, MAX_INLINE_CONTENT_CHARS));
            let published_at = item
                .get("published_date")
                .and_then(Value::as_str)
                .and_then(normalize_date_prefix);
            Some(SearchHit {
                title,
                url: url.to_owned(),
                snippet,
                content: raw_content,
                published_at,
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
            let published_at = item
                .get("datePublished")
                .or_else(|| item.get("dateLastCrawled"))
                .and_then(Value::as_str)
                .and_then(normalize_date_prefix);
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
                    .take(MAX_SNIPPET_CHARS)
                    .collect(),
                content: None,
                published_at,
            })
        })
        .take(8)
        .collect()
}

fn normalize_date_prefix(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.len() >= 10 {
        let prefix = &trimmed[..10];
        let bytes = prefix.as_bytes();
        if bytes[4] == b'-'
            && bytes[7] == b'-'
            && bytes[..4].iter().all(u8::is_ascii_digit)
            && bytes[5..7].iter().all(u8::is_ascii_digit)
            && bytes[8..10].iter().all(u8::is_ascii_digit)
        {
            return Some(prefix.to_owned());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn builds_clean_multilingual_queries_for_multi_path_and_sp_characters() {
        assert!(build_zh_query("开拓者·欢愉", &[]).contains("欢愉主"));
        assert!(build_zh_query("三月七·巡猎", &[]).contains("巡猎三月七"));
        assert!(build_zh_query("银狼LV. 999", &[]).contains("银狼LV.999"));
        assert!(build_en_query("silverwolflv999", "银狼LV. 999", &[])
            .unwrap()
            .contains("Silver Wolf LV 999"));
        assert!(build_en_query("playergirl4", "开拓者·记忆", &[])
            .unwrap()
            .contains("Trailblazer Remembrance"));
    }

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
    fn parses_tavily_and_filters_low_score_and_wrong_variant() {
        let value = json!({
            "results": [
                {
                    "title": "Silver Wolf Best Build Guide",
                    "url": "https://www.prydwen.gg/star-rail/characters/silver-wolf",
                    "score": 0.7,
                    "content": "Old Nihility Silver Wolf guide",
                    "raw_content": "Old Nihility Silver Wolf guide with plenty of text for testing."
                },
                {
                    "title": "Silver Wolf • Lv. 999 Best Build Guide",
                    "url": "https://www.prydwen.gg/star-rail/characters/silver-wolf-lv-999",
                    "score": 0.6,
                    "content": "Best relic set for Silver Wolf LV.999 is Magical Girl (4pc).",
                    "raw_content": "Best Relic Sets: Magical Girl 4pc, Planar: Punklorde Stage Zero, Body: CRIT Rate, Feet: SPD."
                },
                {
                    "title": "Unrelated Finance News",
                    "url": "https://finance.yahoo.com/news/hsr",
                    "score": 0.05,
                    "content": "Stock news",
                    "raw_content": "Stock news body"
                }
            ]
        });
        let ctx = SearchContext {
            display_name: "银狼LV. 999",
            slug: "silverwolflv999",
            path_zh: "欢愉",
            hints: &[],
        };
        let hits = rank_and_filter_hits(parse_tavily_value(&value), &ctx);
        assert_eq!(hits.len(), 1);
        assert!(hits[0].url.contains("silver-wolf-lv-999"));
        assert!(hits[0].content.as_deref().unwrap().contains("Punklorde"));
    }
}
