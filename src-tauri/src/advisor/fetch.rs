use reqwest::Url;

use super::http::AdvisorHttp;
use crate::error::AppError;

const MAX_PAGE_CHARS: usize = 6000;
const MIN_PAGE_CHARS: usize = 40;
const BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FetchedPage {
    pub title: String,
    pub url: String,
    pub text: String,
}

pub fn reference_urls(name: &str, slug: &str) -> Vec<(String, String)> {
    let mut pages = Vec::new();
    if !name.trim().is_empty() {
        if let Ok(mut url) = Url::parse("https://wiki.biligame.com/") {
            if url
                .path_segments_mut()
                .map(|mut segments| {
                    segments.clear();
                    segments.extend(["sr", name.trim()]);
                })
                .is_ok()
            {
                pages.push((format!("哔哩哔哩 Wiki · {name}"), url.to_string()));
            }
        }
    }
    if !slug.trim().is_empty() {
        pages.push((
            format!("Star Rail Station · {slug}"),
            format!("https://starrailstation.com/cn/characters/{}", slug.trim()),
        ));
    }
    pages
}

pub fn is_fetchable_url(url: &str) -> bool {
    let Ok(parsed) = Url::parse(url) else {
        return false;
    };
    if parsed.scheme() != "https" {
        return false;
    }
    let Some(host) = parsed.host_str() else {
        return false;
    };
    let host = host.to_ascii_lowercase();
    if host == "localhost" || host.ends_with(".localhost") || host == "0.0.0.0" {
        return false;
    }
    if host.parse::<std::net::IpAddr>().is_ok_and(is_private_ip) {
        return false;
    }
    true
}

pub async fn fetch_page<C: AdvisorHttp>(
    client: &C,
    title: &str,
    url: &str,
) -> Result<FetchedPage, AppError> {
    if !is_fetchable_url(url) {
        return Err(AppError::Advisor(format!("拒绝抓取不安全地址：{url}")));
    }
    let jina = format!("https://r.jina.ai/{url}");
    let jina_error = match client
        .get_text(
            &jina,
            &[("Accept", "text/plain"), ("X-Return-Format", "markdown")],
        )
        .await
    {
        Ok(text) => {
            let trimmed = collapse_whitespace(&text);
            if trimmed.chars().count() >= MIN_PAGE_CHARS {
                return Ok(FetchedPage {
                    title: title.trim().to_owned(),
                    url: url.to_owned(),
                    text: trimmed.chars().take(MAX_PAGE_CHARS).collect(),
                });
            }
            AppError::Advisor(format!("页面内容过少：{url}"))
        }
        Err(error) => error,
    };

    let direct_html = client
        .get_text(
            url,
            &[
                ("User-Agent", BROWSER_USER_AGENT),
                ("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"),
                ("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8"),
            ],
        )
        .await
        .map_err(|_| jina_error)?;
    let extracted = extract_html_text(&direct_html);
    if extracted.chars().count() < MIN_PAGE_CHARS {
        return Err(AppError::Advisor(format!("页面内容过少：{url}")));
    }
    Ok(FetchedPage {
        title: title.trim().to_owned(),
        url: url.to_owned(),
        text: extracted.chars().take(MAX_PAGE_CHARS).collect(),
    })
}

pub fn extract_html_text(html: &str) -> String {
    let cleaned = strip_ignored_blocks(html);
    let mut out = String::with_capacity(cleaned.len().min(MAX_PAGE_CHARS * 2));
    let mut in_tag = false;
    for ch in cleaned.chars() {
        match ch {
            '<' => {
                in_tag = true;
                out.push('\n');
            }
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    collapse_whitespace(&decode_html_entities(&out))
}

fn strip_ignored_blocks(html: &str) -> String {
    let mut current = html.to_owned();
    for tag in ["script", "style", "noscript", "svg"] {
        current = strip_tag_block(&current, tag);
    }
    current
}

fn strip_tag_block(html: &str, tag: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut out = String::with_capacity(html.len());
    let mut cursor = 0;
    while let Some(rel_start) = lower[cursor..].find(&open) {
        let start = cursor + rel_start;
        out.push_str(&html[cursor..start]);
        if let Some(rel_end) = lower[start..].find(&close) {
            cursor = start + rel_end + close.len();
        } else {
            return out;
        }
    }
    out.push_str(&html[cursor..]);
    out
}

fn decode_html_entities(value: &str) -> String {
    value
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn is_private_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(ip) => {
            ip.is_loopback()
                || ip.is_private()
                || ip.is_link_local()
                || ip.is_unspecified()
                || ip.octets()[0] == 169 && ip.octets()[1] == 254
        }
        std::net::IpAddr::V6(ip) => ip.is_loopback() || ip.is_unspecified(),
    }
}

fn collapse_whitespace(value: &str) -> String {
    value
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_wiki_and_station_urls() {
        let pages = reference_urls("飞霄", "feixiao");
        assert!(pages
            .iter()
            .any(|(_, url)| url.contains("wiki.biligame.com") && url.contains("%")));
        assert!(pages
            .iter()
            .any(|(_, url)| url == "https://starrailstation.com/cn/characters/feixiao"));
    }

    #[test]
    fn rejects_private_fetch_targets() {
        assert!(!is_fetchable_url("http://example.com"));
        assert!(!is_fetchable_url("https://127.0.0.1/secret"));
        assert!(!is_fetchable_url("https://169.254.169.254/latest"));
        assert!(is_fetchable_url("https://wiki.biligame.com/sr/飞霄"));
    }

    #[test]
    fn extracts_readable_text_from_html_pages() {
        let html = r#"
            <html>
                <head><style>.hidden { display: none; }</style></head>
                <body>
                    <script>window.__INIT__ = 1;</script>
                    <h1>遐蝶 遗器推荐</h1>
                    <p>四件套推荐使用哀歌覆国的诗人，位面饰品推荐谧宁拾骨地&amp;暴击伤害。</p>
                </body>
            </html>
        "#;
        let text = extract_html_text(html);
        assert!(text.contains("遐蝶 遗器推荐"));
        assert!(text.contains("哀歌覆国的诗人"));
        assert!(text.contains("谧宁拾骨地&暴击伤害"));
        assert!(!text.contains("__INIT__"));
        assert!(!text.contains("display: none"));
    }

    #[tokio::test]
    async fn falls_back_to_direct_fetch_when_jina_fails() {
        struct FallbackHttp;

        impl AdvisorHttp for FallbackHttp {
            async fn get_text(
                &self,
                url: &str,
                _headers: &[(&str, &str)],
            ) -> Result<String, AppError> {
                if url.starts_with("https://r.jina.ai/") {
                    return Err(AppError::Advisor("r.jina.ai 不可达".to_owned()));
                }
                Ok("<html><body><p>遐蝶 遗器搭配推荐：哀歌覆国的诗人四件套，谧宁拾骨地二件套，生命与暴伤词条优先。</p></body></html>".to_owned())
            }

            async fn post_json(
                &self,
                _url: &str,
                _headers: &[(&str, &str)],
                _body: &serde_json::Value,
            ) -> Result<String, AppError> {
                unreachable!()
            }
        }

        let page = fetch_page(
            &FallbackHttp,
            "哔哩哔哩 Wiki · 遐蝶",
            "https://wiki.biligame.com/sr/%E9%81%90%E8%9D%B6",
        )
        .await
        .expect("fallback fetch should succeed");
        assert!(page.text.contains("哀歌覆国的诗人"));
        assert_eq!(page.url, "https://wiki.biligame.com/sr/%E9%81%90%E8%9D%B6");
    }
}
