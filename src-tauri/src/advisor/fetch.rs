use std::collections::BTreeSet;
use std::time::Duration;

use reqwest::Url;

use super::http::AdvisorHttp;
use crate::error::AppError;

const MAX_PAGE_CHARS: usize = 5000;
const MIN_PAGE_CHARS: usize = 40;
const SINGLE_PAGE_TIMEOUT: Duration = Duration::from_secs(6);
const BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const RELEVANT_KEYWORDS: &[(&str, usize)] = &[
    ("遗器", 5),
    ("位面饰品", 5),
    ("位面", 3),
    ("外圈", 5),
    ("内圈", 5),
    ("四件套", 4),
    ("二件套", 4),
    ("套装", 4),
    ("主词条", 5),
    ("副词条", 5),
    ("词条", 3),
    ("毕业面板", 5),
    ("毕业", 3),
    ("面板", 3),
    ("躯干", 3),
    ("脚部", 3),
    ("位面球", 3),
    ("连结绳", 3),
    ("配装", 4),
    ("速度", 2),
    ("阈值", 3),
    ("欢愉", 2),
    ("加强", 2),
    ("best relic", 6),
    ("relic set", 5),
    ("relics", 4),
    ("planar ornament", 6),
    ("planar", 4),
    ("main stat", 6),
    ("substat", 6),
    ("endgame stat", 6),
    ("best build", 5),
    ("body:", 4),
    ("feet:", 4),
    ("sphere:", 4),
    ("rope:", 4),
    ("spd", 2),
    ("crit", 2),
    ("elation", 2),
    ("4.7", 3),
    ("4.6", 2),
    ("4.5", 2),
    ("4.4", 2),
    ("4.3", 2),
    ("4.2", 2),
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FetchedPage {
    pub title: String,
    pub url: String,
    pub text: String,
}

pub fn reference_urls(name: &str, display_name: &str) -> Vec<(String, String)> {
    let mut pages = Vec::new();
    // For multi-path characters (开拓者·记忆, 三月七·巡猎), query the path-specific
    // wiki guide page instead of the base character page to prevent cross-path bleed.
    let wiki_target = normalize_wiki_title(if display_name.contains('·') {
        display_name
    } else {
        name
    });
    if !wiki_target.is_empty() {
        if let Ok(mut url) = Url::parse("https://wiki.biligame.com/") {
            if url
                .path_segments_mut()
                .map(|mut segments| {
                    segments.clear();
                    segments.extend(["sr", wiki_target.as_str()]);
                })
                .is_ok()
            {
                pages.push((format!("哔哩哔哩 Wiki · {wiki_target}"), url.to_string()));
            }
        }
    }
    pages
}

fn normalize_wiki_title(raw: &str) -> String {
    raw.trim()
        .replace("LV. ", "LV.")
        .replace("Lv. ", "Lv.")
        .replace('·', "•")
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
    let raw_body = tokio::time::timeout(
        SINGLE_PAGE_TIMEOUT,
        client.get_text(
            url,
            &[
                ("User-Agent", BROWSER_USER_AGENT),
                ("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"),
                ("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8"),
            ],
        ),
    )
    .await
    .map_err(|_| AppError::Advisor("页面抓取超时".to_owned()))??;

    let looks_html = {
        let head = raw_body.trim_start();
        head.starts_with('<') || head.contains("<html") || head.contains("<body")
    };
    let plain = if looks_html {
        extract_html_text(&raw_body)
    } else {
        collapse_whitespace(&raw_body)
    };
    if plain.chars().count() < MIN_PAGE_CHARS {
        return Err(AppError::Advisor(format!("页面内容过少：{url}")));
    }
    let relevant = extract_relevant_passages(&plain, MAX_PAGE_CHARS);
    Ok(FetchedPage {
        title: title.trim().to_owned(),
        url: url.to_owned(),
        text: relevant,
    })
}

/// Extract the highest-density build/relic/stat passages from long scraped or
/// Tavily `raw_content` pages, keeping original ordering and surrounding context
/// instead of naively truncating to the top navigation/sidebar boilerplate.
pub(crate) fn extract_relevant_passages(raw: &str, max_chars: usize) -> String {
    let lines: Vec<String> = raw
        .lines()
        .map(clean_line)
        .filter(|line| !line.is_empty() && !is_boilerplate_line(line))
        .collect();
    if lines.is_empty() {
        return String::new();
    }
    let total_chars: usize = lines.iter().map(|line| line.chars().count() + 1).sum();
    if total_chars <= max_chars {
        return lines.join("\n");
    }

    // Group lines into small blocks (~350 chars each) so keyword hits preserve local tables/lists.
    let mut blocks: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut current_chars = 0usize;
    for line in &lines {
        let len = line.chars().count();
        if current_chars > 0 && current_chars + len + 1 > 360 {
            blocks.push(std::mem::take(&mut current));
            current_chars = 0;
        }
        if !current.is_empty() {
            current.push('\n');
            current_chars += 1;
        }
        current.push_str(line);
        current_chars += len;
    }
    if !current.is_empty() {
        blocks.push(current);
    }

    let mut scored: Vec<(usize, usize)> = blocks
        .iter()
        .enumerate()
        .map(|(index, block)| (index, score_block(block)))
        .collect();

    let max_score = scored.iter().map(|(_, score)| *score).max().unwrap_or(0);
    if max_score == 0 {
        return take_prefix_blocks(&blocks, max_chars);
    }

    scored.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0)));

    let mut selected = BTreeSet::new();
    let mut budget = 0usize;
    // Always keep the opening summary/title block if small so version/date context survives.
    if let Some(first) = blocks.first() {
        let len = first.chars().count() + 1;
        if len <= max_chars / 5 {
            selected.insert(0);
            budget += len;
        }
    }

    for (index, score) in scored {
        if score == 0 {
            break;
        }
        // Pull the hit block plus its immediate following block (tables/values often follow headings).
        for neighbor in [index, index + 1] {
            if neighbor >= blocks.len() || selected.contains(&neighbor) {
                continue;
            }
            let len = blocks[neighbor].chars().count() + 1;
            if budget + len > max_chars {
                continue;
            }
            selected.insert(neighbor);
            budget += len;
        }
        if budget + 180 >= max_chars {
            break;
        }
    }

    let joined: String = selected
        .into_iter()
        .map(|index| blocks[index].as_str())
        .collect::<Vec<_>>()
        .join("\n");
    joined.chars().take(max_chars).collect()
}

fn take_prefix_blocks(blocks: &[String], max_chars: usize) -> String {
    let mut out = String::new();
    let mut used = 0usize;
    for block in blocks {
        let len = block.chars().count();
        if used + len + 1 > max_chars {
            break;
        }
        if !out.is_empty() {
            out.push('\n');
            used += 1;
        }
        out.push_str(block);
        used += len;
    }
    if out.is_empty() {
        blocks
            .first()
            .map(|first| first.chars().take(max_chars).collect())
            .unwrap_or_default()
    } else {
        out
    }
}

fn score_block(block: &str) -> usize {
    let lower = block.to_ascii_lowercase();
    let mut score = 0usize;
    for (keyword, weight) in RELEVANT_KEYWORDS {
        if keyword.is_ascii() {
            if lower.contains(keyword) {
                score += *weight;
            }
        } else if block.contains(keyword) {
            score += *weight;
        }
    }
    score
}

fn clean_line(line: &str) -> String {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    // Strip markdown image tags `![alt](url)` that bloat Tavily raw_content.
    let mut out = String::with_capacity(trimmed.len());
    let mut rest = trimmed;
    while let Some(pos) = rest.find("![") {
        out.push_str(&rest[..pos]);
        let after = &rest[pos + 2..];
        if let Some(mid) = after.find("](") {
            let after_mid = &after[mid + 2..];
            if let Some(close) = after_mid.find(')') {
                rest = &after_mid[close + 1..];
                continue;
            }
        }
        out.push_str("![");
        rest = after;
    }
    out.push_str(rest);
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn is_boilerplate_line(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return true;
    }
    if line.chars().count() <= 2 {
        return true;
    }
    lower.contains("cookie policy")
        || lower.contains("privacy policy")
        || lower.contains("all rights reserved")
        || lower.starts_with("skip to content")
}

pub fn extract_html_text(html: &str) -> String {
    let cleaned = strip_ignored_blocks(html);
    let mut out = String::with_capacity(cleaned.len().min(MAX_PAGE_CHARS * 4));
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
    for tag in ["script", "style", "noscript", "svg", "nav", "footer"] {
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
    fn normalizes_wiki_urls_and_separates_multi_path_characters() {
        let sw = reference_urls("银狼LV. 999", "银狼LV. 999");
        assert_eq!(sw.len(), 1);
        assert!(sw[0].0.contains("银狼LV.999"));
        assert!(!sw[0].1.contains("%20"));

        let tb = reference_urls("开拓者", "开拓者·记忆");
        assert!(tb[0].0.contains("开拓者•记忆"));
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

    #[test]
    fn extracts_build_sections_from_long_pages_instead_of_top_boilerplate() {
        let mut long_doc = String::from("Intro header v4.7 guide\n");
        for i in 0..120 {
            long_doc.push_str(&format!(
                "Navigation menu item {i} unrelated lore and sidebar links for testing length.\n"
            ));
        }
        long_doc.push_str("## Best Relic Sets & Planar Ornaments\n");
        long_doc.push_str("1. 4pc Magical Girl of Shining Feats\n2. 2pc Punklorde Stage Zero\n");
        long_doc.push_str("Main Stats: Body: CRIT Rate, Feet: SPD, Sphere: HP%, Rope: HP%\n");
        long_doc.push_str("Substats: SPD >= CRIT Rate = CRIT DMG\n");

        let extracted = extract_relevant_passages(&long_doc, 1200);
        assert!(extracted.contains("Best Relic Sets"));
        assert!(extracted.contains("Punklorde Stage Zero"));
        assert!(extracted.contains("Main Stats"));
    }
}
