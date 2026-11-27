use std::collections::HashMap;

use super::profile_data::{
    collect_character_abilities, find_catalogue_entry, render_ability_text, summarize_minor_traces,
    MechanicAbility,
};
use super::set_candidates::{infer_candidate_sets, CandidateSetHint};

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
    pub path_zh: String,
    pub element: String,
    pub base_hp: Option<f64>,
    pub base_atk: Option<f64>,
    pub base_def: Option<f64>,
    pub base_speed: Option<f64>,
    pub minor_trace_summary: Vec<String>,
    pub is_elation: bool,
    pub scaling_mode: ScalingMode,
    pub low_speed_preferred: bool,
    pub reworked: bool,
    pub disallowed_substats: Vec<&'static str>,
    pub disallowed_main_stats: Vec<&'static str>,
    pub search_hints: Vec<&'static str>,
    pub guidance_notes: Vec<String>,
    pub skill_summary: Vec<String>,
    pub candidate_sets: Vec<CandidateSetHint>,
}

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
    let resolved_path = entry.map(|item| item.path.clone()).unwrap_or_default();
    let base_stats = entry.and_then(|item| item.base_stats.as_ref());
    let base_speed = base_stats.and_then(|stats| stats.speed);
    let abilities = collect_character_abilities(character_id);
    let is_elation =
        resolved_path == "欢愉" || abilities.iter().any(|ability| ability.slot == "elation");
    let reworked = detect_reworked_character(&abilities);
    let mut scaling_mode = infer_scaling_mode(&abilities, &resolved_path);
    let low_speed_preferred = infer_low_speed_preferred(&abilities, base_speed, &resolved_path);
    let mut search_hints = Vec::new();
    let mut guidance_notes = Vec::new();

    if reworked {
        search_hints.push("加强后");
        guidance_notes
            .push("该角色存在版本加强/改版记录，请优先参考加强后的最新攻略与机制。".to_owned());
    }
    if is_elation {
        guidance_notes.push(
            "该角色为欢愉命途：欢愉伤害主要受欢愉度、双暴、无视防御与易伤影响，常规欢愉伤害不吃属性伤害提高（位面球优先按大行迹转模属性或生存/攻击选择，而非强求属性增伤球）；请严格依据大行迹中的属性转模门槛设定主词条、副词条权重与目标面板。"
                .to_owned(),
        );
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
    let candidate_sets = infer_candidate_sets(
        &abilities,
        &resolved_path,
        scaling_mode,
        is_elation,
        low_speed_preferred,
        base_speed,
    );
    let minor_trace_summary = entry
        .map(|item| summarize_minor_traces(&item.trace_stats))
        .unwrap_or_default();

    CharacterAdvisorProfile {
        character_id,
        path_zh: resolved_path,
        element: resolved_element,
        base_hp: base_stats.and_then(|stats| stats.hp),
        base_atk: base_stats.and_then(|stats| stats.attack),
        base_def: base_stats.and_then(|stats| stats.defense),
        base_speed,
        minor_trace_summary,
        is_elation,
        scaling_mode,
        low_speed_preferred,
        reworked,
        disallowed_substats,
        disallowed_main_stats,
        search_hints,
        guidance_notes,
        skill_summary,
        candidate_sets,
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

fn infer_scaling_mode(abilities: &[&MechanicAbility], path_zh: &str) -> ScalingMode {
    if abilities.is_empty() {
        return ScalingMode::Standard;
    }
    let core_text = join_rendered_descriptions(abilities, |slot| {
        matches!(
            slot,
            "skill" | "ult" | "talent" | "elation" | "memospriteSkill" | "memospriteTalent"
        )
    });
    let full_text = join_rendered_descriptions(abilities, |slot| {
        matches!(
            slot,
            "basic"
                | "skill"
                | "ult"
                | "talent"
                | "trace"
                | "elation"
                | "memospriteSkill"
                | "memospriteTalent"
        )
    });
    if core_text.is_empty() {
        return ScalingMode::Standard;
    }

    let dot_keyword_hits = ["触电", "风化", "灼烧", "裂伤"]
        .into_iter()
        .map(|keyword| core_text.matches(keyword).count())
        .sum::<usize>();
    if path_zh == "虚无"
        && (core_text.contains("持续伤害") || dot_keyword_hits >= 2)
        && !full_text.contains("暴击")
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

    let scales_hp = scales_on_self_stat(&core_text, "生命上限");
    let scales_atk = scales_on_self_stat(&core_text, "攻击力");
    let scales_def = scales_on_self_stat(&core_text, "防御力");
    if scales_hp && !scales_atk && !scales_def {
        ScalingMode::HpOnly
    } else if scales_def && !scales_atk && !scales_hp {
        ScalingMode::DefOnly
    } else {
        ScalingMode::Standard
    }
}

fn infer_low_speed_preferred(
    abilities: &[&MechanicAbility],
    base_speed: Option<f64>,
    path_zh: &str,
) -> bool {
    let Some(speed) = base_speed else {
        return false;
    };
    if speed > 95.0 {
        return false;
    }
    let trace_text = join_rendered_descriptions(abilities, |slot| slot == "trace");
    if trace_text.contains("速度大于等于") || trace_text.contains("速度高于") {
        return false;
    }
    let core_text = join_rendered_descriptions(abilities, |slot| {
        matches!(
            slot,
            "skill" | "ult" | "talent" | "memospriteSkill" | "memospriteTalent"
        )
    });
    let is_counter = core_text.contains("反击") && !core_text.contains("境界");
    let is_slow_remembrance_hp = path_zh == "记忆"
        && scales_on_self_stat(&core_text, "生命上限")
        && !scales_on_self_stat(&core_text, "攻击力");
    is_counter || is_slow_remembrance_hp
}

pub(crate) fn join_rendered_descriptions(
    abilities: &[&MechanicAbility],
    predicate: impl Fn(&str) -> bool,
) -> String {
    let mut seen_traces: Vec<&str> = Vec::new();
    let mut parts = Vec::new();
    for ability in abilities {
        if !predicate(&ability.slot) || ability.name.ends_with("强化") {
            continue;
        }
        if ability.slot == "trace" && !ability.name.is_empty() {
            if seen_traces.contains(&ability.name.as_str()) {
                continue;
            }
            seen_traces.push(ability.name.as_str());
        }
        parts.push(render_ability_text(ability));
    }
    parts.join("\n")
}

fn scales_on_self_stat(text: &str, stat: &str) -> bool {
    let mut cursor = 0;
    while let Some(pos) = text[cursor..].find("等同于") {
        let start = cursor + pos + "等同于".len();
        let clause_end = text[start..]
            .find(['，', '。', '；', '\n'])
            .map(|offset| start + offset)
            .unwrap_or(text.len());
        let clause = &text[start..clause_end];
        if clause.chars().count() <= 32 && clause.contains(stat) && !is_target_stat_clause(clause) {
            return true;
        }
        cursor = start;
    }
    let marker = format!("{stat}的");
    let mut pos_cursor = 0;
    while let Some(pos) = text[pos_cursor..].find(&marker) {
        let abs = pos_cursor + pos;
        let prefix_start = text[..abs].rfind(['，', '。', '；', '\n']).unwrap_or(0);
        let prefix = &text[prefix_start..abs];
        let after = &text[abs + marker.len()..];
        let starts_with_digit = after.chars().next().is_some_and(|ch| ch.is_ascii_digit());
        if starts_with_digit && !is_target_stat_clause(prefix) {
            return true;
        }
        pos_cursor = abs + marker.len();
    }
    false
}

fn is_target_stat_clause(clause: &str) -> bool {
    clause.contains("目标")
        || clause.contains("敌方")
        || clause.contains("敌人")
        || clause.contains("损失的生命")
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
    let mut seen: Vec<(&str, &str)> = Vec::new();
    let mut summary = Vec::new();
    let slot_priority = [
        ("trace", "大行迹"),
        ("elation", "欢愉技"),
        ("talent", "天赋"),
        ("ult", "终结技"),
        ("skill", "战技"),
        ("memospriteSkill", "忆灵技"),
        ("memospriteTalent", "忆灵天赋"),
    ];
    for (target_slot, slot_label) in slot_priority {
        for ability in abilities {
            if ability.slot != target_slot || ability.name.ends_with("强化") {
                continue;
            }
            let name = ability.name.trim();
            if !name.is_empty() && seen.contains(&(target_slot, name)) {
                continue;
            }
            if !name.is_empty() {
                seen.push((target_slot, name));
            }
            let rendered = render_ability_text(ability);
            if rendered.is_empty() {
                continue;
            }
            let entry = if name.is_empty() {
                format!("[{slot_label}] {rendered}")
            } else {
                format!("[{slot_label}] {name}：{rendered}")
            };
            summary.push(entry.chars().take(190).collect());
            if summary.len() >= 8 {
                return summary;
            }
        }
    }
    summary
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn automatically_derives_hp_def_and_elation_profiles_accurately() {
        let castorice = resolve_profile(1407, "遐蝶", "castorice", "量子");
        assert_eq!(castorice.scaling_mode, ScalingMode::HpOnly);
        assert!(castorice.low_speed_preferred);
        assert!(castorice.disallowed_substats.contains(&"ATK%"));

        let mydei = resolve_profile(1404, "万敌", "mydei", "虚数");
        assert_eq!(mydei.scaling_mode, ScalingMode::HpOnly);
        assert!(!mydei.low_speed_preferred);

        let pearl = resolve_profile(1503, "真珠", "pearl", "冰");
        assert_eq!(pearl.scaling_mode, ScalingMode::DefOnly);
        assert!(pearl.is_elation);
        assert!(pearl.skill_summary.iter().any(|line| line.contains("2400")));

        let aha = resolve_profile(1511, "星神★阿哈", "nihilux", "量子");
        assert_eq!(aha.scaling_mode, ScalingMode::Standard);
        assert!(!aha.low_speed_preferred);
        assert!(aha.is_elation);
        assert!(aha.skill_summary.iter().any(|line| line.contains("125")));

        let sw999 = resolve_profile(1506, "银狼LV. 999", "silverwolflv999", "虚数");
        assert!(sw999.is_elation);
        assert!(sw999
            .skill_summary
            .iter()
            .any(|line| line.contains("160") && line.contains("50%")));
    }

    #[test]
    fn does_not_misclassify_serval_or_hook_as_dot_and_keeps_real_dot() {
        let serval = resolve_profile(1103, "希露瓦", "serval", "雷");
        assert_eq!(serval.scaling_mode, ScalingMode::Standard);

        let hook = resolve_profile(1109, "虎克", "hook", "火");
        assert_eq!(hook.scaling_mode, ScalingMode::Standard);

        let kafka = resolve_profile(1005, "卡芙卡", "kafka", "雷");
        assert_eq!(kafka.scaling_mode, ScalingMode::Dot);
        assert!(kafka.reworked);
        assert!(kafka
            .skill_summary
            .iter()
            .any(|line| line.contains("75%") && line.contains("100%")));

        let hysilens = resolve_profile(1410, "海瑟音", "hysilens", "物理");
        assert_eq!(hysilens.scaling_mode, ScalingMode::Dot);
    }

    #[test]
    fn keeps_multi_path_rework_and_counter_characters_accurate() {
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
