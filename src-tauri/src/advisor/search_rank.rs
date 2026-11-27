use std::collections::HashSet;

use super::search::{SearchContext, SearchHit};

const HIGH_TRUST_HOSTS: &[&str] = &[
    "prydwen.gg",
    "hoyolab.com",
    "miyoushe.com",
    "bbs.mihoyo.com",
    "wiki.biligame.com",
    "icy-veins.com",
    "game8.co",
    "gamersky.com",
    "taptap.cn",
    "kocpc.com.tw",
    "forum.gamer.com.tw",
    "nga.cn",
    "bbs.nga.cn",
    "4399.com",
    "3dmgame.com",
];

const BLOCKED_HOSTS: &[&str] = &["finance.yahoo.com", "tavily.com", "linkedin.com"];
const VIDEO_HOSTS: &[&str] = &["bilibili.com/video", "youtube.com/watch", "youtu.be/"];

pub fn build_zh_query(display_name: &str, hints: &[&str]) -> String {
    let normalized = display_name
        .trim()
        .replace("LV. ", "LV.")
        .replace("Lv. ", "Lv.");
    let alias = match normalized.as_str() {
        "开拓者·欢愉" => "开拓者 欢愉主",
        "开拓者·记忆" => "开拓者 记忆主",
        "开拓者·同谐" => "开拓者 同谐主",
        "开拓者·存护" => "开拓者 存护主",
        "开拓者·毁灭" => "开拓者 毁灭主",
        "三月七·巡猎" => "巡猎三月七",
        "三月七·存护" => "存护三月七",
        other => other,
    };
    let mut parts = vec!["崩坏星穹铁道", alias];
    for hint in hints {
        if !hint.trim().is_empty() {
            parts.push(hint.trim());
        }
    }
    parts.extend(["遗器", "套装", "词条", "配装攻略"]);
    parts.join(" ")
}

pub fn build_en_query(slug: &str, display_name: &str, hints: &[&str]) -> Option<String> {
    let en_name = english_character_name(slug, display_name)?;
    let extra = if hints.iter().any(|hint| hint.contains("加强")) {
        " buffed"
    } else {
        ""
    };
    Some(format!(
        "prydwen Honkai Star Rail {en_name}{extra} build relics"
    ))
}

fn english_character_name(slug: &str, display_name: &str) -> Option<String> {
    let key = slug.trim().to_ascii_lowercase();
    let mapped = match key.as_str() {
        "" => return None,
        "silverwolflv999" => "Silver Wolf LV 999",
        "silverwolf" => "Silver Wolf",
        "playerboy" | "playergirl" => "Trailblazer Destruction",
        "playerboy2" | "playergirl2" => "Trailblazer Preservation",
        "playerboy3" | "playergirl3" => "Trailblazer Harmony",
        "playerboy4" | "playergirl4" => "Trailblazer Remembrance",
        "playerboy5" | "playergirl5" => "Trailblazer Elation",
        "mar7th" => "March 7th Preservation",
        "mar7th2" => "March 7th Hunt",
        "sam" => "Firefly",
        "danhengil" => "Dan Heng Imbibitor Lunae",
        "danhengpt" => "Dan Heng Permansor Terrae",
        "theherta" => "The Herta",
        "drratio" => "Dr Ratio",
        "topaz" => "Topaz Numby",
        "jingyuan" => "Jing Yuan",
        "fuxuan" => "Fu Xuan",
        "ruanmei" => "Ruan Mei",
        "blackswan" => "Black Swan",
        "nihilux" => "Aha",
        "robinsummeretto" => "Robin Summeretto",
        "aventurinewaveflair" => "Aventurine Waveflair",
        "tohsakarin" => "Rin Tohsaka",
        _ if display_name == "千冶•刃" => "Blade SP",
        _ if display_name == "姬子•启行" => "Himeko SP",
        _ => return Some(key),
    };
    Some(mapped.to_owned())
}

pub(crate) fn rank_and_filter_hits(
    hits: Vec<SearchHit>,
    ctx: &SearchContext<'_>,
) -> Vec<SearchHit> {
    let mut seen = HashSet::new();
    let mut scored: Vec<(i32, usize, SearchHit)> = hits
        .into_iter()
        .enumerate()
        .filter(|(_, hit)| {
            let lower_url = hit.url.to_ascii_lowercase();
            !BLOCKED_HOSTS.iter().any(|host| lower_url.contains(host))
                && !is_wrong_variant_hit(hit, ctx)
                && seen.insert(canonical_url(&hit.url))
        })
        .map(|(index, hit)| (hit_priority(&hit, ctx), index, hit))
        .collect();
    scored.sort_by(|left, right| right.0.cmp(&left.0).then_with(|| left.1.cmp(&right.1)));
    scored.into_iter().take(8).map(|(_, _, hit)| hit).collect()
}

fn canonical_url(url: &str) -> String {
    url.split('#')
        .next()
        .unwrap_or(url)
        .split('?')
        .next()
        .unwrap_or(url)
        .trim_end_matches('/')
        .to_ascii_lowercase()
}

fn hit_priority(hit: &SearchHit, ctx: &SearchContext<'_>) -> i32 {
    let lower_url = hit.url.to_ascii_lowercase();
    let lower_title = hit.title.to_ascii_lowercase();
    let mut score = 0i32;

    if lower_url.contains("prydwen.gg/star-rail/characters/") {
        score += 45;
    } else if HIGH_TRUST_HOSTS.iter().any(|host| lower_url.contains(host)) {
        score += 24;
    }
    if VIDEO_HOSTS.iter().any(|host| lower_url.contains(host)) {
        let raw_len = hit.content.as_deref().map(str::len).unwrap_or(0);
        score += if raw_len > 6000 { -2 } else { -18 };
    }
    if let Some(content) = &hit.content {
        if content.chars().count() >= 800 {
            score += 14;
        } else if content.chars().count() >= 200 {
            score += 6;
        }
    }
    if hit.snippet.chars().count() >= 300 {
        score += 6;
    }
    if lower_title.contains("4.7")
        || lower_title.contains("4.6")
        || lower_title.contains("4.5")
        || lower_title.contains("updated")
        || lower_title.contains("加强")
    {
        score += 12;
    }
    if !ctx.path_zh.is_empty() && hit.title.contains(ctx.path_zh) {
        score += 8;
    }
    score
}

fn is_wrong_variant_hit(hit: &SearchHit, ctx: &SearchContext<'_>) -> bool {
    let url = hit.url.to_ascii_lowercase();
    let title = hit.title.to_ascii_lowercase();
    let combined = format!("{title} {url}");

    if ctx.slug.eq_ignore_ascii_case("silverwolflv999") {
        let is_sp = combined.contains("999")
            || combined.contains("狼尊")
            || combined.contains("sp银狼")
            || combined.contains("sp 银狼");
        if (combined.contains("silver-wolf")
            || combined.contains("silver wolf")
            || hit.title.contains("银狼"))
            && !is_sp
        {
            return true;
        }
    }
    if ctx.display_name == "三月七·巡猎"
        && (combined.contains("preservation") || hit.title.contains("存护"))
        && !combined.contains("hunt")
        && !hit.title.contains("巡猎")
    {
        return true;
    }
    if ctx.display_name == "三月七·存护"
        && (combined.contains("hunt") || hit.title.contains("巡猎"))
        && !combined.contains("preservation")
        && !hit.title.contains("存护")
    {
        return true;
    }
    false
}
