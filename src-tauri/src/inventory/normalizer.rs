//! Converts exporter-specific inventory values into the application's canonical contract.

use std::{collections::BTreeSet, sync::OnceLock};

use serde::Deserialize;

use super::{ImportCharacter, ImportRelic, ImportSubstat, InventoryImport};

#[derive(Debug, Clone, Default)]
pub struct NormalizationReport {
    warnings: BTreeSet<String>,
}

impl NormalizationReport {
    pub fn warnings(&self) -> Vec<String> {
        self.warnings.iter().cloned().collect()
    }

    fn unknown(&mut self, kind: &str, id: u32) {
        self.warnings.insert(format!("图鉴未收录的{kind} ID：{id}"));
    }
}

#[derive(Deserialize)]
struct RelicCatalogue {
    sets: Vec<RelicSet>,
}
#[derive(Deserialize)]
struct RelicSet {
    id: u32,
    name: String,
}
#[derive(Deserialize)]
struct LightConeCatalogue {
    #[serde(rename = "lightCones")]
    light_cones: Vec<LightCone>,
}
#[derive(Deserialize)]
struct LightCone {
    id: u32,
    name: String,
}
#[derive(Deserialize)]
struct CharacterCatalogue {
    characters: Vec<CharacterCatalogueEntry>,
}
#[derive(Deserialize)]
struct CharacterCatalogueEntry {
    name: String,
    rarity: Option<u32>,
}

fn relic_names() -> &'static std::collections::HashMap<u32, String> {
    static MAP: OnceLock<std::collections::HashMap<u32, String>> = OnceLock::new();
    MAP.get_or_init(|| {
        serde_json::from_str::<RelicCatalogue>(include_str!("../../../src/data/relic-sets.json"))
            .expect("bundled relic catalogue must be valid")
            .sets
            .into_iter()
            .map(|entry| (entry.id, entry.name))
            .collect()
    })
}

fn light_cone_names() -> &'static std::collections::HashMap<u32, String> {
    static MAP: OnceLock<std::collections::HashMap<u32, String>> = OnceLock::new();
    MAP.get_or_init(|| {
        serde_json::from_str::<LightConeCatalogue>(include_str!(
            "../../../src/data/light-cones.json"
        ))
        .expect("bundled light-cone catalogue must be valid")
        .light_cones
        .into_iter()
        .map(|entry| (entry.id, entry.name))
        .collect()
    })
}

fn character_rarities() -> &'static std::collections::HashMap<String, u32> {
    static MAP: OnceLock<std::collections::HashMap<String, u32>> = OnceLock::new();
    MAP.get_or_init(|| {
        serde_json::from_str::<CharacterCatalogue>(include_str!(
            "../../../src/data/characters.json"
        ))
        .expect("bundled character catalogue must be valid")
        .characters
        .into_iter()
        .filter_map(|entry| entry.rarity.map(|rarity| (entry.name, rarity)))
        .collect()
    })
}

// The public character catalogue currently carries presentation data but no game ID.
// Keep this ID map at the persistence boundary until the synchroniser adds IDs.
fn character_names() -> &'static std::collections::HashMap<u32, &'static str> {
    static MAP: OnceLock<std::collections::HashMap<u32, &'static str>> = OnceLock::new();
    MAP.get_or_init(|| {
        [
            (1001, "三月七"),
            (1002, "丹恒"),
            (1003, "姬子"),
            (1004, "瓦尔特"),
            (1005, "卡芙卡"),
            (1008, "阿兰"),
            (1009, "艾丝妲"),
            (1013, "黑塔"),
            (1014, "Saber"),
            (1015, "Archer"),
            (1101, "布洛妮娅"),
            (1102, "希儿"),
            (1103, "希露瓦"),
            (1104, "杰帕德"),
            (1105, "娜塔莎"),
            (1106, "佩拉"),
            (1107, "克拉拉"),
            (1108, "桑博"),
            (1109, "虎克"),
            (1110, "玲可"),
            (1111, "卢卡"),
            (1112, "托帕&账账"),
            (1201, "青雀"),
            (1202, "停云"),
            (1204, "景元"),
            (1206, "素裳"),
            (1207, "驭空"),
            (1208, "符玄"),
            (1209, "彦卿"),
            (1210, "桂乃芬"),
            (1211, "白露"),
            (1214, "雪衣"),
            (1215, "寒鸦"),
            (1217, "藿藿"),
            (1220, "飞霄"),
            (1221, "云璃"),
            (1222, "灵砂"),
            (1223, "貊泽"),
            (1224, "三月七"),
            (1225, "忘归人"),
            (1301, "加拉赫"),
            (1303, "阮•梅"),
            (1304, "砂金"),
            (1305, "真理医生"),
            (1306, "花火"),
            (1307, "黑天鹅"),
            (1308, "黄泉"),
            (1309, "知更鸟"),
            (1310, "流萤"),
            (1312, "米沙"),
            (1321, "大丽花"),
            (1407, "遐蝶"),
            (1409, "风堇"),
            (1410, "海瑟音"),
            (1413, "长夜月"),
            (1414, "丹恒•腾荒"),
            (1415, "昔涟"),
            (1501, "火花"),
            (1502, "爻光"),
            (1505, "绯英"),
            (1506, "银狼LV. 999"),
            (1508, "远坂凛"),
            (1510, "姬子•启行"),
            // Trailblazer path variants: odd = male, even = female.
            (8001, "开拓者"),
            (8002, "开拓者"),
            (8003, "开拓者"),
            (8004, "开拓者"),
            (8005, "开拓者"),
            (8006, "开拓者"),
            (8007, "开拓者"),
            (8008, "开拓者"),
            (8009, "开拓者"),
            (8010, "开拓者"),
        ]
        .into_iter()
        .collect()
    })
}

pub fn normalize_import(import: &mut InventoryImport) -> NormalizationReport {
    let mut report = NormalizationReport::default();
    for character in &mut import.characters {
        normalize_character(character, &mut report);
    }
    let imported_character_names = import
        .characters
        .iter()
        .map(|character| (character.id, character.name.as_str()))
        .collect::<std::collections::HashMap<_, _>>();
    for relic in &mut import.relics {
        normalize_relic(relic, &imported_character_names, &mut report);
    }
    for light_cone in &mut import.light_cones {
        if let Some(name) = light_cone_names().get(&light_cone.id) {
            light_cone.name.clone_from(name);
        } else {
            report.unknown("光锥", light_cone.id);
        }
        light_cone.equipped_character_id = location_id(&light_cone.location);
        light_cone.location =
            normalize_location(&light_cone.location, &imported_character_names, &mut report);
    }
    report
}

fn normalize_character(character: &mut ImportCharacter, report: &mut NormalizationReport) {
    if let Some(name) = canonical_import_character_name(character.id, &character.name) {
        character.name = name.to_owned();
    } else {
        report.unknown("角色", character.id);
    }
}

fn normalize_relic(
    relic: &mut ImportRelic,
    imported_character_names: &std::collections::HashMap<u32, &str>,
    report: &mut NormalizationReport,
) {
    if let Some(name) = relic_names().get(&relic.set_id) {
        relic.name.clone_from(name);
    } else {
        report.unknown("遗器套装", relic.set_id);
    }
    relic.slot = normalize_slot(&relic.slot).to_owned();
    relic.mainstat = normalize_main_stat(&relic.slot, &relic.mainstat).to_owned();
    normalize_substats(&mut relic.substats);
    if let Some(stats) = &mut relic.reroll_substats {
        normalize_substats(stats);
    }
    if let Some(stats) = &mut relic.preview_substats {
        normalize_substats(stats);
    }
    relic.equipped_character_id = location_id(&relic.location);
    relic.location = normalize_location(&relic.location, imported_character_names, report);
}

fn normalize_substats(stats: &mut [ImportSubstat]) {
    for stat in stats {
        stat.key = normalize_stat_key(&stat.key).to_owned();
    }
}

fn normalize_location(
    location: &str,
    imported_character_names: &std::collections::HashMap<u32, &str>,
    report: &mut NormalizationReport,
) -> String {
    let Ok(id) = location.parse::<u32>() else {
        return location.to_owned();
    };
    if let Some(name) = imported_character_names
        .get(&id)
        .copied()
        .or_else(|| canonical_character_name(id))
    {
        name.to_owned()
    } else {
        report.unknown("装备角色", id);
        location.to_owned()
    }
}

/// Resolve the equipped character id from a location field.
///
/// Exporter locations are character ids (`"8006"`, `"1224"`). Name reverse-lookup is
/// only used for unique names — multi-path protagonists (开拓者 / 三月七) share one
/// display name across several ids, so an ambiguous name never wins an id.
pub fn location_id(location: &str) -> Option<u32> {
    if location.is_empty() {
        return None;
    }
    if let Ok(id) = location.parse::<u32>() {
        return Some(id);
    }
    unique_character_id_by_name(location)
}

/// Prefer an authoritative numeric location, then a stored id that still matches the
/// display name (keeps multi-path gear from collapsing during migrations).
pub fn resolve_equipped_character_id(location: &str, existing: Option<u32>) -> Option<u32> {
    if location.is_empty() {
        return None;
    }
    if let Ok(id) = location.parse::<u32>() {
        return Some(id);
    }
    if let Some(id) = existing {
        if canonical_character_name(id) == Some(location) {
            return Some(id);
        }
    }
    unique_character_id_by_name(location)
}

fn unique_character_id_by_name(name: &str) -> Option<u32> {
    let mut ids = character_names()
        .iter()
        .filter_map(|(id, canonical)| (*canonical == name).then_some(*id));
    let first = ids.next()?;
    if ids.next().is_some() {
        // Ambiguous multi-path name — never invent a single owner.
        None
    } else {
        Some(first)
    }
}

pub fn canonical_relic_name(set_id: u32) -> Option<&'static str> {
    relic_names().get(&set_id).map(String::as_str)
}

pub fn canonical_light_cone_name(id: u32) -> Option<&'static str> {
    light_cone_names().get(&id).map(String::as_str)
}

pub fn canonical_character_name(id: u32) -> Option<&'static str> {
    character_names().get(&id).copied()
}

pub fn character_rarity(name: &str) -> Option<u32> {
    character_rarities().get(name).copied()
}

fn canonical_import_character_name(id: u32, imported_name: &str) -> Option<&'static str> {
    canonical_character_name(id).or_else(|| character_name_alias(imported_name))
}

fn character_name_alias(name: &str) -> Option<&'static str> {
    match name {
        "Aglaea" => Some("阿格莱雅"),
        "Phainon" => Some("白厄"),
        "Boothill" => Some("波提欧"),
        "Ashveil" => Some("不死途"),
        "The Herta" => Some("大黑塔"),
        "Dan Heng • Imbibitor Lunae" => Some("丹恒•饮月"),
        "Jade" => Some("翡翠"),
        "Gilgamesh" => Some("吉尔伽美什"),
        "Jiaoqiu" => Some("椒丘"),
        "Jingliu" => Some("镜流"),
        "Cerydra" => Some("刻律德菈"),
        "Rappa" => Some("乱破"),
        "Luocha" => Some("罗刹"),
        "Anaxa" => Some("那刻夏"),
        "Mortenax Blade" => Some("千冶•刃"),
        "Blade" => Some("刃"),
        "Cipher" => Some("赛飞儿"),
        "Tribbie" => Some("缇宝"),
        "Mydei" => Some("万敌"),
        "Sunday" => Some("星期日"),
        "Silver Wolf" => Some("银狼"),
        "Argenti" => Some("银枝"),
        _ => None,
    }
}

pub fn normalize_slot(slot: &str) -> &str {
    match slot {
        "Planar Sphere" | "PlanarSphere" => "PlanarSphere",
        "Link Rope" | "LinkRope" => "LinkRope",
        other => other,
    }
}

pub fn normalize_stat_key(key: &str) -> &str {
    match key {
        "HP_" => "HP%",
        "ATK_" => "ATK%",
        "DEF_" => "DEF%",
        "CRIT Rate_" => "CRIT Rate",
        "CRIT Rate%" => "CRIT Rate",
        "CRIT DMG_" => "CRIT DMG",
        "CRIT DMG%" => "CRIT DMG",
        "Effect Hit Rate_" => "Effect Hit Rate",
        "Effect Hit Rate%" => "Effect Hit Rate",
        "Effect RES_" => "Effect RES",
        "Effect RES%" => "Effect RES",
        "Break Effect_" => "Break Effect",
        "Break Effect%" => "Break Effect",
        other => other,
    }
}

pub fn normalize_main_stat<'a>(slot: &str, key: &'a str) -> &'a str {
    match (slot, key) {
        ("Head", "HP") | ("Hands", "ATK") => key,
        (_, "HP") => "HP%",
        (_, "ATK") => "ATK%",
        (_, "DEF") => "DEF%",
        _ => normalize_stat_key(key),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inventory::ImportMetadata;

    #[test]
    fn normalizes_exporter_values() {
        assert_eq!(normalize_slot("Link Rope"), "LinkRope");
        assert_eq!(normalize_slot("Planar Sphere"), "PlanarSphere");
        assert_eq!(normalize_stat_key("CRIT Rate_"), "CRIT Rate");
        assert_eq!(normalize_stat_key("Effect Hit Rate%"), "Effect Hit Rate");
        assert_eq!(normalize_main_stat("Body", "ATK"), "ATK%");
        assert_eq!(normalize_main_stat("Hands", "ATK"), "ATK");
    }

    #[test]
    fn normalizes_the_real_export_fixture() {
        let mut import: InventoryImport =
            serde_json::from_str(include_str!("../../../examples/starrail-inventory.json"))
                .expect("fixture must match the import contract");
        let report = normalize_import(&mut import);
        let relic = import
            .relics
            .iter()
            .find(|item| item.set_id == 110)
            .unwrap();
        assert_eq!(relic.name, "晨昏交界的翔鹰");
        assert!(import.relics.iter().any(|item| item.slot == "LinkRope"));
        assert!(import
            .relics
            .iter()
            .flat_map(|item| &item.substats)
            .any(|stat| stat.key == "CRIT Rate"));
        assert_eq!(import.characters[0].name, "三月七");
        assert!(report.warnings().is_empty());
    }

    #[test]
    fn covers_every_bundled_character_name() {
        let aliases = [
            "阿格莱雅",
            "白厄",
            "波提欧",
            "不死途",
            "大黑塔",
            "丹恒•饮月",
            "翡翠",
            "吉尔伽美什",
            "椒丘",
            "镜流",
            "刻律德菈",
            "乱破",
            "罗刹",
            "那刻夏",
            "千冶•刃",
            "刃",
            "赛飞儿",
            "缇宝",
            "万敌",
            "星期日",
            "银狼",
            "银枝",
        ];
        let catalogue: serde_json::Value =
            serde_json::from_str(include_str!("../../../src/data/characters.json"))
                .expect("bundled character catalogue must be valid");
        let names = catalogue["characters"]
            .as_array()
            .expect("character catalogue must contain characters")
            .iter()
            .filter_map(|character| character["name"].as_str());

        for name in names {
            assert!(
                character_names().values().any(|mapped| *mapped == name) || aliases.contains(&name),
                "missing import normalization for {name}",
            );
        }
    }

    #[test]
    fn location_id_keeps_numeric_ids_and_rejects_ambiguous_names() {
        assert_eq!(location_id("8006"), Some(8006));
        assert_eq!(location_id("1224"), Some(1224));
        assert_eq!(location_id("1220"), Some(1220));
        // Unique name still resolves.
        assert_eq!(location_id("飞霄"), Some(1220));
        // Multi-path display names must not collapse onto one id.
        assert_eq!(location_id("开拓者"), None);
        assert_eq!(location_id("三月七"), None);
        assert_eq!(location_id(""), None);
    }

    #[test]
    fn resolve_equipped_character_id_preserves_multi_path_owners() {
        assert_eq!(
            resolve_equipped_character_id("开拓者", Some(8003)),
            Some(8003)
        );
        assert_eq!(
            resolve_equipped_character_id("三月七", Some(1224)),
            Some(1224)
        );
        assert_eq!(resolve_equipped_character_id("开拓者", None), None);
        assert_eq!(resolve_equipped_character_id("8001", Some(9999)), Some(8001));
    }

    #[test]
    fn import_binds_trailblazer_and_march_equipment_by_id() {
        let mut import = InventoryImport {
            metadata: ImportMetadata {
                uid: None,
                trailblazer: None,
            },
            relics: vec![
                ImportRelic {
                    set_id: 101,
                    name: "r1".to_owned(),
                    slot: "Head".to_owned(),
                    rarity: 5,
                    level: 15,
                    mainstat: "HP".to_owned(),
                    substats: Vec::new(),
                    reroll_substats: None,
                    preview_substats: None,
                    location: "8006".to_owned(),
                    equipped_character_id: None,
                    lock: false,
                    discard: false,
                    _uid: 1,
                },
                ImportRelic {
                    set_id: 101,
                    name: "r2".to_owned(),
                    slot: "Head".to_owned(),
                    rarity: 5,
                    level: 15,
                    mainstat: "HP".to_owned(),
                    substats: Vec::new(),
                    reroll_substats: None,
                    preview_substats: None,
                    location: "1001".to_owned(),
                    equipped_character_id: None,
                    lock: false,
                    discard: false,
                    _uid: 2,
                },
            ],
            light_cones: Vec::new(),
            characters: vec![
                ImportCharacter {
                    id: 8006,
                    name: "Trailblazer".to_owned(),
                    path: "Harmony".to_owned(),
                    level: 80,
                    ascension: 6,
                    eidolon: 0,
                    skills: serde_json::json!({}),
                    traces: serde_json::json!({}),
                    memosprite: None,
                    ability_version: 1,
                },
                ImportCharacter {
                    id: 1001,
                    name: "March 7th".to_owned(),
                    path: "Preservation".to_owned(),
                    level: 80,
                    ascension: 6,
                    eidolon: 0,
                    skills: serde_json::json!({}),
                    traces: serde_json::json!({}),
                    memosprite: None,
                    ability_version: 1,
                },
            ],
        };
        let report = normalize_import(&mut import);
        assert!(report.warnings().is_empty());
        assert_eq!(import.relics[0].equipped_character_id, Some(8006));
        assert_eq!(import.relics[0].location, "开拓者");
        assert_eq!(import.relics[1].equipped_character_id, Some(1001));
        assert_eq!(import.relics[1].location, "三月七");
        assert_eq!(import.characters[0].name, "开拓者");
        assert_eq!(import.characters[1].name, "三月七");
    }
}
