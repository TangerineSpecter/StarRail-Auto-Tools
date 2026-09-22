use std::collections::HashMap;

use serde::Serialize;
use serde_json::Value;

use crate::error::AppError;
use crate::inventory::{
    CharacterBuildPlan, InventoryKind, InventoryStore, RelicSetOption, RelicSetOwnedCount,
};

const MULTI_PATH_NAMES: &[&str] = &["开拓者", "三月七"];

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotLightCone {
    pub name: String,
    pub level: u32,
    pub superimposition: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotRelic {
    pub slot: String,
    pub slot_zh: String,
    pub set_name: String,
    pub level: u32,
    pub main_stat: String,
    pub main_stat_zh: String,
    pub substats: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotPlan {
    pub cavern_mode: String,
    pub cavern_sets: Vec<String>,
    pub planar_set: String,
    pub main_stats: HashMap<String, Vec<String>>,
    pub effective_substats: Vec<String>,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotSetCount {
    pub name: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CharacterAdviceSnapshot {
    pub character_id: u32,
    pub name: String,
    pub display_name: String,
    pub path: String,
    pub path_zh: String,
    pub element: String,
    pub slug: String,
    pub level: u32,
    pub eidolon: u32,
    pub light_cone: Option<SnapshotLightCone>,
    pub relics: Vec<SnapshotRelic>,
    pub saved_plan: Option<SnapshotPlan>,
    pub inventory_sets: Vec<SnapshotSetCount>,
}

pub fn load_snapshot(
    store: &InventoryStore,
    character_id: u32,
    slug: &str,
    element: &str,
    current_plan: Option<&CharacterBuildPlan>,
) -> Result<CharacterAdviceSnapshot, AppError> {
    let detail = store.detail(InventoryKind::Character, character_id)?;
    let stored = store.build_plan(character_id)?;
    let plan = current_plan.or(stored.as_ref());
    let set_names = store
        .list_relic_sets()?
        .into_iter()
        .map(|RelicSetOption { set_id, name }| (set_id, name))
        .collect::<HashMap<_, _>>();
    let owned = store.equipment_counts()?.relics;
    snapshot_from_detail(&detail.data, plan, &set_names, &owned, slug, element)
}

pub fn snapshot_from_detail(
    detail: &Value,
    plan: Option<&CharacterBuildPlan>,
    set_names: &HashMap<u32, String>,
    owned: &[RelicSetOwnedCount],
    slug: &str,
    element: &str,
) -> Result<CharacterAdviceSnapshot, AppError> {
    let name = string_field(detail, "name")?;
    let path = string_field(detail, "path").unwrap_or_default();
    let path_zh = path_zh(&path).to_owned();
    let display_name = character_display_name(&name, &path);
    Ok(CharacterAdviceSnapshot {
        character_id: u32_field(detail, "characterId")?,
        display_name,
        name,
        path,
        path_zh,
        element: element.trim().to_owned(),
        slug: slug.trim().to_owned(),
        level: u32_field(detail, "level").unwrap_or(0),
        eidolon: u32_field(detail, "eidolon").unwrap_or(0),
        light_cone: detail.get("equippedLightCone").and_then(parse_light_cone),
        relics: detail
            .get("equippedRelics")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(parse_relic)
            .collect(),
        saved_plan: plan.map(|plan| snapshot_plan(plan, set_names)),
        inventory_sets: owned
            .iter()
            .filter(|item| item.count > 0)
            .filter_map(|item| {
                set_names.get(&item.set_id).map(|name| SnapshotSetCount {
                    name: name.clone(),
                    count: item.count,
                })
            })
            .collect(),
    })
}

pub fn character_display_name(name: &str, path: &str) -> String {
    if MULTI_PATH_NAMES.contains(&name) {
        format!("{name}·{}", path_zh(path))
    } else {
        name.to_owned()
    }
}

pub fn search_query(display_name: &str) -> String {
    format!("崩坏星穹铁道 {display_name} 遗器 配装 主流套装")
}

pub fn path_zh(path: &str) -> &str {
    match path {
        "Destruction" | "毁灭" => "毁灭",
        "Hunt" | "巡猎" => "巡猎",
        "Erudition" | "智识" => "智识",
        "Harmony" | "同谐" => "同谐",
        "Nihility" | "虚无" | "Warlock" => "虚无",
        "Preservation" | "存护" => "存护",
        "Abundance" | "丰饶" => "丰饶",
        "Remembrance" | "记忆" => "记忆",
        "Elation" | "欢愉" => "欢愉",
        other => other,
    }
}

fn snapshot_plan(plan: &CharacterBuildPlan, set_names: &HashMap<u32, String>) -> SnapshotPlan {
    let mut cavern_sets = Vec::new();
    if let Some(name) = set_names.get(&plan.cavern_set_a) {
        cavern_sets.push(name.clone());
    }
    if let Some(set_b) = plan.cavern_set_b {
        if let Some(name) = set_names.get(&set_b) {
            cavern_sets.push(name.clone());
        }
    }
    SnapshotPlan {
        cavern_mode: plan.cavern_mode.clone(),
        cavern_sets,
        planar_set: set_names
            .get(&plan.planar_set_id)
            .cloned()
            .unwrap_or_default(),
        main_stats: plan.main_stats.clone(),
        effective_substats: plan.effective_substats.clone(),
        note: plan.note.clone(),
    }
}

fn parse_light_cone(value: &Value) -> Option<SnapshotLightCone> {
    if value.is_null() {
        return None;
    }
    Some(SnapshotLightCone {
        name: string_field(value, "name").ok()?,
        level: u32_field(value, "level").unwrap_or(0),
        superimposition: u32_field(value, "superimposition").unwrap_or(0),
    })
}

fn parse_relic(value: &Value) -> Option<SnapshotRelic> {
    let slot = string_field(value, "slot").ok()?;
    let main_stat = string_field(value, "mainStat").unwrap_or_default();
    Some(SnapshotRelic {
        slot_zh: slot_zh(&slot).to_owned(),
        slot,
        set_name: string_field(value, "setName").unwrap_or_default(),
        level: u32_field(value, "level").unwrap_or(0),
        main_stat_zh: stat_zh(&main_stat).to_owned(),
        main_stat,
        substats: value
            .get("substats")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(format_substat)
            .collect(),
    })
}

fn format_substat(value: &Value) -> Option<String> {
    let key = string_field(value, "key").ok()?;
    let amount = value.get("value").and_then(Value::as_f64).unwrap_or(0.0);
    let count = u32_field(value, "count").unwrap_or(1);
    Some(format!(
        "{} {} ({count} 次)",
        stat_zh(&key),
        format_stat_value(&key, amount)
    ))
}

fn format_stat_value(key: &str, value: f64) -> String {
    let percent = key.contains('%')
        || key.contains("Rate")
        || key.contains("DMG")
        || key.contains("Boost")
        || key.contains("RES")
        || key.contains("Effect");
    if percent {
        format!("{:.1}%", value)
    } else if (value - value.round()).abs() < 0.05 {
        format!("{:.0}", value)
    } else {
        format!("{:.1}", value)
    }
}

pub fn slot_zh(slot: &str) -> &str {
    match slot {
        "Head" => "头部",
        "Hands" => "手部",
        "Body" => "躯干",
        "Feet" => "脚部",
        "PlanarSphere" => "位面球",
        "LinkRope" => "连结绳",
        other => other,
    }
}

pub fn stat_zh(stat: &str) -> &str {
    match stat {
        "HP" => "生命值",
        "HP%" => "生命百分比",
        "ATK" => "攻击力",
        "ATK%" => "攻击百分比",
        "DEF" => "防御力",
        "DEF%" => "防御百分比",
        "SPD" => "速度",
        "CRIT Rate" => "暴击率",
        "CRIT DMG" => "暴击伤害",
        "Effect Hit Rate" => "效果命中",
        "Effect RES" => "效果抵抗",
        "Break Effect" => "击破特攻",
        "Outgoing Healing Boost" => "治疗量加成",
        "Energy Regeneration Rate" => "能量恢复效率",
        other => other,
    }
}

fn string_field(value: &Value, key: &str) -> Result<String, AppError> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| AppError::Advisor(format!("角色数据缺少 {key}")))
}

fn u32_field(value: &Value, key: &str) -> Result<u32, AppError> {
    value
        .get(key)
        .and_then(Value::as_u64)
        .map(|number| number as u32)
        .ok_or_else(|| AppError::Advisor(format!("角色数据缺少 {key}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn empty_plan() -> CharacterBuildPlan {
        CharacterBuildPlan {
            character_id: 8006,
            cavern_mode: "fourPiece".to_owned(),
            cavern_set_a: 101,
            cavern_set_b: None,
            planar_set_id: 301,
            main_stats: HashMap::from([("Body".to_owned(), vec!["CRIT Rate".to_owned()])]),
            targets: vec![],
            effective_substats: vec!["CRIT DMG".to_owned()],
            note: "旧方案".to_owned(),
            substat_weights: HashMap::new(),
            min_potential_pct: 40.0,
            spd_target: 0.0,
        }
    }

    #[test]
    fn distinguishes_harmony_trailblazer() {
        assert_eq!(character_display_name("开拓者", "Harmony"), "开拓者·同谐");
        assert_eq!(character_display_name("飞霄", "Hunt"), "飞霄");
        assert_eq!(
            search_query("开拓者·同谐"),
            "崩坏星穹铁道 开拓者·同谐 遗器 配装 主流套装"
        );
    }

    #[test]
    fn builds_a_compact_snapshot() {
        let detail = json!({
            "characterId": 8006,
            "name": "开拓者",
            "path": "Harmony",
            "level": 80,
            "eidolon": 2,
            "equippedLightCone": { "name": "镜中故我", "level": 80, "superimposition": 1 },
            "equippedRelics": [{
                "slot": "Body",
                "setName": "晨昏交界的翔鹰",
                "level": 15,
                "mainStat": "CRIT Rate",
                "substats": [{ "key": "SPD", "value": 2.6, "count": 1 }]
            }]
        });
        let set_names = HashMap::from([
            (101, "云无留迹的过客".to_owned()),
            (301, "繁星璀璨的黄金".to_owned()),
        ]);
        let owned = [RelicSetOwnedCount {
            set_id: 101,
            count: 8,
        }];
        let snapshot = snapshot_from_detail(
            &detail,
            Some(&empty_plan()),
            &set_names,
            &owned,
            "playerboy3",
            "虚数",
        )
        .unwrap();
        assert_eq!(snapshot.display_name, "开拓者·同谐");
        assert_eq!(snapshot.relics[0].main_stat_zh, "暴击率");
        assert_eq!(snapshot.relics[0].substats[0], "速度 2.6 (1 次)");
        assert_eq!(
            snapshot.saved_plan.as_ref().unwrap().cavern_sets[0],
            "云无留迹的过客"
        );
        assert_eq!(snapshot.inventory_sets[0].name, "云无留迹的过客");
    }
}
