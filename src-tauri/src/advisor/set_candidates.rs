use super::fetch::FetchedPage;
use super::search::SearchHit;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GuideFreshness {
    Modern4x,
    Pre4xOrLegacy,
}

const MODERN_4X_KEYWORDS: &[&str] = &[
    "贪噬禁果",
    "天国@直播间",
    "星如我见",
    "叩问天工",
    "戏梦点星",
    "闪耀功勋",
    "应天涉远",
    "零号关卡",
    "千星荟萃",
    "坠星启航",
    "寰宇生研",
    "神的瞬息",
    "亚空异容",
    "edacious heretic",
    "tengoku",
    "diviner of distant reach",
    "magical girl",
    "punklorde",
    "v4.0",
    "v4.1",
    "v4.2",
    "v4.3",
    "v4.4",
    "v4.5",
    "v4.6",
    "v4.7",
    "4.5版本",
    "4.6版本",
    "4.7版本",
    "version 4.",
];

pub fn assess_guide_freshness(hits: &[SearchHit], pages: &[FetchedPage]) -> GuideFreshness {
    for hit in hits {
        if hit
            .published_at
            .as_deref()
            .is_some_and(|date| date.starts_with("2026-") || date.starts_with("2027-"))
        {
            return GuideFreshness::Modern4x;
        }
        if contains_4x_signal(&hit.title)
            || contains_4x_signal(&hit.snippet)
            || hit.content.as_deref().is_some_and(contains_4x_signal)
        {
            return GuideFreshness::Modern4x;
        }
    }
    for page in pages {
        if contains_4x_signal(&page.title) || contains_4x_signal(&page.text) {
            return GuideFreshness::Modern4x;
        }
    }
    GuideFreshness::Pre4xOrLegacy
}

fn contains_4x_signal(text: &str) -> bool {
    if text.is_empty() {
        return false;
    }
    let lower = text.to_ascii_lowercase();
    MODERN_4X_KEYWORDS
        .iter()
        .any(|keyword| lower.contains(keyword))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn distinguishes_legacy_guides_from_modern_4x_guides() {
        let old_hits = [SearchHit {
            title: "丹恒饮月遗器攻略 快枪手4件套+繁星竞技场".to_owned(),
            url: "https://example.com/dhil-old".to_owned(),
            snippet: "推荐野穗伴行的快枪手，或哀歌覆国的诗人".to_owned(),
            content: None,
            published_at: Some("2025-02-01".to_owned()),
        }];
        assert_eq!(
            assess_guide_freshness(&old_hits, &[]),
            GuideFreshness::Pre4xOrLegacy
        );

        let modern_hits = [SearchHit {
            title: "丹恒饮月 4.6 新套装实测".to_owned(),
            url: "https://example.com/dhil-46".to_owned(),
            snippet: "贪噬禁果的异端 4 件套".to_owned(),
            content: None,
            published_at: Some("2026-09-15".to_owned()),
        }];
        assert_eq!(
            assess_guide_freshness(&modern_hits, &[]),
            GuideFreshness::Modern4x
        );
    }
}
