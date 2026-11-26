use std::collections::HashMap;

use super::context::stat_zh;
use super::parse::AdvicePlanDraft;
use super::profile::{element_dmg_stat, CharacterAdvisorProfile, ScalingMode};
use super::sanitize::{align_effective_substats, is_low_speed_cavern_set};

const POET_MAX_STANDING_CRIT_RATE: f64 = 68.0;

pub fn validate_and_correct_plan(
    plan: &mut AdvicePlanDraft,
    profile: &CharacterAdvisorProfile,
) -> Vec<String> {
    let mut notes = Vec::new();
    apply_scaling_constraints(plan, profile, &mut notes);
    filter_cross_element_spheres(plan, profile, &mut notes);
    enforce_speed_and_low_speed_set_rules(plan, profile, &mut notes);
    deduplicate_flat_weights(plan);
    align_effective_substats(plan);
    notes
}

fn apply_scaling_constraints(
    plan: &mut AdvicePlanDraft,
    profile: &CharacterAdvisorProfile,
    notes: &mut Vec<String>,
) {
    if profile.scaling_mode == ScalingMode::Dot {
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
            notes.push("已按持续伤害机制自动修正副词条权重（移除双暴/击破）。".to_owned());
        }
    }

    if profile.disallowed_substats.is_empty() && profile.disallowed_main_stats.is_empty() {
        return;
    }

    let mut removed = Vec::new();
    for stat in &profile.disallowed_substats {
        let removed_weight = plan.substat_weights.remove(*stat).is_some();
        let before_eff = plan.effective_substats.len();
        plan.effective_substats.retain(|item| item != stat);
        let removed_eff = plan.effective_substats.len() < before_eff;
        let before_targets = plan.targets.len();
        plan.targets.retain(|target| target.stat_key != *stat);
        let removed_target = plan.targets.len() < before_targets;
        if (removed_weight || removed_eff || removed_target) && !removed.contains(stat) {
            removed.push(*stat);
        }
    }

    for stats in plan.main_stats.values_mut() {
        let before = stats.len();
        stats.retain(|item| !profile.disallowed_main_stats.contains(&item.as_str()));
        if stats.len() < before {
            for stat in &profile.disallowed_main_stats {
                if !removed.contains(stat) {
                    removed.push(*stat);
                }
            }
        }
    }

    if !removed.is_empty() {
        let labels: Vec<&str> = removed.into_iter().map(stat_zh).collect();
        notes.push(format!(
            "已按角色倍率自动过滤不生效词条：{}。",
            labels.join("、")
        ));
    }
}

fn filter_cross_element_spheres(
    plan: &mut AdvicePlanDraft,
    profile: &CharacterAdvisorProfile,
    notes: &mut Vec<String>,
) {
    let Some(expected_dmg) = element_dmg_stat(&profile.element) else {
        return;
    };
    let Some(sphere_stats) = plan.main_stats.get_mut("PlanarSphere") else {
        return;
    };
    let before = sphere_stats.len();
    sphere_stats.retain(|stat| !stat.ends_with("DMG Boost") || stat == expected_dmg);
    if sphere_stats.len() < before {
        notes.push(format!(
            "已自动过滤与角色属性（{}）不匹配的位面球增伤主词条。",
            profile.element
        ));
    }
}

fn enforce_speed_and_low_speed_set_rules(
    plan: &mut AdvicePlanDraft,
    profile: &CharacterAdvisorProfile,
    notes: &mut Vec<String>,
) {
    let uses_low_speed_set =
        plan.cavern_mode == "fourPiece" && is_low_speed_cavern_set(plan.cavern_set_a);

    if uses_low_speed_set {
        let mut adjusted = false;
        if plan.spd_target > 0.0 {
            plan.spd_target = 0.0;
            adjusted = true;
        }
        if plan.substat_weights.remove("SPD").is_some() {
            adjusted = true;
        }
        let before_eff = plan.effective_substats.len();
        plan.effective_substats.retain(|stat| stat != "SPD");
        if plan.effective_substats.len() < before_eff {
            adjusted = true;
        }
        if let Some(feet) = plan.main_stats.get_mut("Feet") {
            let before = feet.len();
            feet.retain(|stat| stat != "SPD");
            if feet.len() < before {
                adjusted = true;
            }
        }
        let before_targets = plan.targets.len();
        plan.targets.retain(|target| target.stat_key != "SPD");
        if plan.targets.len() < before_targets {
            adjusted = true;
        }
        if adjusted {
            notes.push(
                "已按低速套装机制自动清零速度断点与速度词条，避免破坏套装暴击加成。".to_owned(),
            );
        }
        for target in &mut plan.targets {
            if target.stat_key == "CRIT Rate" && target.target > POET_MAX_STANDING_CRIT_RATE {
                target.target = POET_MAX_STANDING_CRIT_RATE;
                if target.minimum > target.target {
                    target.minimum = target.target;
                }
                notes.push(
                    "诗人 4 件套局内自带 32% 暴击率，已将站街暴击目标上限钳制在 68%。".to_owned(),
                );
            }
        }
        return;
    }

    if plan.spd_target > 0.0 {
        let below_or_at_base = profile
            .base_speed
            .is_some_and(|base| plan.spd_target <= base + 1.0);
        let low_speed_without_spd_weight = profile.low_speed_preferred
            && plan.substat_weights.get("SPD").copied().unwrap_or(0.0) <= 0.0;
        if below_or_at_base || low_speed_without_spd_weight {
            plan.spd_target = 0.0;
            notes.push("速度断点用于最低达标门槛，低速配置已自动归零。".to_owned());
        }
    }
}

fn deduplicate_flat_weights(plan: &mut AdvicePlanDraft) {
    for (flat, percent) in [("HP", "HP%"), ("ATK", "ATK%"), ("DEF", "DEF%")] {
        let has_percent = plan.substat_weights.get(percent).copied().unwrap_or(0.0) > 0.0;
        if has_percent {
            plan.substat_weights.remove(flat);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::advisor::profile::resolve_profile;
    use crate::advisor::sanitize::sanitize_plan;
    use serde_json::json;

    #[test]
    fn scrubs_castorice_atk_flat_hp_and_poet_speed_target() {
        let profile = resolve_profile(1407, "遐蝶", "castorice", "量子");
        let mut plan = sanitize_plan(&json!({
            "cavernMode": "fourPiece",
            "cavernSetA": 124,
            "planarSetId": 320,
            "mainStats": {
                "Body": ["CRIT DMG"],
                "Feet": ["HP%", "SPD"],
                "PlanarSphere": ["Quantum DMG Boost", "Wind DMG Boost", "HP%"],
                "LinkRope": ["HP%", "ATK%"]
            },
            "targets": [
                { "statKey": "CRIT DMG", "target": 200, "minimum": 160 },
                { "statKey": "CRIT Rate", "target": 80, "minimum": 60 },
                { "statKey": "SPD", "target": 95, "minimum": 90 }
            ],
            "substatWeights": {
                "CRIT DMG": 1,
                "CRIT Rate": 0.75,
                "HP%": 0.75,
                "HP": 0.5,
                "ATK%": 0.25
            },
            "spdTarget": 95
        }));

        let notes = validate_and_correct_plan(&mut plan, &profile);
        assert!(!plan.substat_weights.contains_key("ATK%"));
        assert!(!plan.substat_weights.contains_key("HP"));
        assert!(!plan.substat_weights.contains_key("SPD"));
        assert_eq!(plan.spd_target, 0.0);
        assert_eq!(
            plan.main_stats.get("Feet").unwrap(),
            &vec!["HP%".to_owned()]
        );
        assert_eq!(
            plan.main_stats.get("LinkRope").unwrap(),
            &vec!["HP%".to_owned()]
        );
        assert!(!plan
            .main_stats
            .get("PlanarSphere")
            .unwrap()
            .contains(&"Wind DMG Boost".to_owned()));
        let crit_target = plan
            .targets
            .iter()
            .find(|item| item.stat_key == "CRIT Rate")
            .unwrap();
        assert_eq!(crit_target.target, 68.0);
        assert!(!plan.targets.iter().any(|item| item.stat_key == "SPD"));
        assert!(!notes.is_empty());
    }

    #[test]
    fn scrubs_reworked_jingliu_atk_weights() {
        let profile = resolve_profile(1212, "镜流", "jingliu", "冰");
        let mut plan = sanitize_plan(&json!({
            "mainStats": { "Body": ["CRIT DMG"], "Feet": ["SPD"], "LinkRope": ["ATK%", "HP%"] },
            "substatWeights": { "CRIT DMG": 1, "ATK%": 0.75, "HP%": 0.75, "SPD": 0.75 },
            "spdTarget": 135
        }));

        let notes = validate_and_correct_plan(&mut plan, &profile);
        assert!(!plan.substat_weights.contains_key("ATK%"));
        assert_eq!(plan.substat_weights.get("HP%"), Some(&0.75));
        assert_eq!(plan.spd_target, 135.0);
        assert_eq!(
            plan.main_stats.get("LinkRope").unwrap(),
            &vec!["HP%".to_owned()]
        );
        assert!(!notes.is_empty());
    }

    #[test]
    fn scrubs_aventurine_atk_and_keeps_def_weights() {
        let profile = resolve_profile(1304, "砂金", "aventurine", "虚数");
        let mut plan = sanitize_plan(&json!({
            "substatWeights": { "DEF%": 1, "DEF": 0.5, "ATK%": 0.5, "SPD": 0.75 }
        }));

        validate_and_correct_plan(&mut plan, &profile);
        assert!(!plan.substat_weights.contains_key("ATK%"));
        assert!(!plan.substat_weights.contains_key("DEF"));
        assert_eq!(plan.substat_weights.get("DEF%"), Some(&1.0));
    }

    #[test]
    fn corrects_kafka_off_role_substats_via_profile() {
        let profile = resolve_profile(1005, "卡芙卡", "kafka", "雷");
        let mut plan = sanitize_plan(&json!({
            "substatWeights": { "CRIT DMG": 1, "Break Effect": 1, "SPD": 0.5 }
        }));

        validate_and_correct_plan(&mut plan, &profile);
        assert_eq!(plan.substat_weights.get("Effect Hit Rate"), Some(&1.0));
        assert_eq!(plan.substat_weights.get("ATK%"), Some(&1.0));
        assert!(!plan.substat_weights.contains_key("CRIT DMG"));
        assert!(!plan.substat_weights.contains_key("Break Effect"));
    }
}
