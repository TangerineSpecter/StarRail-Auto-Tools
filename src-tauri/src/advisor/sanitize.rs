use std::{collections::HashMap, sync::OnceLock};

use serde::Deserialize;
use serde_json::Value;

use super::parse::{AdvicePlanDraft, AdviceTarget};
use super::stat_aliases::{resolve_stat, slot_alias, MAIN_SLOTS, SUBSTAT_KEYS, TARGET_KEYS};

#[derive(Debug, Clone, Deserialize)]
struct RelicSetFile {
    sets: Vec<RelicSetEntry>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelicSetEffects {
    #[serde(default)]
    two_piece: String,
    #[serde(default)]
    four_piece: String,
}

#[derive(Debug, Clone, Deserialize)]
struct RelicSetEntry {
    id: u32,
    name: String,
    kind: String,
    #[serde(default)]
    effects: RelicSetEffects,
}

fn relic_sets() -> &'static [RelicSetEntry] {
    static SETS: OnceLock<Vec<RelicSetEntry>> = OnceLock::new();
    SETS.get_or_init(|| {
        serde_json::from_str::<RelicSetFile>(include_str!("../../../src/data/relic-sets.json"))
            .expect("bundled relic catalogue must be valid")
            .sets
    })
}

fn compact_effect(text: &str) -> String {
    text.replace(" %", "%")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("")
}

pub(crate) fn format_relic_set_line(set_id: u32) -> Option<String> {
    let set = relic_sets().iter().find(|entry| entry.id == set_id)?;
    let two = compact_effect(&set.effects.two_piece);
    if set.kind == "cavern" {
        let four = compact_effect(&set.effects.four_piece);
        Some(format!(
            "{} {}（外圈 | 2件:{two} | 4件:{four}）",
            set.id, set.name
        ))
    } else {
        Some(format!("{} {}（内圈 | 2件:{two}）", set.id, set.name))
    }
}

pub fn form_contract_text() -> String {
    let mut text = String::from("允许的洞窟套装 cavern（填 id，以下为当前版本实装效果）：\n");
    for set in relic_sets().iter().filter(|set| set.kind == "cavern") {
        let two = compact_effect(&set.effects.two_piece);
        let four = compact_effect(&set.effects.four_piece);
        text.push_str(&format!(
            "{} {} | 2件:{two} | 4件:{four}\n",
            set.id, set.name
        ));
    }
    text.push_str("允许的位面套装 planar（填 id，以下为当前版本实装效果）：\n");
    for set in relic_sets().iter().filter(|set| set.kind == "planar") {
        let two = compact_effect(&set.effects.two_piece);
        text.push_str(&format!("{} {} | 2件:{two}\n", set.id, set.name));
    }
    text.push_str(
        "cavernMode 只能是 fourPiece 或 twoPlusTwo。\n\
主词条键只能是 Body / Feet / PlanarSphere / LinkRope，值为英文键数组，4 个部位均至少填写 1 个可选主词条。\n\
targets.statKey 只能用：HP ATK DEF SPD CRIT Rate CRIT DMG Effect Hit Rate Effect RES Break Effect。\n\
substatWeights 键只能用百分比/功能副词条（HP% ATK% DEF% SPD CRIT Rate CRIT DMG Effect Hit Rate Effect RES Break Effect），值只能是 0 / 0.25 / 0.5 / 0.75 / 1，非零最多 5 个。\n\
effectiveSubstats 最多 5 个。targets 最多 3 条，minimum 不能高于 target。\n",
    );
    text
}

pub fn snap_weight(value: f64) -> f64 {
    if !value.is_finite() {
        return 0.0;
    }
    let snapped = (value / 0.25).round() * 0.25;
    snapped.clamp(0.0, 1.0)
}

fn resolve_set(raw: &Value, kind: &str) -> u32 {
    if let Some(id) = raw.as_u64() {
        return relic_sets()
            .iter()
            .find(|set| set.id == id as u32 && set.kind == kind)
            .map(|set| set.id)
            .unwrap_or(0);
    }
    let text = raw.as_str().unwrap_or("").trim();
    if text.is_empty() {
        return 0;
    }
    if let Ok(id) = text.parse::<u32>() {
        if let Some(set) = relic_sets()
            .iter()
            .find(|set| set.id == id && set.kind == kind)
        {
            return set.id;
        }
    }
    let pool: Vec<_> = relic_sets().iter().filter(|set| set.kind == kind).collect();
    if let Some(set) = pool.iter().find(|set| set.name == text) {
        return set.id;
    }
    let matches: Vec<_> = pool
        .iter()
        .filter(|set| set.name.contains(text) || text.contains(&set.name))
        .collect();
    if matches.len() == 1 {
        matches[0].id
    } else {
        0
    }
}

pub fn sanitize_plan(raw: &Value) -> AdvicePlanDraft {
    let object = raw.as_object();
    let get = |key: &str| {
        object
            .and_then(|map| map.get(key))
            .cloned()
            .unwrap_or(Value::Null)
    };
    let cavern_mode = match get("cavernMode").as_str() {
        Some("twoPlusTwo") => "twoPlusTwo",
        _ => "fourPiece",
    };
    let cavern_set_a = resolve_set(
        object
            .and_then(|map| {
                map.get("cavernSetA")
                    .or_else(|| map.get("cavernSet"))
                    .or_else(|| map.get("cavern"))
            })
            .unwrap_or(&Value::Null),
        "cavern",
    );
    let mut cavern_set_b = if cavern_mode == "twoPlusTwo" {
        resolve_set(&get("cavernSetB"), "cavern")
    } else {
        0
    };
    if cavern_set_b == 0 || cavern_set_b == cavern_set_a {
        cavern_set_b = 0;
    }
    let two_plus_two = cavern_mode == "twoPlusTwo" && cavern_set_b > 0 && cavern_set_a > 0;
    let mut plan = AdvicePlanDraft {
        cavern_mode: if two_plus_two {
            "twoPlusTwo".to_owned()
        } else {
            "fourPiece".to_owned()
        },
        cavern_set_a,
        cavern_set_b: if two_plus_two {
            Some(cavern_set_b)
        } else {
            None
        },
        planar_set_id: resolve_set(
            object
                .and_then(|map| map.get("planarSetId").or_else(|| map.get("planar")))
                .unwrap_or(&Value::Null),
            "planar",
        ),
        main_stats: sanitize_main_stats(&get("mainStats")),
        targets: sanitize_targets(&get("targets")),
        effective_substats: unique_stats(&get("effectiveSubstats"), SUBSTAT_KEYS, 5, true),
        substat_weights: sanitize_weights(&get("substatWeights")),
        min_potential_pct: {
            let value = get("minPotentialPct").as_f64().unwrap_or(40.0);
            ((value / 5.0).round() * 5.0).clamp(0.0, 100.0)
        },
        spd_target: get("spdTarget").as_f64().unwrap_or(0.0).max(0.0).round(),
        note: get("note")
            .as_str()
            .unwrap_or("")
            .trim()
            .chars()
            .take(500)
            .collect(),
    };
    align_effective_substats(&mut plan);
    plan
}

pub fn is_low_speed_cavern_set(set_id: u32) -> bool {
    relic_sets().iter().any(|set| {
        set.id == set_id
            && set.kind == "cavern"
            && set.effects.four_piece.contains("速度降低")
            && set.effects.four_piece.contains("速度小于")
    })
}

pub fn align_effective_substats(plan: &mut AdvicePlanDraft) {
    let mut weights: Vec<(String, f64)> = plan
        .substat_weights
        .iter()
        .filter(|(_, value)| **value > 0.0)
        .map(|(key, value)| (key.clone(), *value))
        .collect();
    weights.sort_by(|left, right| {
        right
            .1
            .partial_cmp(&left.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.0.cmp(&right.0))
    });
    let keys: Vec<String> = weights.into_iter().map(|(key, _)| key).take(5).collect();
    if !keys.is_empty() {
        plan.effective_substats = keys;
    }
}

fn sanitize_main_stats(raw: &Value) -> HashMap<String, Vec<String>> {
    let mut result = HashMap::new();
    for (slot, _) in MAIN_SLOTS {
        result.insert((*slot).to_owned(), Vec::new());
    }
    let Some(object) = raw.as_object() else {
        return result;
    };
    for (raw_slot, raw_stats) in object {
        let Some(slot) = slot_alias(raw_slot) else {
            continue;
        };
        let allowed = MAIN_SLOTS
            .iter()
            .find(|(name, _)| *name == slot)
            .map(|(_, stats)| *stats)
            .unwrap_or(&[]);
        let values = match raw_stats {
            Value::String(text) => vec![text.clone()],
            Value::Array(items) => items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect(),
            _ => Vec::new(),
        };
        result.insert(
            slot.to_owned(),
            unique_stat_list(&values, allowed, allowed.len(), true),
        );
    }
    result
}

fn sanitize_targets(raw: &Value) -> Vec<AdviceTarget> {
    let Some(items) = raw.as_array() else {
        return Vec::new();
    };
    let mut targets = Vec::new();
    for item in items {
        if targets.len() >= 3 {
            break;
        }
        let stat_key = item
            .get("statKey")
            .or_else(|| item.get("stat"))
            .and_then(Value::as_str)
            .and_then(|value| resolve_stat(value, TARGET_KEYS, false));
        let Some(stat_key) = stat_key else {
            continue;
        };
        let target = item
            .get("target")
            .and_then(Value::as_f64)
            .unwrap_or(0.0)
            .max(0.0);
        let mut minimum = item
            .get("minimum")
            .or_else(|| item.get("min"))
            .and_then(Value::as_f64)
            .unwrap_or(0.0)
            .max(0.0);
        if minimum > target {
            minimum = target;
        }
        targets.push(AdviceTarget {
            stat_key: stat_key.to_owned(),
            target,
            minimum,
            priority: (targets.len() as u32) + 1,
        });
    }
    targets
}

fn sanitize_weights(raw: &Value) -> HashMap<String, f64> {
    let mut weights = Vec::new();
    if let Some(object) = raw.as_object() {
        for (raw_key, raw_value) in object {
            let Some(key) = resolve_stat(raw_key, SUBSTAT_KEYS, true) else {
                continue;
            };
            let value = snap_weight(raw_value.as_f64().unwrap_or(0.0));
            if value <= 0.0 {
                continue;
            }
            weights.push((key.to_owned(), value));
        }
    }
    weights.sort_by(|left, right| {
        right
            .1
            .partial_cmp(&left.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.0.cmp(&right.0))
    });
    weights.truncate(5);
    weights.into_iter().collect()
}

fn unique_stats(raw: &Value, allowed: &[&str], limit: usize, prefer_percent: bool) -> Vec<String> {
    let values = match raw {
        Value::Array(items) => items
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
        _ => Vec::new(),
    };
    unique_stat_list(&values, allowed, limit, prefer_percent)
}

fn unique_stat_list(
    values: &[String],
    allowed: &[&str],
    limit: usize,
    prefer_percent: bool,
) -> Vec<String> {
    let mut next = Vec::new();
    for value in values {
        let Some(key) = resolve_stat(value, allowed, prefer_percent) else {
            continue;
        };
        if next.iter().any(|item| item == key) {
            continue;
        }
        next.push(key.to_owned());
        if next.len() >= limit {
            break;
        }
    }
    next
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn snaps_weights_and_maps_chinese_names() {
        let plan = sanitize_plan(&json!({
            "cavernMode": "fourPiece",
            "cavern": "云无留迹的过客",
            "planar": "太空封印站",
            "mainStats": { "躯干": "暴击率", "Feet": ["SPD"], "PlanarSphere": ["生命"] },
            "substatWeights": { "暴击率": 0.3, "暴击伤害": 0.4, "SPD": 1, "攻击": 0.5 },
            "targets": [{ "statKey": "速度", "target": 134, "minimum": 200 }, { "statKey": "攻击力", "target": 3000, "minimum": 2600 }]
        }));
        assert_eq!(plan.cavern_set_a, 101);
        assert_eq!(plan.planar_set_id, 301);
        assert_eq!(
            plan.main_stats.get("Body").unwrap(),
            &vec!["CRIT Rate".to_owned()]
        );
        assert_eq!(
            plan.main_stats.get("PlanarSphere").unwrap(),
            &vec!["HP%".to_owned()]
        );
        assert_eq!(plan.substat_weights.get("CRIT Rate"), Some(&0.25));
        assert_eq!(plan.substat_weights.get("CRIT DMG"), Some(&0.5));
        assert_eq!(plan.substat_weights.get("ATK%"), Some(&0.5));
        assert_eq!(plan.targets[0].stat_key, "SPD");
        assert_eq!(plan.targets[0].minimum, 134.0);
        assert_eq!(plan.targets[1].stat_key, "ATK");
        assert_eq!(plan.effective_substats[0], "SPD");
    }

    #[test]
    fn maps_english_shorthand_aliases_for_link_rope_and_body() {
        let plan = sanitize_plan(&json!({
            "mainStats": {
                "Body": ["Outgoing Healing", "CRIT Rate"],
                "Feet": ["Speed"],
                "PlanarSphere": ["Quantum DMG", "HP%"],
                "LinkRope": ["Energy Regen Rate", "ERR"]
            }
        }));
        assert_eq!(
            plan.main_stats.get("Body").unwrap(),
            &vec!["Outgoing Healing Boost".to_owned(), "CRIT Rate".to_owned()]
        );
        assert_eq!(
            plan.main_stats.get("Feet").unwrap(),
            &vec!["SPD".to_owned()]
        );
        assert_eq!(
            plan.main_stats.get("PlanarSphere").unwrap(),
            &vec!["Quantum DMG Boost".to_owned(), "HP%".to_owned()]
        );
        assert_eq!(
            plan.main_stats.get("LinkRope").unwrap(),
            &vec!["Energy Regeneration Rate".to_owned()]
        );
    }

    #[test]
    fn contract_text_includes_relic_effects_for_latest_sets() {
        let contract = form_contract_text();
        assert!(contract.contains("129 闪耀功勋的魔法少女"));
        assert!(contract.contains("欢愉伤害无视目标"));
        assert!(contract.contains("325 零号关卡朋克洛德"));
        assert!(contract.contains("127 再创天地的救世主"));
    }
}
