use reqwest::Url;
use serde_json::Value;

use super::http::AdvisorHttp;
use crate::error::AppError;
use crate::model_provider::ModelProviderSettings;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchHit {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

pub async fn search_web<C: AdvisorHttp>(
    client: &C,
    settings: &ModelProviderSettings,
    query: &str,
) -> Result<Vec<SearchHit>, AppError> {
    match settings.search_provider.as_str() {
        "bocha" => search_bocha(client, settings.search_api_key.trim(), query).await,
        _ => search_duckduckgo(client, query).await,
    }
}

async fn search_duckduckgo<C: AdvisorHttp>(
    client: &C,
    query: &str,
) -> Result<Vec<SearchHit>, AppError> {
    let mut url = Url::parse("https://html.duckduckgo.com/html/")
        .map_err(|error| AppError::Advisor(format!("无法构造检索地址：{error}")))?;
    url.query_pairs_mut().append_pair("q", query);
    let html = client
        .get_text(
            url.as_str(),
            &[
                (
                    "User-Agent",
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                ),
                ("Accept", "text/html"),
            ],
        )
        .await?;
    let hits = parse_duckduckgo_html(&html);
    if hits.is_empty() {
        Err(AppError::Advisor(
            "DuckDuckGo 没有返回可用结果，可在设置中改用博查。".to_owned(),
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
            &[
                ("Authorization", &format!("Bearer {api_key}")),
                ("Content-Type", "application/json"),
            ],
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

pub fn parse_duckduckgo_html(html: &str) -> Vec<SearchHit> {
    let mut hits = Vec::new();
    let mut rest = html;
    while let Some(class_at) = rest.find("class=\"result__a\"") {
        let tag_start = rest[..class_at].rfind("<a").unwrap_or(class_at);
        let tag = &rest[tag_start..];
        let Some(tag_end) = tag.find('>') else {
            rest = &rest[class_at + 1..];
            continue;
        };
        let href = attribute_value(&tag[..tag_end], "href").unwrap_or_default();
        let href = decode_ddg_url(&href);
        let after_tag = &tag[tag_end + 1..];
        let Some(title_end) = after_tag.find("</a>") else {
            rest = &rest[class_at + 1..];
            continue;
        };
        let title = strip_tags(&decode_entities(&after_tag[..title_end]));
        let snippet_src = &after_tag[title_end..];
        let snippet = snippet_src
            .find("class=\"result__snippet\"")
            .and_then(|index| snippet_src[index..].find('>').map(|end| index + end + 1))
            .and_then(|start| {
                snippet_src[start..]
                    .find("</a>")
                    .or_else(|| snippet_src[start..].find("</td>"))
                    .map(|end| strip_tags(&decode_entities(&snippet_src[start..start + end])))
            })
            .unwrap_or_default();
        if !href.is_empty() && !title.is_empty() {
            hits.push(SearchHit {
                title,
                url: href,
                snippet: snippet.chars().take(280).collect(),
            });
        }
        rest = &rest[class_at + 1..];
        if hits.len() >= 8 {
            break;
        }
    }
    hits
}

fn attribute_value(tag: &str, name: &str) -> Option<String> {
    let needle = format!("{name}=\"");
    let start = tag.find(&needle)? + needle.len();
    let end = tag[start..].find('"')?;
    Some(tag[start..start + end].to_owned())
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
            })
        })
        .take(8)
        .collect()
}

fn decode_ddg_url(href: &str) -> String {
    let href = href.trim();
    let href = href
        .strip_prefix("//")
        .map(|rest| format!("https://{rest}"))
        .unwrap_or_else(|| href.to_owned());
    if let Ok(url) = Url::parse(&href) {
        if let Some((_, encoded)) = url.query_pairs().find(|(key, _)| key == "uddg") {
            return encoded.into_owned();
        }
    }
    href
}

fn strip_tags(value: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in value.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn decode_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_duckduckgo_result_cards() {
        let html = r#"
            <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwiki.biligame.com%2Fsr%2Ffeixiao">飞霄 遗器推荐</a>
            <a class="result__snippet">四件套建议使用 <b>奔狼</b> 的功勋。</a>
            <a href="https://www.miyoushe.com/sr/article/1" class="result__a">米游社飞霄</a>
        "#;
        let hits = parse_duckduckgo_html(html);
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].url, "https://wiki.biligame.com/sr/feixiao");
        assert_eq!(hits[0].title, "飞霄 遗器推荐");
        assert!(hits[0].snippet.contains("奔狼"));
        assert_eq!(hits[1].url, "https://www.miyoushe.com/sr/article/1");
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
}
