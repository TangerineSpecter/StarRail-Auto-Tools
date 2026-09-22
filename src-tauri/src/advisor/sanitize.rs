use std::{collections::HashMap, sync::OnceLock};

use serde::Deserialize;
use serde_json::Value;

use super::parse::{AdvicePlanDraft, AdviceTarget};

#[derive(Debug, Clone, Deserialize)]
struct RelicSetFile {
    sets: Vec<RelicSetEntry>,
}

#[derive(Debug, Clone, Deserialize)]
struct RelicSetEntry {
    id: u32,
    name: String,
    kind: String,
}

const SUBSTAT_KEYS: &[&str] = &[
    "HP",
    "ATK",
    "DEF",
    "HP%",
    "ATK%",
    "DEF%",
    "SPD",
    "CRIT Rate",
    "CRIT DMG",
    "Effect Hit Rate",
    "Effect RES",
    "Break Effect",
];
const TARGET_KEYS: &[&str] = &[
    "HP",
    "ATK",
    "DEF",
    "SPD",
    "CRIT Rate",
    "CRIT DMG",
    "Effect Hit Rate",
    "Effect RES",
    "Break Effect",
];
const MAIN_SLOTS: &[(&str, &[&str])] = &[
    (
        "Body",
        &[
            "HP%",
            "ATK%",
            "DEF%",
            "CRIT Rate",
            "CRIT DMG",
            "Outgoing Healing Boost",
            "Effect Hit Rate",
        ],
    ),
    ("Feet", &["HP%", "ATK%", "DEF%", "SPD"]),
    (
        "PlanarSphere",
        &[
            "HP%",
            "ATK%",
            "DEF%",
            "Physical DMG Boost",
            "Fire DMG Boost",
            "Ice DMG Boost",
            "Lightning DMG Boost",
            "Wind DMG Boost",
            "Quantum DMG Boost",
            "Imaginary DMG Boost",
        ],
    ),
    (
        "LinkRope",
        &[
            "HP%",
            "ATK%",
            "DEF%",
            "Break Effect",
            "Energy Regeneration Rate",
        ],
    ),
];

fn relic_sets() -> &'static [RelicSetEntry] {
    static SETS: OnceLock<Vec<RelicSetEntry>> = OnceLock::new();
    SETS.get_or_init(|| {
        serde_json::from_str::<RelicSetFile>(include_str!("../../../src/data/relic-sets.json"))
            .expect("bundled relic catalogue must be valid")
            .sets
    })
}

pub fn form_contract_text() -> String {
    let mut text = String::from("允许的洞窟套装 cavern（填 id 或中文全名）：\n");
    for set in relic_sets().iter().filter(|set| set.kind == "cavern") {
        text.push_str(&format!("{} {}\n", set.id, set.name));
    }
    text.push_str("允许的位面套装 planar：\n");
    for set in relic_sets().iter().filter(|set| set.kind == "planar") {
        text.push_str(&format!("{} {}\n", set.id, set.name));
    }
    text.push_str(
        "cavernMode 只能是 fourPiece 或 twoPlusTwo。\n\
主词条键只能是 Body / Feet / PlanarSphere / LinkRope，值为英文键数组。\n\
targets.statKey 只能用：HP ATK DEF SPD CRIT Rate CRIT DMG Effect Hit Rate Effect RES Break Effect。\n\
substatWeights 键只能是副词条英文键，值只能是 0 / 0.25 / 0.5 / 0.75 / 1，非零最多 5 个。\n\
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

fn resolve_stat<'a>(raw: &str, allowed: &'a [&str]) -> Option<&'a str> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    allowed
        .iter()
        .copied()
        .find(|item| item.eq_ignore_ascii_case(trimmed))
        .or_else(|| {
            stat_alias(trimmed)
                .and_then(|alias| allowed.iter().copied().find(|item| *item == alias))
        })
}

fn stat_alias(raw: &str) -> Option<&'static str> {
    Some(match raw {
        "生命值" | "生命" => "HP",
        "生命百分比" | "生命%" => "HP%",
        "攻击力" | "攻击" => "ATK",
        "攻击百分比" | "攻击%" => "ATK%",
        "防御力" | "防御" => "DEF",
        "防御百分比" | "防御%" => "DEF%",
        "速度" => "SPD",
        "暴击率" | "暴击" => "CRIT Rate",
        "暴击伤害" | "暴伤" => "CRIT DMG",
        "效果命中" | "命中" => "Effect Hit Rate",
        "效果抵抗" | "抵抗" => "Effect RES",
        "击破特攻" | "击破" => "Break Effect",
        "治疗量加成" | "治疗" => "Outgoing Healing Boost",
        "能量恢复效率" | "充能" => "Energy Regeneration Rate",
        "风伤" | "风属性伤害提高" => "Wind DMG Boost",
        "火伤" | "火属性伤害提高" => "Fire DMG Boost",
        "冰伤" | "冰属性伤害提高" => "Ice DMG Boost",
        "雷伤" | "雷属性伤害提高" => "Lightning DMG Boost",
        "量子伤害" | "量子伤害提高" => "Quantum DMG Boost",
        "虚数伤害" | "虚数伤害提高" => "Imaginary DMG Boost",
        "物理伤害" | "物理伤害提高" => "Physical DMG Boost",
        _ => return None,
    })
}

fn slot_alias(raw: &str) -> Option<&'static str> {
    Some(match raw {
        "Body" | "body" | "躯干" | "衣服" => "Body",
        "Feet" | "feet" | "脚部" | "鞋子" => "Feet",
        "PlanarSphere" | "sphere" | "位面球" | "球" => "PlanarSphere",
        "LinkRope" | "rope" | "连结绳" | "绳子" => "LinkRope",
        _ => return None,
    })
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
        effective_substats: unique_stats(&get("effectiveSubstats"), SUBSTAT_KEYS, 5),
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

const DOT_CHARACTERS: &[&str] = &["卡芙卡", "黑天鹅", "桑博", "桂乃芬", "卢卡"];

pub fn correct_plan_for_character(plan: &mut AdvicePlanDraft, name: &str) {
    if !DOT_CHARACTERS.contains(&name) {
        return;
    }
    let crit = plan
        .substat_weights
        .get("CRIT Rate")
        .copied()
        .unwrap_or(0.0)
        + plan.substat_weights.get("CRIT DMG").copied().unwrap_or(0.0);
    let brk = plan
        .substat_weights
        .get("Break Effect")
        .copied()
        .unwrap_or(0.0);
    let ehr = plan
        .substat_weights
        .get("Effect Hit Rate")
        .copied()
        .unwrap_or(0.0);
    let atk = plan.substat_weights.get("ATK%").copied().unwrap_or(0.0);
    let off_role = plan
        .effective_substats
        .iter()
        .any(|stat| stat == "CRIT Rate" || stat == "CRIT DMG" || stat == "Break Effect");
    if crit > 0.0 || brk > 0.0 || off_role || (ehr <= 0.0 && atk <= 0.0) {
        plan.substat_weights = HashMap::from([
            ("SPD".to_owned(), 1.0),
            ("ATK%".to_owned(), 1.0),
            ("Effect Hit Rate".to_owned(), 1.0),
        ]);
        align_effective_substats(plan);
    }
}

fn align_effective_substats(plan: &mut AdvicePlanDraft) {
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
            unique_stat_list(&values, allowed, allowed.len()),
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
            .and_then(|value| resolve_stat(value, TARGET_KEYS));
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
            let Some(key) = resolve_stat(raw_key, SUBSTAT_KEYS) else {
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

fn unique_stats(raw: &Value, allowed: &[&str], limit: usize) -> Vec<String> {
    let values = match raw {
        Value::Array(items) => items
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
        _ => Vec::new(),
    };
    unique_stat_list(&values, allowed, limit)
}

fn unique_stat_list(values: &[String], allowed: &[&str], limit: usize) -> Vec<String> {
    let mut next = Vec::new();
    for value in values {
        let Some(key) = resolve_stat(value, allowed) else {
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
            "mainStats": { "躯干": "暴击率", "Feet": ["SPD"] },
            "substatWeights": { "暴击率": 0.3, "暴击伤害": 0.4, "SPD": 1 },
            "targets": [{ "statKey": "速度", "target": 134, "minimum": 200 }]
        }));
        assert_eq!(plan.cavern_set_a, 101);
        assert_eq!(plan.planar_set_id, 301);
        assert_eq!(
            plan.main_stats.get("Body").unwrap(),
            &vec!["CRIT Rate".to_owned()]
        );
        assert_eq!(plan.substat_weights.get("CRIT Rate"), Some(&0.25));
        assert_eq!(plan.substat_weights.get("CRIT DMG"), Some(&0.5));
        assert_eq!(plan.targets[0].stat_key, "SPD");
        assert_eq!(plan.targets[0].minimum, 134.0);
        assert_eq!(plan.effective_substats[0], "SPD");
    }

    #[test]
    fn corrects_kafka_off_role_substats() {
        let mut plan = sanitize_plan(&json!({
            "substatWeights": { "CRIT DMG": 1, "Break Effect": 1, "SPD": 0.5 },
            "effectiveSubstats": ["CRIT DMG", "Break Effect"]
        }));
        correct_plan_for_character(&mut plan, "卡芙卡");
        assert_eq!(plan.substat_weights.get("Effect Hit Rate"), Some(&1.0));
        assert_eq!(plan.substat_weights.get("ATK%"), Some(&1.0));
        assert!(!plan
            .effective_substats
            .iter()
            .any(|stat| stat == "CRIT DMG"));
        assert!(!plan
            .effective_substats
            .iter()
            .any(|stat| stat == "Break Effect"));
    }
}
