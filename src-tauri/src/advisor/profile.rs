use std::collections::HashMap;
use std::sync::OnceLock;

use serde::Deserialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScalingMode {
    Standard,
    HpOnly,
    DefOnly,
    Dot,
    BreakOnly,
}

impl ScalingMode {
    pub fn label_zh(self) -> &'static str {
        match self {
            Self::Standard => "常规倍率",
            Self::HpOnly => "纯生命上限倍率（不吃攻击力）",
            Self::DefOnly => "纯防御力倍率（不吃攻击力）",
            Self::Dot => "持续伤害（DoT，不吃双暴/击破）",
            Self::BreakOnly => "超击破体系（不吃双暴）",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct CharacterAdvisorProfile {
    pub character_id: u32,
    pub element: String,
    pub base_speed: Option<f64>,
    pub scaling_mode: ScalingMode,
    pub low_speed_preferred: bool,
    pub reworked: bool,
    pub disallowed_substats: Vec<&'static str>,
    pub disallowed_main_stats: Vec<&'static str>,
    pub search_hints: Vec<&'static str>,
    pub guidance_notes: Vec<String>,
    pub skill_summary: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct CharacterCatalogueFile {
    characters: Vec<CharacterCatalogueEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterCatalogueEntry {
    slug: String,
    name: String,
    #[serde(default)]
    element: String,
    #[serde(default)]
    base_stats: Option<CharacterBaseStats>,
}

#[derive(Debug, Deserialize)]
struct CharacterBaseStats {
    #[serde(default)]
    speed: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct MechanicsFile {
    abilities: Vec<MechanicAbility>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MechanicAbility {
    owner_id: String,
    #[serde(default)]
    slot: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    description_template: String,
}

/// Minimal overrides reserved strictly for reworked characters whose upstream
/// skill text in `catalogue-mechanics.json` still mixes pre-rework ATK phrasing
/// with post-rework traces. All newly synced characters derive automatically.
struct ReworkScalingOverride {
    character_id: u32,
    scaling_mode: ScalingMode,
    note: &'static str,
}

const REWORK_SCALING_OVERRIDES: &[ReworkScalingOverride] = &[
    ReworkScalingOverride {
        character_id: 1212, // 镜流（加强后改为纯生命倍率，上游基础技能文本仍残留旧版攻击力词条）
        scaling_mode: ScalingMode::HpOnly,
        note: "镜流在版本加强后已改为纯生命上限倍率，完全不吃攻击力，请忽略旧版攻击力配装攻略。",
    },
    ReworkScalingOverride {
        character_id: 1205, // 刃（加强后改为纯生命倍率，上游基础技能文本仍残留旧版攻生双倍率）
        scaling_mode: ScalingMode::HpOnly,
        note: "刃在版本加强后已改为纯生命上限倍率，不吃攻击力，请忽略旧版攻生双倍率攻略。",
    },
];

fn character_catalogue() -> &'static [CharacterCatalogueEntry] {
    static CATALOGUE: OnceLock<Vec<CharacterCatalogueEntry>> = OnceLock::new();
    CATALOGUE.get_or_init(|| {
        serde_json::from_str::<CharacterCatalogueFile>(include_str!(
            "../../../src/data/characters.json"
        ))
        .expect("bundled character catalogue must be valid")
        .characters
    })
}

fn mechanics_by_owner() -> &'static HashMap<String, Vec<MechanicAbility>> {
    static MECHANICS: OnceLock<HashMap<String, Vec<MechanicAbility>>> = OnceLock::new();
    MECHANICS.get_or_init(|| {
        let parsed = serde_json::from_str::<MechanicsFile>(include_str!(
            "../../../src/data/catalogue-mechanics.json"
        ))
        .expect("bundled mechanics catalogue must be valid");
        let mut grouped: HashMap<String, Vec<MechanicAbility>> = HashMap::new();
        for ability in parsed.abilities {
            if matches!(
                ability.slot.as_str(),
                "basic"
                    | "skill"
                    | "ult"
                    | "talent"
                    | "trace"
                    | "memospriteSkill"
                    | "memospriteTalent"
            ) && !ability.description_template.trim().is_empty()
            {
                grouped
                    .entry(ability.owner_id.clone())
                    .or_default()
                    .push(ability);
            }
        }
        grouped
    })
}

pub fn resolve_profile(
    character_id: u32,
    name: &str,
    slug: &str,
    element: &str,
) -> CharacterAdvisorProfile {
    let entry = find_catalogue_entry(slug, name);
    let resolved_element = if !element.trim().is_empty() {
        element.trim().to_owned()
    } else {
        entry.map(|item| item.element.clone()).unwrap_or_default()
    };
    let base_speed = entry
        .and_then(|item| item.base_stats.as_ref())
        .and_then(|stats| stats.speed);
    let abilities = collect_character_abilities(character_id);
    let reworked = detect_reworked_character(&abilities);
    let mut scaling_mode = infer_scaling_mode(&abilities);
    let low_speed_preferred = infer_low_speed_preferred(&abilities, base_speed);
    let mut search_hints = Vec::new();
    let mut guidance_notes = Vec::new();

    if reworked {
        search_hints.push("加强后");
        guidance_notes
            .push("该角色存在版本加强/改版记录，请优先参考加强后的最新攻略与机制。".to_owned());
    }
    if let Some(override_rule) = REWORK_SCALING_OVERRIDES
        .iter()
        .find(|item| item.character_id == character_id)
    {
        scaling_mode = override_rule.scaling_mode;
        guidance_notes.push(override_rule.note.to_owned());
    }
    if low_speed_preferred {
        guidance_notes
            .push("该角色偏低速或反击机制，常规流派不堆速度断点（spdTarget 填 0）。".to_owned());
    }

    let (disallowed_substats, disallowed_main_stats) = disallowed_stats_for(scaling_mode);
    let skill_summary = build_skill_summary(&abilities);

    CharacterAdvisorProfile {
        character_id,
        element: resolved_element,
        base_speed,
        scaling_mode,
        low_speed_preferred,
        reworked,
        disallowed_substats,
        disallowed_main_stats,
        search_hints,
        guidance_notes,
        skill_summary,
    }
}

pub fn element_dmg_stat(element: &str) -> Option<&'static str> {
    match element.trim() {
        "物理" | "Physical" => Some("Physical DMG Boost"),
        "火" | "Fire" => Some("Fire DMG Boost"),
        "冰" | "Ice" => Some("Ice DMG Boost"),
        "雷" | "Lightning" => Some("Lightning DMG Boost"),
        "风" | "Wind" => Some("Wind DMG Boost"),
        "量子" | "Quantum" => Some("Quantum DMG Boost"),
        "虚数" | "Imaginary" => Some("Imaginary DMG Boost"),
        _ => None,
    }
}

fn find_catalogue_entry<'a>(slug: &str, name: &str) -> Option<&'a CharacterCatalogueEntry> {
    let trimmed_slug = slug.trim();
    if !trimmed_slug.is_empty() {
        if let Some(entry) = character_catalogue()
            .iter()
            .find(|item| item.slug.eq_ignore_ascii_case(trimmed_slug))
        {
            return Some(entry);
        }
    }
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return None;
    }
    let matches: Vec<_> = character_catalogue()
        .iter()
        .filter(|item| item.name == trimmed_name)
        .collect();
    if matches.len() == 1 {
        Some(matches[0])
    } else {
        None
    }
}

fn collect_character_abilities(character_id: u32) -> Vec<&'static MechanicAbility> {
    let map = mechanics_by_owner();
    let mut out = Vec::new();
    for owner_id in [
        format!("character:{character_id}"),
        format!("character:{character_id}/servant"),
    ] {
        if let Some(abilities) = map.get(&owner_id) {
            out.extend(abilities.iter());
        }
    }
    out
}

/// Detect buffed/reworked characters automatically: when upstream synced both
/// legacy and buffed traces for a character, the same major trace name appears
/// with two distinct descriptions.
fn detect_reworked_character(abilities: &[&MechanicAbility]) -> bool {
    let mut seen: HashMap<&str, &str> = HashMap::new();
    for ability in abilities {
        if ability.slot != "trace" || ability.name.ends_with("强化") || ability.name.is_empty() {
            continue;
        }
        if let Some(previous) =
            seen.insert(ability.name.as_str(), ability.description_template.as_str())
        {
            if previous != ability.description_template {
                return true;
            }
        }
    }
    false
}

fn infer_scaling_mode(abilities: &[&MechanicAbility]) -> ScalingMode {
    if abilities.is_empty() {
        return ScalingMode::Standard;
    }
    let core_text = join_descriptions(abilities, |slot| {
        matches!(
            slot,
            "skill" | "ult" | "talent" | "memospriteSkill" | "memospriteTalent"
        )
    });
    let full_text = join_descriptions(abilities, |slot| {
        matches!(
            slot,
            "basic" | "skill" | "ult" | "talent" | "trace" | "memospriteSkill" | "memospriteTalent"
        )
    });
    if core_text.is_empty() {
        return ScalingMode::Standard;
    }

    let dot_keyword_hits = ["触电", "风化", "灼烧", "裂伤"]
        .into_iter()
        .map(|keyword| core_text.matches(keyword).count())
        .sum::<usize>();
    if (core_text.contains("持续伤害") || dot_keyword_hits >= 2) && !full_text.contains("暴击")
    {
        return ScalingMode::Dot;
    }

    if (full_text.contains("超击破伤害")
        || (core_text.matches("击破特攻").count() >= 2 && !core_text.contains("暴击")))
        && !full_text.contains("暴击")
        && !full_text.contains("治疗")
        && !full_text.contains("护盾")
    {
        return ScalingMode::BreakOnly;
    }

    let scales_hp = scales_on_stat(&core_text, "生命上限");
    let scales_atk = scales_on_stat(&core_text, "攻击力");
    let scales_def = scales_on_stat(&core_text, "防御力");
    if scales_hp && !scales_atk && !scales_def {
        ScalingMode::HpOnly
    } else if scales_def && !scales_atk && !scales_hp {
        ScalingMode::DefOnly
    } else {
        ScalingMode::Standard
    }
}

fn infer_low_speed_preferred(abilities: &[&MechanicAbility], base_speed: Option<f64>) -> bool {
    let Some(speed) = base_speed else {
        return false;
    };
    if speed > 95.0 {
        return false;
    }
    let core_text = join_descriptions(abilities, |slot| {
        matches!(
            slot,
            "skill" | "ult" | "talent" | "memospriteSkill" | "memospriteTalent"
        )
    });
    // Low-speed counter-attackers (e.g., Clara, Yunli) or slow HP-scaling
    // Remembrance/Quantum kits designed for Poet of Mourning Collapse.
    core_text.contains("反击")
        || (scales_on_stat(&core_text, "生命上限") && !scales_on_stat(&core_text, "攻击力"))
}

fn join_descriptions(abilities: &[&MechanicAbility], predicate: impl Fn(&str) -> bool) -> String {
    abilities
        .iter()
        .filter(|ability| predicate(&ability.slot) && !ability.name.ends_with("强化"))
        .map(|ability| ability.description_template.as_str())
        .collect::<Vec<_>>()
        .join("\n")
}

/// Checks for HSR's standard Chinese scaling phrases such as
/// `等同于遐蝶{p1:percentInteger}生命上限` or `生命上限的{p1:percentInteger}`.
fn scales_on_stat(text: &str, stat: &str) -> bool {
    if text.contains(&format!("{stat}的{{p")) {
        return true;
    }
    let mut cursor = 0;
    while let Some(pos) = text[cursor..].find("等同于") {
        let start = cursor + pos + "等同于".len();
        let clause_end = text[start..]
            .find(['，', '。', '；', '\n'])
            .map(|offset| start + offset)
            .unwrap_or(text.len());
        let clause = &text[start..clause_end];
        if clause.chars().count() <= 36 && clause.contains(stat) {
            return true;
        }
        cursor = start;
    }
    false
}

fn disallowed_stats_for(mode: ScalingMode) -> (Vec<&'static str>, Vec<&'static str>) {
    match mode {
        ScalingMode::HpOnly | ScalingMode::DefOnly => (vec!["ATK", "ATK%"], vec!["ATK%"]),
        ScalingMode::Dot => (
            vec!["CRIT Rate", "CRIT DMG", "Break Effect"],
            vec!["CRIT Rate", "CRIT DMG", "Break Effect"],
        ),
        ScalingMode::BreakOnly => (vec!["CRIT Rate", "CRIT DMG"], vec!["CRIT Rate", "CRIT DMG"]),
        ScalingMode::Standard => (Vec::new(), Vec::new()),
    }
}

fn build_skill_summary(abilities: &[&MechanicAbility]) -> Vec<String> {
    let mut seen = Vec::new();
    let mut summary = Vec::new();
    for ability in abilities {
        if !matches!(
            ability.slot.as_str(),
            "basic" | "skill" | "ult" | "talent" | "memospriteSkill" | "memospriteTalent"
        ) {
            continue;
        }
        let name = ability.name.trim();
        if !name.is_empty() && seen.contains(&name) {
            continue;
        }
        if !name.is_empty() {
            seen.push(name);
        }
        let cleaned = simplify_template(&ability.description_template);
        let entry = if name.is_empty() {
            cleaned
        } else {
            format!("{name}：{cleaned}")
        };
        summary.push(entry.chars().take(120).collect());
        if summary.len() >= 6 {
            break;
        }
    }
    summary
}

fn simplify_template(template: &str) -> String {
    let mut out = String::with_capacity(template.len());
    let mut in_placeholder = false;
    for ch in template.chars() {
        match ch {
            '{' => {
                in_placeholder = true;
                out.push_str("一定比例");
            }
            '}' => in_placeholder = false,
            '\n' | '\r' if !in_placeholder => out.push(' '),
            _ if !in_placeholder => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn automatically_derives_hp_and_def_scaling_without_overrides() {
        let castorice = resolve_profile(1407, "遐蝶", "castorice", "量子");
        assert_eq!(castorice.scaling_mode, ScalingMode::HpOnly);
        assert!(castorice.low_speed_preferred);
        assert_eq!(castorice.base_speed, Some(95.0));
        assert!(castorice.disallowed_substats.contains(&"ATK%"));

        let mydei = resolve_profile(1404, "万敌", "mydei", "虚数");
        assert_eq!(mydei.scaling_mode, ScalingMode::HpOnly);
        assert!(mydei.disallowed_substats.contains(&"ATK%"));

        let aventurine = resolve_profile(1304, "砂金", "aventurine", "虚数");
        assert_eq!(aventurine.scaling_mode, ScalingMode::DefOnly);
        assert!(aventurine.disallowed_substats.contains(&"ATK%"));
    }

    #[test]
    fn automatically_derives_dot_break_and_reworked_characters() {
        let kafka = resolve_profile(1005, "卡芙卡", "kafka", "雷");
        assert_eq!(kafka.scaling_mode, ScalingMode::Dot);
        assert!(kafka.reworked);
        assert!(kafka.search_hints.contains(&"加强后"));

        let hysilens = resolve_profile(1410, "海瑟音", "hysilens", "物理");
        assert_eq!(hysilens.scaling_mode, ScalingMode::Dot);

        let firefly = resolve_profile(1310, "流萤", "sam", "火");
        assert_eq!(firefly.scaling_mode, ScalingMode::BreakOnly);
        assert!(firefly.disallowed_substats.contains(&"CRIT DMG"));

        let harmony_tb = resolve_profile(8005, "开拓者", "playerboy3", "虚数");
        assert_eq!(harmony_tb.scaling_mode, ScalingMode::BreakOnly);

        let silver_wolf = resolve_profile(1006, "银狼", "silverwolf", "量子");
        assert!(silver_wolf.reworked);
        assert!(silver_wolf.search_hints.contains(&"加强后"));
    }

    #[test]
    fn automatically_detects_counter_low_speed_and_keeps_multi_path_isolated() {
        let clara = resolve_profile(1107, "克拉拉", "clara", "物理");
        assert!(clara.low_speed_preferred);

        let jingliu = resolve_profile(1212, "镜流", "jingliu", "冰");
        assert_eq!(jingliu.scaling_mode, ScalingMode::HpOnly);
        assert!(jingliu.reworked);

        let march_hunt = resolve_profile(1224, "三月七", "mar7th2", "虚数");
        let march_pres = resolve_profile(1001, "三月七", "mar7th", "冰");
        assert_eq!(march_hunt.element, "虚数");
        assert_eq!(march_pres.element, "冰");
        assert_ne!(march_hunt.character_id, march_pres.character_id);
    }
}
