use reqwest::Url;

use super::http::AdvisorHttp;
use crate::error::AppError;

const MAX_PAGE_CHARS: usize = 6000;

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
    let text = client
        .get_text(
            &jina,
            &[("Accept", "text/plain"), ("X-Return-Format", "markdown")],
        )
        .await?;
    let trimmed = collapse_whitespace(&text);
    if trimmed.chars().count() < 40 {
        return Err(AppError::Advisor(format!("页面内容过少：{url}")));
    }
    Ok(FetchedPage {
        title: title.trim().to_owned(),
        url: url.to_owned(),
        text: trimmed.chars().take(MAX_PAGE_CHARS).collect(),
    })
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
}
