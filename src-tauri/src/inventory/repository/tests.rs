use std::{
    collections::{HashMap, HashSet},
    fs::File,
};

use rusqlite::params;
use serde_json::{json, Value};

use super::super::models::*;
use super::super::normalize_import;
use super::migration::normalize_existing_records;
use super::optimizer::main_stat_value;
use super::*;

fn import(uid: u32, relic_ids: &[u32]) -> InventoryImport {
    InventoryImport {
        metadata: ImportMetadata {
            uid: Some(uid),
            trailblazer: Some("Stelle".to_owned()),
        },
        relics: relic_ids
            .iter()
            .map(|id| ImportRelic {
                set_id: 101,
                name: "测试套装".to_owned(),
                slot: "Head".to_owned(),
                rarity: 5,
                level: 15,
                mainstat: "HP".to_owned(),
                substats: vec![ImportSubstat {
                    key: "CRIT Rate".to_owned(),
                    value: 8.1,
                    count: 2,
                    step: 1,
                }],
                reroll_substats: None,
                preview_substats: None,
                location: String::new(),
                equipped_character_id: None,
                lock: true,
                discard: false,
                _uid: *id,
            })
            .collect(),
        light_cones: Vec::new(),
        characters: Vec::new(),
    }
}

#[test]
fn full_snapshot_reconciles_without_duplicates() {
    let store = InventoryStore::test_store();
    store
        .apply_full_snapshot(&import(10001, &[1, 2]))
        .unwrap()
        .unwrap();
    store
        .apply_full_snapshot(&import(10001, &[2, 3]))
        .unwrap()
        .unwrap();
    let summary = store.summary().unwrap();
    assert_eq!(summary.relics, 2);
    assert!(store.detail(InventoryKind::Relic, 1).is_err());
    assert!(store.detail(InventoryKind::Relic, 3).is_ok());
}

#[test]
fn equipment_counts_groups_relics_and_light_cones() {
    let store = InventoryStore::test_store();
    assert_eq!(store.equipment_counts().unwrap().relics.len(), 0);
    assert_eq!(store.equipment_counts().unwrap().light_cones.len(), 0);

    let mut snapshot = import(10001, &[1, 2, 3]);
    snapshot.relics[2].set_id = 301;
    snapshot.relics[2].name = "位面饰品".to_owned();
    snapshot.light_cones = vec![
        ImportLightCone {
            id: 20000,
            name: "测试光锥A".to_owned(),
            level: 80,
            ascension: 6,
            superimposition: 1,
            location: String::new(),
            equipped_character_id: None,
            lock: true,
            _uid: 11,
        },
        ImportLightCone {
            id: 20000,
            name: "测试光锥A".to_owned(),
            level: 70,
            ascension: 5,
            superimposition: 2,
            location: String::new(),
            equipped_character_id: None,
            lock: false,
            _uid: 12,
        },
        ImportLightCone {
            id: 20001,
            name: "测试光锥B".to_owned(),
            level: 40,
            ascension: 2,
            superimposition: 1,
            location: String::new(),
            equipped_character_id: None,
            lock: false,
            _uid: 13,
        },
    ];
    store.apply_full_snapshot(&snapshot).unwrap().unwrap();

    let counts = store.equipment_counts().unwrap();
    assert_eq!(
        counts
            .relics
            .iter()
            .map(|item| (item.set_id, item.count))
            .collect::<Vec<_>>(),
        vec![(101, 2), (301, 1)]
    );
    assert_eq!(
        counts
            .light_cones
            .iter()
            .map(|item| (item.template_id, item.count))
            .collect::<Vec<_>>(),
        vec![(20000, 2), (20001, 1)]
    );
}

#[test]
fn character_detail_includes_equipped_relics_and_light_cone() {
    let store = InventoryStore::test_store();
    let mut snapshot = import(10001, &[1]);
    snapshot.relics[0].equipped_character_id = Some(1220);
    snapshot.light_cones = vec![ImportLightCone {
        id: 23062,
        name: "所见即我".to_owned(),
        level: 80,
        ascension: 6,
        superimposition: 1,
        location: "飞霄".to_owned(),
        equipped_character_id: Some(1220),
        lock: true,
        _uid: 2,
    }];
    snapshot.characters = vec![ImportCharacter {
        id: 1220,
        name: "飞霄".to_owned(),
        path: "Hunt".to_owned(),
        level: 80,
        ascension: 6,
        eidolon: 0,
        skills: json!({}),
        traces: json!({}),
        memosprite: None,
        ability_version: 1,
    }];

    store.apply_full_snapshot(&snapshot).unwrap().unwrap();
    let detail = store.detail(InventoryKind::Character, 1220).unwrap();

    assert_eq!(detail.data["equippedRelics"].as_array().unwrap().len(), 1);
    assert_eq!(detail.data["equippedRelics"][0]["itemId"], 1);
    assert_eq!(detail.data["equippedLightCone"]["templateId"], 23062);
}

#[test]
fn multi_path_characters_keep_equipment_isolated_by_character_id() {
    let store = InventoryStore::test_store();
    let snapshot = InventoryImport {
        metadata: ImportMetadata {
            uid: Some(10001),
            trailblazer: Some("Stelle".to_owned()),
        },
        relics: vec![
            ImportRelic {
                set_id: 101,
                name: "毁灭头".to_owned(),
                slot: "Head".to_owned(),
                rarity: 5,
                level: 15,
                mainstat: "HP".to_owned(),
                substats: Vec::new(),
                reroll_substats: None,
                preview_substats: None,
                location: "8001".to_owned(),
                equipped_character_id: None,
                lock: true,
                discard: false,
                _uid: 1,
            },
            ImportRelic {
                set_id: 101,
                name: "存护头".to_owned(),
                slot: "Head".to_owned(),
                rarity: 5,
                level: 15,
                mainstat: "HP".to_owned(),
                substats: Vec::new(),
                reroll_substats: None,
                preview_substats: None,
                location: "8003".to_owned(),
                equipped_character_id: None,
                lock: true,
                discard: false,
                _uid: 2,
            },
            ImportRelic {
                set_id: 101,
                name: "三月巡猎头".to_owned(),
                slot: "Head".to_owned(),
                rarity: 5,
                level: 15,
                mainstat: "HP".to_owned(),
                substats: Vec::new(),
                reroll_substats: None,
                preview_substats: None,
                location: "1224".to_owned(),
                equipped_character_id: None,
                lock: true,
                discard: false,
                _uid: 3,
            },
        ],
        light_cones: vec![
            ImportLightCone {
                id: 20000,
                name: "光锥A".to_owned(),
                level: 80,
                ascension: 6,
                superimposition: 1,
                location: "8001".to_owned(),
                equipped_character_id: None,
                lock: true,
                _uid: 11,
            },
            ImportLightCone {
                id: 20001,
                name: "光锥B".to_owned(),
                level: 80,
                ascension: 6,
                superimposition: 1,
                location: "8003".to_owned(),
                equipped_character_id: None,
                lock: true,
                _uid: 12,
            },
        ],
        characters: vec![
            ImportCharacter {
                id: 8001,
                name: "开拓者".to_owned(),
                path: "Destruction".to_owned(),
                level: 80,
                ascension: 6,
                eidolon: 6,
                skills: json!({}),
                traces: json!({}),
                memosprite: None,
                ability_version: 1,
            },
            ImportCharacter {
                id: 8003,
                name: "开拓者".to_owned(),
                path: "Preservation".to_owned(),
                level: 80,
                ascension: 6,
                eidolon: 6,
                skills: json!({}),
                traces: json!({}),
                memosprite: None,
                ability_version: 1,
            },
            ImportCharacter {
                id: 1224,
                name: "三月七".to_owned(),
                path: "Hunt".to_owned(),
                level: 80,
                ascension: 6,
                eidolon: 6,
                skills: json!({}),
                traces: json!({}),
                memosprite: None,
                ability_version: 1,
            },
            ImportCharacter {
                id: 1001,
                name: "三月七".to_owned(),
                path: "Preservation".to_owned(),
                level: 80,
                ascension: 6,
                eidolon: 6,
                skills: json!({}),
                traces: json!({}),
                memosprite: None,
                ability_version: 1,
            },
        ],
    };

    store.apply_full_snapshot(&snapshot).unwrap().unwrap();
    // Migration must not collapse multi-path owners onto one id.
    normalize_existing_records(&store.connect().unwrap()).unwrap();

    let destruction = store.detail(InventoryKind::Character, 8001).unwrap();
    let preservation = store.detail(InventoryKind::Character, 8003).unwrap();
    let march_hunt = store.detail(InventoryKind::Character, 1224).unwrap();
    let march_pres = store.detail(InventoryKind::Character, 1001).unwrap();

    assert_eq!(
        destruction.data["equippedRelics"].as_array().unwrap().len(),
        1
    );
    assert_eq!(destruction.data["equippedRelics"][0]["itemId"], 1);
    assert_eq!(destruction.data["equippedLightCone"]["itemId"], 11);

    assert_eq!(
        preservation.data["equippedRelics"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(preservation.data["equippedRelics"][0]["itemId"], 2);
    assert_eq!(preservation.data["equippedLightCone"]["itemId"], 12);

    assert_eq!(
        march_hunt.data["equippedRelics"].as_array().unwrap().len(),
        1
    );
    assert_eq!(march_hunt.data["equippedRelics"][0]["itemId"], 3);
    assert!(march_pres.data["equippedRelics"]
        .as_array()
        .unwrap()
        .is_empty());

    let relic_a = store.detail(InventoryKind::Relic, 1).unwrap();
    let relic_b = store.detail(InventoryKind::Relic, 2).unwrap();
    assert_eq!(relic_a.data["equippedCharacterId"], 8001);
    assert_eq!(relic_b.data["equippedCharacterId"], 8003);
    assert_eq!(relic_a.data["location"], "开拓者");
    assert_eq!(relic_b.data["location"], "开拓者");
}

#[test]
fn relic_and_light_cone_search_matches_equipped_character_and_path() {
    let store = InventoryStore::test_store();
    let mut snapshot = import(10001, &[]);
    snapshot.relics = vec![
        ImportRelic {
            set_id: 101,
            name: "测试头A".to_owned(),
            slot: "Head".to_owned(),
            rarity: 5,
            level: 15,
            mainstat: "HP".to_owned(),
            substats: Vec::new(),
            reroll_substats: None,
            preview_substats: None,
            location: "8006".to_owned(),
            equipped_character_id: None,
            lock: true,
            discard: false,
            _uid: 1,
        },
        ImportRelic {
            set_id: 102,
            name: "测试头B".to_owned(),
            slot: "Head".to_owned(),
            rarity: 5,
            level: 15,
            mainstat: "HP".to_owned(),
            substats: Vec::new(),
            reroll_substats: None,
            preview_substats: None,
            location: "1224".to_owned(),
            equipped_character_id: None,
            lock: true,
            discard: false,
            _uid: 2,
        },
        ImportRelic {
            set_id: 103,
            name: "无关遗器".to_owned(),
            slot: "Head".to_owned(),
            rarity: 5,
            level: 15,
            mainstat: "HP".to_owned(),
            substats: Vec::new(),
            reroll_substats: None,
            preview_substats: None,
            location: "1220".to_owned(),
            equipped_character_id: None,
            lock: true,
            discard: false,
            _uid: 3,
        },
    ];
    snapshot.light_cones = vec![
        ImportLightCone {
            id: 20000,
            name: "测试光锥A".to_owned(),
            level: 80,
            ascension: 6,
            superimposition: 1,
            location: "8006".to_owned(),
            equipped_character_id: None,
            lock: true,
            _uid: 11,
        },
        ImportLightCone {
            id: 20001,
            name: "测试光锥B".to_owned(),
            level: 80,
            ascension: 6,
            superimposition: 1,
            location: "1220".to_owned(),
            equipped_character_id: None,
            lock: true,
            _uid: 12,
        },
    ];
    snapshot.characters = vec![
        ImportCharacter {
            id: 8006,
            name: "开拓者".to_owned(),
            path: "Harmony".to_owned(),
            level: 80,
            ascension: 6,
            eidolon: 6,
            skills: json!({}),
            traces: json!({}),
            memosprite: None,
            ability_version: 1,
        },
        ImportCharacter {
            id: 1224,
            name: "三月七".to_owned(),
            path: "Hunt".to_owned(),
            level: 80,
            ascension: 6,
            eidolon: 6,
            skills: json!({}),
            traces: json!({}),
            memosprite: None,
            ability_version: 1,
        },
        ImportCharacter {
            id: 1220,
            name: "飞霄".to_owned(),
            path: "Hunt".to_owned(),
            level: 80,
            ascension: 6,
            eidolon: 0,
            skills: json!({}),
            traces: json!({}),
            memosprite: None,
            ability_version: 1,
        },
    ];
    normalize_import(&mut snapshot);
    store.apply_full_snapshot(&snapshot).unwrap().unwrap();

    let by_name = store
        .list_relics(&RelicFilter {
            search: Some("开拓".to_owned()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(by_name.total, 1);
    assert_eq!(by_name.items[0].item_id, 1);

    let by_path = store
        .list_relics(&RelicFilter {
            search: Some("同谐".to_owned()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(by_path.total, 1);
    assert_eq!(by_path.items[0].item_id, 1);

    let by_dotted = store
        .list_relics(&RelicFilter {
            search: Some("三月七·巡猎".to_owned()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(by_dotted.total, 1);
    assert_eq!(by_dotted.items[0].item_id, 2);

    let cones = store
        .list_light_cones(&LightConeFilter {
            search: Some("开拓者·同谐".to_owned()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(cones.total, 1);
    assert_eq!(cones.items[0].item_id, 11);

    let feixiao = store
        .list_light_cones(&LightConeFilter {
            search: Some("飞霄".to_owned()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(feixiao.total, 1);
    assert_eq!(feixiao.items[0].item_id, 12);
}

#[test]
fn multi_path_equipment_survives_export_and_sync_round_trip() {
    let store = InventoryStore::test_store();
    let mut snapshot = import(10001, &[]);
    snapshot.relics = vec![
        ImportRelic {
            set_id: 101,
            name: "毁灭头".to_owned(),
            slot: "Head".to_owned(),
            rarity: 5,
            level: 15,
            mainstat: "HP".to_owned(),
            substats: Vec::new(),
            reroll_substats: None,
            preview_substats: None,
            location: "8006".to_owned(),
            equipped_character_id: None,
            lock: true,
            discard: false,
            _uid: 1,
        },
        ImportRelic {
            set_id: 102,
            name: "巡猎头".to_owned(),
            slot: "Head".to_owned(),
            rarity: 5,
            level: 15,
            mainstat: "HP".to_owned(),
            substats: Vec::new(),
            reroll_substats: None,
            preview_substats: None,
            location: "1224".to_owned(),
            equipped_character_id: None,
            lock: true,
            discard: false,
            _uid: 2,
        },
    ];
    snapshot.light_cones = vec![ImportLightCone {
        id: 20000,
        name: "光锥".to_owned(),
        level: 80,
        ascension: 6,
        superimposition: 1,
        location: "8006".to_owned(),
        equipped_character_id: None,
        lock: true,
        _uid: 11,
    }];
    snapshot.characters = vec![
        ImportCharacter {
            id: 8006,
            name: "开拓者".to_owned(),
            path: "Harmony".to_owned(),
            level: 80,
            ascension: 6,
            eidolon: 6,
            skills: json!({}),
            traces: json!({}),
            memosprite: None,
            ability_version: 1,
        },
        ImportCharacter {
            id: 1224,
            name: "三月七".to_owned(),
            path: "Hunt".to_owned(),
            level: 80,
            ascension: 6,
            eidolon: 6,
            skills: json!({}),
            traces: json!({}),
            memosprite: None,
            ability_version: 1,
        },
    ];
    store.apply_full_snapshot(&snapshot).unwrap().unwrap();

    let export_path = store.path.with_extension("multipath-export.json");
    store.export_to_path(&export_path).unwrap();
    let export: Value = serde_json::from_reader(File::open(&export_path).unwrap()).unwrap();
    // Exchange format must carry numeric owner ids for multi-path gear.
    let locations: Vec<String> = export["relics"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["location"].as_str().unwrap().to_owned())
        .collect();
    assert!(locations.contains(&"8006".to_owned()));
    assert!(locations.contains(&"1224".to_owned()));
    assert_eq!(export["light_cones"][0]["location"], "8006");

    let mut reimport: InventoryImport =
        serde_json::from_value(export).expect("export must match import contract");
    normalize_import(&mut reimport);
    store.clear(None).unwrap();
    store.apply_full_snapshot(&reimport).unwrap().unwrap();

    let trailblazer = store.detail(InventoryKind::Character, 8006).unwrap();
    let march = store.detail(InventoryKind::Character, 1224).unwrap();
    assert_eq!(
        trailblazer.data["equippedRelics"].as_array().unwrap().len(),
        1
    );
    assert_eq!(trailblazer.data["equippedRelics"][0]["itemId"], 1);
    assert_eq!(trailblazer.data["equippedLightCone"]["itemId"], 11);
    assert_eq!(march.data["equippedRelics"].as_array().unwrap().len(), 1);
    assert_eq!(march.data["equippedRelics"][0]["itemId"], 2);

    // WebDAV sync uses the same export builders.
    let synced = store.sync_snapshot().unwrap();
    store.clear(None).unwrap();
    store.replace_with_sync_snapshot(synced).unwrap();
    let trailblazer = store.detail(InventoryKind::Character, 8006).unwrap();
    assert_eq!(
        trailblazer.data["equippedRelics"].as_array().unwrap().len(),
        1
    );
    assert_eq!(trailblazer.data["equippedLightCone"]["itemId"], 11);
}

#[test]
fn build_dashboard_returns_saved_plan_with_character_equipment() {
    let store = InventoryStore::test_store();
    let mut snapshot = import(10001, &[1]);
    snapshot.relics[0].equipped_character_id = Some(1220);
    snapshot.characters = vec![ImportCharacter {
        id: 1220,
        name: "飞霄".to_owned(),
        path: "Hunt".to_owned(),
        level: 80,
        ascension: 6,
        eidolon: 2,
        skills: json!({ "basic": 6, "skill": 10, "ult": 10, "talent": 10 }),
        traces: json!({ "ability_1": true, "ability_2": true, "ability_3": true }),
        memosprite: None,
        ability_version: 1,
    }];
    store.apply_full_snapshot(&snapshot).unwrap().unwrap();

    let plan = CharacterBuildPlan {
        character_id: 1220,
        cavern_mode: "fourPiece".to_owned(),
        cavern_set_a: 101,
        cavern_set_b: None,
        planar_set_id: 201,
        main_stats: HashMap::new(),
        targets: vec![BuildTarget {
            stat_key: "SPD".to_owned(),
            target: 160.0,
            priority: 1,
            minimum: 140.0,
        }],
        effective_substats: vec!["SPD".to_owned()],
        note: String::new(),
        substat_weights: HashMap::new(),
        min_potential_pct: 40.0,
        spd_target: 0.0,
        game_version: String::new(),
        updated_at: 0,
    };
    store.save_build_plan(&plan).unwrap();
    let mut missing_character_plan = plan.clone();
    missing_character_plan.character_id = 9999;
    store.save_build_plan(&missing_character_plan).unwrap();

    let entries = store.build_dashboard().unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].plan.character_id, 1220);
    assert_eq!(entries[0].display_order, 0);
    assert!(!entries[0].pinned);
    assert_eq!(entries[0].character["equippedRelics"][0]["itemId"], 1);
    assert_eq!(entries[0].character["eidolon"], 2);
    assert_eq!(entries[0].character["skills"]["skill"], 10);
    assert_eq!(entries[0].character["traces"]["ability_1"], true);
    assert_eq!(entries[0].character["abilityVersion"], 1);
}

#[test]
fn relic_set_farming_profiles_include_weight_only_plans_and_keep_path_ids_isolated() {
    let store = InventoryStore::test_store();
    let mut snapshot = import(10001, &[1, 2]);
    snapshot.relics[0].equipped_character_id = Some(8006);
    snapshot.relics[0].location = "8006".to_owned();
    snapshot.relics[1].equipped_character_id = Some(8007);
    snapshot.relics[1].location = "8007".to_owned();
    snapshot.characters = vec![
        ImportCharacter {
            id: 8006,
            name: "开拓者".to_owned(),
            path: "Destruction".to_owned(),
            level: 80,
            ascension: 6,
            eidolon: 6,
            skills: json!({}),
            traces: json!({}),
            memosprite: None,
            ability_version: 1,
        },
        ImportCharacter {
            id: 8007,
            name: "开拓者".to_owned(),
            path: "Preservation".to_owned(),
            level: 80,
            ascension: 6,
            eidolon: 6,
            skills: json!({}),
            traces: json!({}),
            memosprite: None,
            ability_version: 1,
        },
    ];
    store.apply_full_snapshot(&snapshot).unwrap().unwrap();

    let base_plan = CharacterBuildPlan {
        character_id: 8006,
        cavern_mode: "fourPiece".to_owned(),
        cavern_set_a: 0,
        cavern_set_b: None,
        planar_set_id: 0,
        main_stats: HashMap::new(),
        targets: Vec::new(),
        effective_substats: vec!["SPD".to_owned()],
        note: String::new(),
        substat_weights: HashMap::new(),
        min_potential_pct: 40.0,
        spd_target: 0.0,
        game_version: String::new(),
        updated_at: 0,
    };
    store.save_build_plan(&base_plan).unwrap();
    store
        .save_build_plan(&CharacterBuildPlan {
            character_id: 8007,
            ..base_plan.clone()
        })
        .unwrap();
    store
        .save_build_plan(&CharacterBuildPlan {
            character_id: 9999,
            ..base_plan
        })
        .unwrap();

    let profiles = store.relic_set_farming_profiles().unwrap();
    assert_eq!(profiles.len(), 2);
    assert_eq!(
        profiles
            .iter()
            .map(|profile| profile.plan.character_id)
            .collect::<HashSet<_>>(),
        HashSet::from([8006, 8007])
    );
    assert!(profiles
        .iter()
        .all(|profile| profile.plan.targets.is_empty()));
    assert_eq!(
        profiles
            .iter()
            .find(|profile| profile.plan.character_id == 8006)
            .unwrap()
            .character["equippedRelics"][0]["itemId"],
        1
    );
    assert_eq!(
        profiles
            .iter()
            .find(|profile| profile.plan.character_id == 8007)
            .unwrap()
            .character["equippedRelics"][0]["itemId"],
        2
    );
}

#[test]
fn build_dashboard_reorders_pins_and_syncs_layout() {
    let store = InventoryStore::test_store();
    let mut snapshot = import(10001, &[]);
    snapshot.characters = vec![
        ImportCharacter {
            id: 1220,
            name: "飞霄".to_owned(),
            path: "Hunt".to_owned(),
            level: 80,
            ascension: 6,
            eidolon: 0,
            skills: json!({}),
            traces: json!({}),
            memosprite: None,
            ability_version: 1,
        },
        ImportCharacter {
            id: 1001,
            name: "三月七".to_owned(),
            path: "Preservation".to_owned(),
            level: 80,
            ascension: 6,
            eidolon: 0,
            skills: json!({}),
            traces: json!({}),
            memosprite: None,
            ability_version: 1,
        },
    ];
    store.apply_full_snapshot(&snapshot).unwrap().unwrap();

    let plan = CharacterBuildPlan {
        character_id: 1220,
        cavern_mode: "fourPiece".to_owned(),
        cavern_set_a: 101,
        cavern_set_b: None,
        planar_set_id: 201,
        main_stats: HashMap::new(),
        targets: vec![BuildTarget {
            stat_key: "SPD".to_owned(),
            target: 160.0,
            priority: 1,
            minimum: 140.0,
        }],
        effective_substats: vec![],
        note: String::new(),
        substat_weights: HashMap::new(),
        min_potential_pct: 40.0,
        spd_target: 0.0,
        game_version: String::new(),
        updated_at: 0,
    };
    store.save_build_plan(&plan).unwrap();
    store
        .save_build_plan(&CharacterBuildPlan {
            character_id: 1001,
            ..plan.clone()
        })
        .unwrap();

    store.reorder_build_dashboard(&[1001, 1220]).unwrap();
    store.set_build_dashboard_pinned(1220, true).unwrap();
    let entries = store.build_dashboard().unwrap();
    assert_eq!(
        entries
            .iter()
            .map(|entry| entry.plan.character_id)
            .collect::<Vec<_>>(),
        vec![1220, 1001]
    );
    assert!(entries[0].pinned);
    assert_eq!(entries[0].display_order, 1);

    let synced = store.sync_snapshot().unwrap();
    store.replace_with_sync_snapshot(synced).unwrap();
    let restored = store.build_dashboard().unwrap();
    assert_eq!(
        restored
            .iter()
            .map(|entry| entry.plan.character_id)
            .collect::<Vec<_>>(),
        vec![1220, 1001]
    );
    assert!(restored[0].pinned);
    assert_eq!(restored[0].display_order, 1);
}

#[test]
fn character_list_filters_and_marks_saved_build_plans() {
    let store = InventoryStore::test_store();
    let mut snapshot = import(10001, &[]);
    snapshot.characters = vec![
        ImportCharacter {
            id: 1220,
            name: "飞霄".to_owned(),
            path: "Hunt".to_owned(),
            level: 80,
            ascension: 6,
            eidolon: 0,
            skills: json!({}),
            traces: json!({}),
            memosprite: None,
            ability_version: 1,
        },
        ImportCharacter {
            id: 1008,
            name: "阿兰".to_owned(),
            path: "Hunt".to_owned(),
            level: 80,
            ascension: 6,
            eidolon: 0,
            skills: json!({}),
            traces: json!({}),
            memosprite: None,
            ability_version: 1,
        },
    ];
    store.apply_full_snapshot(&snapshot).unwrap().unwrap();
    store
        .save_build_plan(&CharacterBuildPlan {
            character_id: 1220,
            cavern_mode: "fourPiece".to_owned(),
            cavern_set_a: 101,
            cavern_set_b: None,
            planar_set_id: 201,
            main_stats: HashMap::new(),
            targets: vec![BuildTarget {
                stat_key: "SPD".to_owned(),
                target: 160.0,
                priority: 1,
                minimum: 140.0,
            }],
            effective_substats: vec![],
            note: String::new(),
            substat_weights: HashMap::new(),
            min_potential_pct: 40.0,
            spd_target: 0.0,
            game_version: String::new(),
            updated_at: 0,
        })
        .unwrap();

    let planned = store
        .list_characters(&CharacterFilter {
            has_build_plan: Some(true),
            ..Default::default()
        })
        .unwrap();
    let unplanned = store
        .list_characters(&CharacterFilter {
            has_build_plan: Some(false),
            ..Default::default()
        })
        .unwrap();
    let all = store.list_characters(&CharacterFilter::default()).unwrap();

    assert_eq!(planned.items.len(), 1);
    assert!(planned.items[0].has_build_plan);
    assert_eq!(unplanned.items.len(), 1);
    assert!(!unplanned.items[0].has_build_plan);
    assert_eq!(
        all.items
            .iter()
            .map(|character| character.character_id)
            .collect::<Vec<_>>(),
        vec![1220, 1008]
    );
}

#[test]
fn recommended_characters_for_relic_set_includes_cavern_and_planar_targets() {
    let store = InventoryStore::test_store();
    let mut snapshot = import(10001, &[1]);
    snapshot.characters = vec![
        ImportCharacter {
            id: 1220,
            name: "飞霄".to_owned(),
            path: "Hunt".to_owned(),
            level: 80,
            ascension: 6,
            eidolon: 0,
            skills: json!({}),
            traces: json!({}),
            memosprite: None,
            ability_version: 1,
        },
        ImportCharacter {
            id: 1001,
            name: "测试角色".to_owned(),
            path: "Hunt".to_owned(),
            level: 80,
            ascension: 6,
            eidolon: 0,
            skills: json!({}),
            traces: json!({}),
            memosprite: None,
            ability_version: 1,
        },
    ];
    store.apply_full_snapshot(&snapshot).unwrap().unwrap();

    let base_plan = CharacterBuildPlan {
        character_id: 1220,
        cavern_mode: "fourPiece".to_owned(),
        cavern_set_a: 101,
        cavern_set_b: None,
        planar_set_id: 201,
        main_stats: HashMap::from([("Body".to_owned(), vec!["CRIT Rate".to_owned()])]),
        targets: vec![BuildTarget {
            stat_key: "SPD".to_owned(),
            target: 160.0,
            priority: 1,
            minimum: 140.0,
        }],
        effective_substats: vec!["SPD".to_owned()],
        note: String::new(),
        substat_weights: HashMap::new(),
        min_potential_pct: 40.0,
        spd_target: 0.0,
        game_version: String::new(),
        updated_at: 0,
    };
    store.save_build_plan(&base_plan).unwrap();
    let second_plan = CharacterBuildPlan {
        character_id: 1001,
        cavern_mode: "twoPlusTwo".to_owned(),
        cavern_set_a: 102,
        cavern_set_b: Some(101),
        planar_set_id: 202,
        ..base_plan
    };
    store.save_build_plan(&second_plan).unwrap();
    let duplicate_two_plus_two = CharacterBuildPlan {
        cavern_set_b: Some(second_plan.cavern_set_a),
        ..second_plan.clone()
    };
    assert!(store
        .save_build_plan(&duplicate_two_plus_two)
        .unwrap_err()
        .to_string()
        .contains("2+2 件套不能选择相同的遗器套装"));

    let cavern_targets = store.recommended_characters_for_relic_set(101).unwrap();
    assert_eq!(cavern_targets.len(), 2);
    assert!(cavern_targets
        .iter()
        .any(|character| character.name == "飞霄"));
    assert!(cavern_targets
        .iter()
        .any(|character| character.name == "测试角色"));
    assert!(cavern_targets.iter().all(|character| {
        character.effective_substats == ["SPD"] && character.main_stats["Body"] == ["CRIT Rate"]
    }));
    assert_eq!(
        store.recommended_characters_for_relic_set(201).unwrap()[0].name,
        "飞霄"
    );
    let target_counts = store.relic_set_target_counts().unwrap();
    assert_eq!(
        target_counts
            .iter()
            .map(|item| (item.set_id, item.count))
            .collect::<Vec<_>>(),
        vec![(101, 2), (102, 1), (201, 1), (202, 1)]
    );
    assert!(store
        .recommended_characters_for_relic_set(999)
        .unwrap()
        .is_empty());
}

#[test]
fn relic_main_stat_scan_unions_targets_and_excludes_equipped_relics() {
    let store = InventoryStore::test_store();
    let mut snapshot = import(10001, &[1, 2, 3, 4]);
    snapshot.relics[1].slot = "Body".to_owned();
    snapshot.relics[1].mainstat = "CRIT Rate".to_owned();
    snapshot.relics[2].slot = "Body".to_owned();
    snapshot.relics[2].mainstat = "DEF%".to_owned();
    snapshot.relics[3].slot = "Feet".to_owned();
    snapshot.relics[3].mainstat = "SPD".to_owned();
    snapshot.relics[3].equipped_character_id = Some(1001);
    snapshot.relics[3].location = "测试角色".to_owned();
    store.apply_full_snapshot(&snapshot).unwrap().unwrap();

    let mut first_plan = CharacterBuildPlan {
        character_id: 1001,
        cavern_mode: "fourPiece".to_owned(),
        cavern_set_a: 101,
        cavern_set_b: None,
        planar_set_id: 201,
        main_stats: HashMap::from([
            ("Head".to_owned(), vec!["HP".to_owned()]),
            ("Body".to_owned(), vec!["CRIT Rate".to_owned()]),
        ]),
        targets: vec![BuildTarget {
            stat_key: "SPD".to_owned(),
            target: 160.0,
            priority: 1,
            minimum: 140.0,
        }],
        effective_substats: vec![],
        note: String::new(),
        substat_weights: HashMap::new(),
        min_potential_pct: 40.0,
        spd_target: 0.0,
        game_version: String::new(),
        updated_at: 0,
    };
    store.save_build_plan(&first_plan).unwrap();
    first_plan.character_id = 1002;
    first_plan.main_stats = HashMap::from([
        ("Body".to_owned(), vec!["ATK%".to_owned()]),
        ("Feet".to_owned(), vec!["SPD".to_owned()]),
    ]);
    store.save_build_plan(&first_plan).unwrap();

    let scan = store
        .scan_relics_by_main_stat(&PageQuery::default())
        .unwrap();
    assert_eq!(scan.plan_count, 2);
    assert_eq!(scan.total, 1);
    assert_eq!(scan.items[0].item_id, 3);
    assert_eq!(scan.allowed_main_stats["Body"], ["ATK%", "CRIT Rate"]);
    // Fixed slots always present when plans exist.
    assert_eq!(scan.allowed_main_stats["Head"], ["HP"]);
    assert_eq!(scan.allowed_main_stats["Hands"], ["ATK"]);
}

#[test]
fn relic_main_stat_scan_treats_head_hands_as_fixed_and_flags_body_mismatches() {
    let store = InventoryStore::test_store();
    let mut snapshot = import(10001, &[1, 2, 3]);
    // Two Head HP (fixed allowed) + one Body DEF% (unconfigured Body → mismatch).
    snapshot.relics[2].slot = "Body".to_owned();
    snapshot.relics[2].mainstat = "DEF%".to_owned();
    store.apply_full_snapshot(&snapshot).unwrap().unwrap();
    let plan = CharacterBuildPlan {
        character_id: 1001,
        cavern_mode: "fourPiece".to_owned(),
        cavern_set_a: 101,
        cavern_set_b: None,
        planar_set_id: 201,
        // Only Body empty / missing Head/Hands — fixed slots still configured by default.
        main_stats: HashMap::from([("Body".to_owned(), vec![])]),
        targets: vec![BuildTarget {
            stat_key: "SPD".to_owned(),
            target: 160.0,
            priority: 1,
            minimum: 140.0,
        }],
        effective_substats: vec![],
        note: String::new(),
        substat_weights: HashMap::new(),
        min_potential_pct: 40.0,
        spd_target: 0.0,
        game_version: String::new(),
        updated_at: 0,
    };
    store.save_build_plan(&plan).unwrap();

    let scan = store
        .scan_relics_by_main_stat(&PageQuery::default())
        .unwrap();
    assert_eq!(scan.allowed_main_stats["Head"], ["HP"]);
    assert_eq!(scan.allowed_main_stats["Hands"], ["ATK"]);
    // Head HP pieces are allowed by fixed defaults; only Body shows as unconfigured mismatch.
    assert_eq!(scan.total, 1);
    assert_eq!(scan.items[0].slot, "Body");
    assert!(!scan.allowed_main_stats.contains_key("Body"));

    // Plans with only selectable slots configured: Head/Hands fixed still suppress matches.
    let mut body_plan = plan;
    body_plan.character_id = 1002;
    body_plan.main_stats = HashMap::from([("Body".to_owned(), vec!["CRIT Rate".to_owned()])]);
    store.save_build_plan(&body_plan).unwrap();
    let scan2 = store
        .scan_relics_by_main_stat(&PageQuery {
            page: 1,
            page_size: 1,
        })
        .unwrap();
    assert_eq!(scan2.total, 1);
    assert_eq!(scan2.items.len(), 1);
    assert_eq!(scan2.items[0].slot, "Body");
    assert_eq!(scan2.allowed_main_stats["Head"], ["HP"]);
    assert_eq!(scan2.allowed_main_stats["Body"], ["CRIT Rate"]);
}

#[test]
fn blocks_account_mixing_until_replaced() {
    let store = InventoryStore::test_store();
    store
        .apply_full_snapshot(&import(10001, &[1]))
        .unwrap()
        .unwrap();
    let mismatch = store
        .apply_full_snapshot(&import(20002, &[2]))
        .unwrap()
        .unwrap_err();
    assert_eq!(mismatch.existing_uid, 10001);
    assert_eq!(store.summary().unwrap().relics, 1);
    store
        .replace_account_and_apply(&import(20002, &[2]))
        .unwrap();
    assert_eq!(store.current_uid().unwrap(), Some(20002));
    assert!(store.detail(InventoryKind::Relic, 2).is_ok());
}

#[test]
fn filters_and_rejects_empty_deletes() {
    let store = InventoryStore::test_store();
    store
        .apply_full_snapshot(&import(10001, &[1]))
        .unwrap()
        .unwrap();
    let page = store
        .list_relics(&RelicFilter {
            sub_stats: Some(vec!["CRIT Rate".to_owned()]),
            min_substat_count: Some(2),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(page.total, 1);
    let no_match = store
        .list_relics(&RelicFilter {
            max_substat_count: Some(1),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(no_match.total, 0);
    let error = store
        .delete_items(&DeleteItemsRequest {
            kind: InventoryKind::Relic,
            ids: Vec::new(),
        })
        .unwrap_err();
    assert!(matches!(error, AppError::EmptyDeleteRequest));
}

#[test]
fn local_delete_is_restored_by_next_snapshot_and_exports() {
    let store = InventoryStore::test_store();
    let mut snapshot = import(10001, &[1, 2]);
    snapshot.relics[0].reroll_substats = Some(vec![ImportSubstat {
        key: "CRIT DMG".to_owned(),
        value: 12.9,
        count: 3,
        step: 2,
    }]);
    snapshot.relics[0].preview_substats = Some(vec![ImportSubstat {
        key: "SPD".to_owned(),
        value: 5.1,
        count: 2,
        step: 1,
    }]);
    store.apply_full_snapshot(&snapshot).unwrap().unwrap();
    store
        .delete_items(&DeleteItemsRequest {
            kind: InventoryKind::Relic,
            ids: vec![1],
        })
        .unwrap();
    assert_eq!(store.summary().unwrap().relics, 1);

    store.apply_full_snapshot(&snapshot).unwrap().unwrap();
    assert_eq!(store.summary().unwrap().relics, 2);
    let second_page = store
        .list_relics(&RelicFilter {
            page: PageQuery {
                page: 2,
                page_size: 1,
            },
            ..Default::default()
        })
        .unwrap();
    assert_eq!(second_page.total, 2);
    assert_eq!(second_page.items.len(), 1);

    let export_path = store.path.with_extension("json");
    store.export_to_path(&export_path).unwrap();
    let export: Value = serde_json::from_reader(File::open(export_path).unwrap()).unwrap();
    assert_eq!(export["materials"], json!([]));
    assert_eq!(export["relics"].as_array().unwrap().len(), 2);
    assert_eq!(export["relics"][0]["reroll_substats"][0]["key"], "CRIT DMG");
    assert_eq!(export["relics"][0]["preview_substats"][0]["key"], "SPD");
}

#[test]
fn accepts_string_ids_from_reliquary_export() {
    let payload: InventoryImport = serde_json::from_value(json!({
        "metadata": { "uid": 10001, "trailblazer": "Stelle" },
        "relics": [{
            "set_id": "101",
            "name": "测试套装",
            "slot": "Head",
            "rarity": 5,
            "level": 15,
            "mainstat": "HP",
            "substats": [],
            "location": "",
            "lock": false,
            "discard": false,
            "_uid": "90001"
        }],
        "light_cones": [{
            "id": "20001",
            "name": "测试光锥",
            "level": 80,
            "ascension": 6,
            "superimposition": 1,
            "location": "",
            "lock": true,
            "_uid": "90002"
        }],
        "characters": [{
            "id": "1001",
            "name": "测试角色",
            "path": "Harmony",
            "level": 80,
            "ascension": 6,
            "eidolon": 0,
            "skills": {},
            "traces": {"elation_debt": true},
            "affinitive_eidolons": [1, 2],
            "ability_version": 1
        }],
        "recon_relics": [90001]
    }))
    .unwrap();
    assert_eq!(payload.relics[0]._uid, 90001);
    assert_eq!(payload.light_cones[0].id, 20001);
    assert_eq!(payload.characters[0].id, 1001);
    assert_eq!(payload.characters[0].traces["elation_debt"], true);
}

#[test]
fn real_export_is_normalized_before_sqlite_filters() {
    let store = InventoryStore::test_store();
    let mut snapshot: InventoryImport =
        serde_json::from_str(include_str!("../../../../examples/starrail-inventory.json")).unwrap();
    let report = super::super::normalize_import(&mut snapshot);
    assert!(report.warnings().is_empty());
    store.apply_full_snapshot(&snapshot).unwrap().unwrap();

    let links = store
        .list_relics(&RelicFilter {
            page: PageQuery {
                page: 1,
                page_size: 10,
            },
            slots: Some(vec!["LinkRope".to_owned()]),
            ..Default::default()
        })
        .unwrap();
    assert!(links.total > 0);
    assert!(links.items.iter().all(|item| item.slot == "LinkRope"));

    let chinese_set = store
        .list_relics(&RelicFilter {
            page: PageQuery {
                page: 1,
                page_size: 10,
            },
            search: Some("晨昏交界的翔鹰".to_owned()),
            ..Default::default()
        })
        .unwrap();
    assert!(chinese_set.total > 0);
}

#[test]
fn migration_normalizes_existing_exporter_records() {
    let store = InventoryStore::test_store();
    let raw = InventoryImport {
        metadata: ImportMetadata {
            uid: None,
            trailblazer: None,
        },
        relics: vec![ImportRelic {
            set_id: 110,
            name: "Eagle of Twilight Line".to_owned(),
            slot: "Link Rope".to_owned(),
            rarity: 5,
            level: 15,
            mainstat: "ATK".to_owned(),
            substats: vec![ImportSubstat {
                key: "Effect Hit Rate%".to_owned(),
                value: 3.2,
                count: 1,
                step: 0,
            }],
            reroll_substats: None,
            preview_substats: None,
            location: "1220".to_owned(),
            equipped_character_id: None,
            lock: false,
            discard: false,
            _uid: 99,
        }],
        light_cones: Vec::new(),
        characters: Vec::new(),
    };
    store.apply_full_snapshot(&raw).unwrap().unwrap();
    let connection = store.connect().unwrap();
    normalize_existing_records(&connection).unwrap();
    let item = store.detail(InventoryKind::Relic, 99).unwrap();
    assert_eq!(item.data["setName"], "晨昏交界的翔鹰");
    assert_eq!(item.data["slot"], "LinkRope");
    assert_eq!(item.data["mainStat"], "ATK%");
    assert_eq!(item.data["location"], "飞霄");
    assert_eq!(item.data["equippedCharacterId"], 1220);
    assert_eq!(item.data["substats"][0]["key"], "Effect Hit Rate");
}

#[test]
fn build_plan_survives_inventory_clear() {
    let store = InventoryStore::test_store();
    let plan = CharacterBuildPlan {
        character_id: 1001,
        cavern_mode: "fourPiece".to_owned(),
        cavern_set_a: 101,
        cavern_set_b: None,
        planar_set_id: 201,
        main_stats: HashMap::new(),
        targets: vec![BuildTarget {
            stat_key: "SPD".to_owned(),
            target: 180.0,
            priority: 1,
            minimum: 170.0,
        }],
        effective_substats: vec!["SPD".to_owned(), "CRIT Rate".to_owned()],
        note: "优先补速度".to_owned(),
        substat_weights: HashMap::new(),
        min_potential_pct: 40.0,
        spd_target: 0.0,
        game_version: String::new(),
        updated_at: 0,
    };
    store.save_build_plan(&plan).unwrap();
    store.clear(None).unwrap();
    let restored = store.build_plan(1001).unwrap().unwrap();
    assert_eq!(restored.targets[0].target, 180.0);
    assert_eq!(
        restored.effective_substats,
        vec!["SPD".to_owned(), "CRIT Rate".to_owned()]
    );
    assert_eq!(restored.note, "优先补速度");
}

#[test]
fn legacy_six_effective_substats_are_preserved_until_edited() {
    let store = InventoryStore::test_store();
    let mut plan = CharacterBuildPlan {
        character_id: 1001,
        cavern_mode: "fourPiece".to_owned(),
        cavern_set_a: 101,
        cavern_set_b: None,
        planar_set_id: 201,
        main_stats: HashMap::new(),
        targets: vec![BuildTarget {
            stat_key: "SPD".to_owned(),
            target: 134.0,
            priority: 1,
            minimum: 120.0,
        }],
        effective_substats: vec![
            "SPD".to_owned(),
            "CRIT Rate".to_owned(),
            "CRIT DMG".to_owned(),
            "ATK%".to_owned(),
            "Break Effect".to_owned(),
            "HP".to_owned(),
        ],
        note: String::new(),
        substat_weights: HashMap::new(),
        min_potential_pct: 40.0,
        spd_target: 0.0,
        game_version: String::new(),
        updated_at: 0,
    };
    store.save_build_plan(&plan).unwrap();
    let connection = store.connect().unwrap();
    connection
            .execute(
                "UPDATE character_build_plans SET effective_substats_json = ?1 WHERE character_id = 1001",
                [serde_json::to_string(&plan.effective_substats).unwrap()],
            )
            .unwrap();

    store.save_build_plan(&plan).unwrap();
    assert_eq!(
        store
            .build_plan(1001)
            .unwrap()
            .unwrap()
            .effective_substats
            .len(),
        6
    );

    plan.effective_substats.pop();
    store.save_build_plan(&plan).unwrap();
    assert_eq!(
        store
            .build_plan(1001)
            .unwrap()
            .unwrap()
            .effective_substats
            .len(),
        5
    );
}

#[test]
fn saves_weight_only_plan_before_graduation_targets_are_configured() {
    let store = InventoryStore::test_store();
    let plan = CharacterBuildPlan {
        character_id: 1001,
        cavern_mode: "fourPiece".to_owned(),
        cavern_set_a: 0,
        cavern_set_b: None,
        planar_set_id: 0,
        main_stats: HashMap::new(),
        targets: Vec::new(),
        effective_substats: Vec::new(),
        note: String::new(),
        substat_weights: HashMap::from([("SPD".to_owned(), 0.75)]),
        min_potential_pct: 40.0,
        spd_target: 0.0,
        game_version: String::new(),
        updated_at: 0,
    };

    store.save_build_plan(&plan).unwrap();

    assert_eq!(
        store
            .build_plan(1001)
            .unwrap()
            .unwrap()
            .substat_weights
            .get("SPD"),
        Some(&0.75)
    );
    assert!(store.build_dashboard().unwrap().is_empty());

    let too_many_weights = CharacterBuildPlan {
        substat_weights: HashMap::from([
            ("HP".to_owned(), 0.25),
            ("HP%".to_owned(), 0.25),
            ("ATK%".to_owned(), 0.75),
            ("SPD".to_owned(), 1.0),
            ("CRIT Rate".to_owned(), 1.0),
            ("CRIT DMG".to_owned(), 1.0),
        ]),
        ..plan
    };
    assert!(store.save_build_plan(&too_many_weights).is_err());
}

#[test]
fn migration_converts_percentage_build_targets_to_flat_stats() {
    let store = InventoryStore::test_store();
    let plan = CharacterBuildPlan {
        character_id: 1001,
        cavern_mode: "fourPiece".to_owned(),
        cavern_set_a: 101,
        cavern_set_b: None,
        planar_set_id: 201,
        main_stats: HashMap::new(),
        targets: vec![BuildTarget {
            stat_key: "SPD".to_owned(),
            target: 134.0,
            priority: 1,
            minimum: 120.0,
        }],
        effective_substats: Vec::new(),
        note: String::new(),
        substat_weights: HashMap::new(),
        min_potential_pct: 40.0,
        spd_target: 0.0,
        game_version: String::new(),
        updated_at: 0,
    };
    store.save_build_plan(&plan).unwrap();
    let connection = store.connect().unwrap();
    connection
        .execute(
            "UPDATE character_build_targets SET stat_key = 'HP%' WHERE character_id = 1001",
            [],
        )
        .unwrap();
    connection
        .execute("UPDATE schema_meta SET version = 12", [])
        .unwrap();

    store.migrate(&connection).unwrap();

    let restored = store.build_plan(1001).unwrap().unwrap();
    assert_eq!(restored.targets[0].stat_key, "HP");
    assert_eq!(restored.targets[0].target, 134.0);
    assert_eq!(restored.targets[0].minimum, 120.0);
}

#[test]
fn build_plan_score_weights_round_trip_including_zero_threshold() {
    let store = InventoryStore::test_store();
    let mut snapshot = import(10001, &[]);
    snapshot.characters = vec![ImportCharacter {
        id: 1001,
        name: "三月七".to_owned(),
        path: "Preservation".to_owned(),
        level: 80,
        ascension: 6,
        eidolon: 0,
        skills: json!({}),
        traces: json!({}),
        memosprite: None,
        ability_version: 1,
    }];
    store.apply_full_snapshot(&snapshot).unwrap().unwrap();

    let plan = CharacterBuildPlan {
        character_id: 1001,
        cavern_mode: "fourPiece".to_owned(),
        cavern_set_a: 101,
        cavern_set_b: None,
        planar_set_id: 201,
        main_stats: HashMap::new(),
        targets: vec![BuildTarget {
            stat_key: "SPD".to_owned(),
            target: 134.0,
            priority: 1,
            minimum: 120.0,
        }],
        effective_substats: vec!["SPD".to_owned()],
        note: String::new(),
        substat_weights: HashMap::from([
            ("SPD".to_owned(), 1.0),
            ("CRIT Rate".to_owned(), 0.75),
            ("ATK%".to_owned(), 0.5),
        ]),
        min_potential_pct: 0.0,
        spd_target: 160.0,
        game_version: String::new(),
        updated_at: 0,
    };
    store.save_build_plan(&plan).unwrap();
    let restored = store.build_plan(1001).unwrap().unwrap();
    assert_eq!(restored.substat_weights.get("SPD"), Some(&1.0));
    assert_eq!(restored.substat_weights.get("CRIT Rate"), Some(&0.75));
    assert_eq!(restored.substat_weights.get("ATK%"), Some(&0.5));
    assert_eq!(restored.min_potential_pct, 0.0);
    assert_eq!(restored.spd_target, 160.0);
}

#[test]
fn build_plan_note_round_trips_and_defaults_empty() {
    let store = InventoryStore::test_store();
    let mut snapshot = import(10001, &[]);
    snapshot.characters = vec![ImportCharacter {
        id: 1001,
        name: "三月七".to_owned(),
        path: "Preservation".to_owned(),
        level: 80,
        ascension: 6,
        eidolon: 0,
        skills: json!({}),
        traces: json!({}),
        memosprite: None,
        ability_version: 1,
    }];
    store.apply_full_snapshot(&snapshot).unwrap().unwrap();

    let mut plan = CharacterBuildPlan {
        character_id: 1001,
        cavern_mode: "fourPiece".to_owned(),
        cavern_set_a: 101,
        cavern_set_b: None,
        planar_set_id: 201,
        main_stats: HashMap::new(),
        targets: vec![BuildTarget {
            stat_key: "CRIT DMG".to_owned(),
            target: 200.0,
            priority: 1,
            minimum: 180.0,
        }],
        effective_substats: vec![],
        note: String::new(),
        substat_weights: HashMap::new(),
        min_potential_pct: 40.0,
        spd_target: 0.0,
        game_version: String::new(),
        updated_at: 0,
    };
    store.save_build_plan(&plan).unwrap();
    assert_eq!(store.build_plan(1001).unwrap().unwrap().note, "");

    plan.note = "  配队：虚数队副C  ".to_owned();
    store.save_build_plan(&plan).unwrap();
    assert_eq!(
        store.build_plan(1001).unwrap().unwrap().note,
        "配队：虚数队副C"
    );
    assert_eq!(
        store.build_dashboard().unwrap()[0].plan.note,
        "配队：虚数队副C"
    );

    plan.note = format!("前缀{}", "长".repeat(600));
    store.save_build_plan(&plan).unwrap();
    let truncated = store.build_plan(1001).unwrap().unwrap().note;
    assert_eq!(truncated.chars().count(), MAX_BUILD_PLAN_NOTE_LEN);
    assert!(truncated.starts_with("前缀"));
}

#[test]
fn calculates_fixed_main_stat_growth_from_rarity_and_level() {
    assert!((main_stat_value(5, 15, "SPD") - 25.032).abs() < 0.001);
    assert!((main_stat_value(5, 15, "HP") - 705.6).abs() < 0.001);
    assert!((main_stat_value(5, 15, "CRIT Rate") - 32.4).abs() < 0.001);
    assert!((main_stat_value(4, 12, "SPD") - 16.4256).abs() < 0.001);
}

#[test]
fn optimizer_context_uses_character_ids_for_multi_path_equipment() {
    let store = InventoryStore::test_store();
    let connection = store.connect().unwrap();
    for (character_id, path) in [(1001, "Preservation"), (1002, "Remembrance")] {
        connection
                .execute(
                    "INSERT INTO characters(character_id, name, path, level, ascension, eidolon, rarity, skills_json, traces_json, ability_version, source, updated_at)
                     VALUES(?1, '三月七', ?2, 80, 6, 0, 4, '{}', '{}', 1, 'test', 0)",
                    params![character_id, path],
                )
                .unwrap();
    }
    connection
            .execute(
                "INSERT INTO light_cones(item_id, template_id, name, level, ascension, superimposition, location, equipped_character_id, locked, source, updated_at)
                 VALUES(10, 23001, '测试光锥', 80, 6, 1, '三月七', 1001, 1, 'test', 0)",
                [],
            )
            .unwrap();
    for (item_id, owner, rarity) in [(1, Some(1001), 5), (2, Some(1002), 5), (3, Some(1001), 4)] {
        connection
                .execute(
                    "INSERT INTO relics(item_id, set_id, name, set_name, slot, rarity, level, main_stat, main_stat_value, location, equipped_character_id, locked, discard, source, updated_at)
                     VALUES(?1, 101, '测试遗器', '测试套装', 'Head', ?3, 15, 'HP', 705.6, '三月七', ?2, 0, 0, 'test', 0)",
                    params![item_id, owner, rarity],
                )
                .unwrap();
    }
    connection
        .execute(
            "INSERT INTO relic_substats(relic_id, kind, position, stat_key, value, count, step)
                 VALUES(1, 'normal', 0, 'SPD', 2.6, 1, 2)",
            [],
        )
        .unwrap();

    let context = store.relic_optimizer_context(1001).unwrap();
    assert_eq!(context.character.character_id, 1001);
    assert_eq!(context.character.path, "Preservation");
    assert_eq!(context.equipped_light_cone.unwrap().item_id, 10);
    assert_eq!(
        context
            .relics
            .iter()
            .map(|relic| relic.item_id)
            .collect::<Vec<_>>(),
        vec![1, 2, 3]
    );
    assert_eq!(context.relics[0].equipped_character_id, Some(1001));
    assert_eq!(context.relics[1].equipped_character_id, Some(1002));
    assert_eq!(context.relics[0].substats[0].count, 1);
}

#[test]
fn sync_snapshot_round_trips_inventory_and_build_plan() {
    let store = InventoryStore::test_store();
    store
        .apply_full_snapshot(&import(10001, &[1, 2]))
        .unwrap()
        .unwrap();
    let plan = CharacterBuildPlan {
        character_id: 1001,
        cavern_mode: "fourPiece".to_owned(),
        cavern_set_a: 101,
        cavern_set_b: None,
        planar_set_id: 201,
        main_stats: HashMap::from([("Body".to_owned(), vec!["CRIT Rate".to_owned()])]),
        targets: vec![BuildTarget {
            stat_key: "SPD".to_owned(),
            target: 160.0,
            priority: 1,
            minimum: 140.0,
        }],
        effective_substats: vec!["SPD".to_owned()],
        note: String::new(),
        substat_weights: HashMap::new(),
        min_potential_pct: 40.0,
        spd_target: 0.0,
        game_version: String::new(),
        updated_at: 0,
    };
    store.save_build_plan(&plan).unwrap();
    let snapshot = store.sync_snapshot().unwrap();
    assert_eq!(snapshot.format_version, SYNC_FORMAT_VERSION);
    store.clear(None).unwrap();
    let summary = store.replace_with_sync_snapshot(snapshot).unwrap();
    assert_eq!((summary.relics, summary.characters), (2, 0));
    let restored = store.build_plan(1001).unwrap().unwrap();
    assert_eq!(restored.character_id, plan.character_id);
    assert_eq!(restored.targets[0].minimum, 140.0);
    assert_eq!(restored.effective_substats, plan.effective_substats);
}

#[test]
fn sync_snapshot_uses_local_change_version_and_remote_restore_baseline() {
    let store = InventoryStore::test_store();
    store
        .apply_full_snapshot(&import(10001, &[1]))
        .unwrap()
        .unwrap();
    let imported_at = store.sync_snapshot().unwrap().generated_at;
    assert!(imported_at > 0);

    store.clear(Some(InventoryKind::Relic)).unwrap();
    let cleared_at = store.sync_snapshot().unwrap().generated_at;
    assert!(cleared_at > imported_at);

    let mut remote = store.sync_snapshot().unwrap();
    remote.generated_at = 123;
    store
        .replace_with_sync_snapshot_at_revision(remote, Some("remote-123"), None)
        .unwrap();
    assert_eq!(store.sync_snapshot().unwrap().generated_at, 123);
    let synced = store.sync_local_state().unwrap();
    assert!(!synced.is_dirty());
    assert_eq!(synced.remote_revision.as_deref(), Some("remote-123"));

    let stale_download = store.sync_snapshot().unwrap();
    store.clear(Some(InventoryKind::Relic)).unwrap();
    assert!(store.sync_local_state().unwrap().is_dirty());
    let changed_at = store.sync_local_state().unwrap().generated_at;
    let error = store
        .replace_with_sync_snapshot_at_revision(stale_download, Some("remote-123"), Some(123))
        .unwrap_err();
    assert!(error.to_string().contains("下载期间本地数据已变化"));
    assert_eq!(store.sync_local_state().unwrap().generated_at, changed_at);
}

#[test]
fn sync_snapshot_round_trips_local_teams() {
    let store = InventoryStore::test_store();
    seed_characters(
        &store,
        &[(1001, "三月七", "Preservation"), (1002, "丹恒", "Hunt")],
    );
    let created = store
        .save_team(&TeamInput {
            team_id: None,
            name: "同步配队".to_owned(),
            note: "WebDAV".to_owned(),
            character_ids: vec![Some(1001), Some(1002), None, None],
        })
        .unwrap();

    let snapshot = store.sync_snapshot().unwrap();
    assert_eq!(snapshot.teams.len(), 1);
    assert_eq!(snapshot.teams[0].team_id, created.team_id);
    assert_eq!(snapshot.teams[0].name, "同步配队");
    assert_eq!(
        snapshot.teams[0].character_ids,
        vec![Some(1001), Some(1002), None, None]
    );

    // Local-only clear keeps teams (inventory wipe); WebDAV restore must replace them.
    store.clear(None).unwrap();
    assert_eq!(store.summary().unwrap().teams, 1);

    let mut empty = snapshot.clone();
    empty.teams.clear();
    store.replace_with_sync_snapshot(empty).unwrap();
    assert_eq!(store.summary().unwrap().teams, 0);

    store.replace_with_sync_snapshot(snapshot).unwrap();
    let restored = store.get_team(created.team_id).unwrap();
    assert_eq!(restored.name, "同步配队");
    assert_eq!(restored.note, "WebDAV");
    assert_eq!(
        restored.members[0]
            .as_ref()
            .map(|member| member.character_id),
        Some(1001)
    );
    assert_eq!(store.summary().unwrap().teams, 1);
}

#[test]
fn legacy_sync_snapshot_without_teams_clears_local_teams_on_restore() {
    let store = InventoryStore::test_store();
    seed_characters(&store, &[(1001, "三月七", "Preservation")]);
    store
        .save_team(&TeamInput {
            team_id: None,
            name: "仅本机".to_owned(),
            note: String::new(),
            character_ids: vec![Some(1001), None, None, None],
        })
        .unwrap();
    let mut snapshot = store.sync_snapshot().unwrap();
    snapshot.format_version = SYNC_FORMAT_VERSION_V2;
    snapshot.teams.clear();

    store.replace_with_sync_snapshot(snapshot).unwrap();
    assert_eq!(store.summary().unwrap().teams, 0);
}

#[test]
fn sync_snapshot_rejects_unknown_version_without_replacing_data() {
    let store = InventoryStore::test_store();
    store
        .apply_full_snapshot(&import(10001, &[1]))
        .unwrap()
        .unwrap();
    let mut snapshot = store.sync_snapshot().unwrap();
    snapshot.format_version += 1;
    assert!(store.replace_with_sync_snapshot(snapshot).is_err());
    assert_eq!(store.summary().unwrap().relics, 1);
}

#[test]
fn sync_snapshot_accepts_layoutless_legacy_version() {
    let store = InventoryStore::test_store();
    store
        .apply_full_snapshot(&import(10001, &[1]))
        .unwrap()
        .unwrap();
    let mut snapshot = store.sync_snapshot().unwrap();
    snapshot.format_version = LEGACY_SYNC_FORMAT_VERSION;
    snapshot.build_layouts.clear();

    store.clear(None).unwrap();
    store.replace_with_sync_snapshot(snapshot).unwrap();

    assert_eq!(store.summary().unwrap().relics, 1);
}

#[test]
fn sync_restore_removes_local_plans_and_missing_account_metadata() {
    let store = InventoryStore::test_store();
    store
        .apply_full_snapshot(&import(10001, &[1]))
        .unwrap()
        .unwrap();
    store
        .save_build_plan(&CharacterBuildPlan {
            character_id: 1001,
            cavern_mode: "fourPiece".to_owned(),
            cavern_set_a: 101,
            cavern_set_b: None,
            planar_set_id: 201,
            main_stats: HashMap::new(),
            targets: vec![BuildTarget {
                stat_key: "SPD".to_owned(),
                target: 160.0,
                priority: 1,
                minimum: 140.0,
            }],
            effective_substats: vec![],
            note: String::new(),
            substat_weights: HashMap::new(),
            min_potential_pct: 40.0,
            spd_target: 0.0,
            game_version: String::new(),
            updated_at: 0,
        })
        .unwrap();
    let mut snapshot = store.sync_snapshot().unwrap();
    snapshot.inventory.metadata = ImportMetadata {
        uid: None,
        trailblazer: None,
    };
    snapshot.build_plans.clear();

    store.replace_with_sync_snapshot(snapshot).unwrap();

    assert!(store.build_plan(1001).unwrap().is_none());
    assert_eq!(store.current_uid().unwrap(), None);
    let trailblazer: Option<String> = store
        .connect()
        .unwrap()
        .query_row(
            "SELECT value FROM app_state WHERE key = 'trailblazer'",
            [],
            |row| row.get(0),
        )
        .optional()
        .unwrap();
    assert_eq!(trailblazer, None);
}

fn seed_characters(store: &InventoryStore, characters: &[(u32, &str, &str)]) {
    let import = InventoryImport {
        metadata: ImportMetadata {
            uid: Some(10001),
            trailblazer: Some("Stelle".to_owned()),
        },
        relics: Vec::new(),
        light_cones: Vec::new(),
        characters: characters
            .iter()
            .map(|(id, name, path)| ImportCharacter {
                id: *id,
                name: (*name).to_owned(),
                path: (*path).to_owned(),
                level: 80,
                ascension: 6,
                eidolon: 0,
                skills: json!({}),
                traces: json!({}),
                memosprite: None,
                ability_version: 1,
            })
            .collect(),
    };
    store.apply_full_snapshot(&import).unwrap().unwrap();
}

#[test]
fn team_crud_search_and_summary_count() {
    let store = InventoryStore::test_store();
    seed_characters(
        &store,
        &[
            (1001, "三月七", "Preservation"),
            (1002, "丹恒", "Hunt"),
            (1003, "姬子", "Erudition"),
            (1004, "瓦尔特", "Nihility"),
        ],
    );

    let created = store
        .save_team(&TeamInput {
            team_id: None,
            name: "  虚数队  ".to_owned(),
            note: "  二队主C  ".to_owned(),
            character_ids: vec![Some(1001), Some(1002), None, Some(1003)],
        })
        .unwrap();
    assert_eq!(created.name, "虚数队");
    assert_eq!(created.note, "二队主C");
    assert_eq!(created.members.len(), 4);
    assert_eq!(
        created.members[0]
            .as_ref()
            .map(|member| member.character_id),
        Some(1001)
    );
    assert!(created.members[2].is_none());
    assert_eq!(store.summary().unwrap().teams, 1);

    let listed = store
        .list_teams(&TeamFilter {
            page: PageQuery {
                page: 1,
                page_size: 50,
            },
            search: Some("虚数".to_owned()),
        })
        .unwrap();
    assert_eq!(listed.total, 1);
    assert_eq!(listed.items[0].team_id, created.team_id);

    let by_note = store
        .list_teams(&TeamFilter {
            page: PageQuery {
                page: 1,
                page_size: 50,
            },
            search: Some("主C".to_owned()),
        })
        .unwrap();
    assert_eq!(by_note.total, 1);

    let updated = store
        .save_team(&TeamInput {
            team_id: Some(created.team_id),
            name: "虚数队改".to_owned(),
            note: String::new(),
            character_ids: vec![Some(1004), Some(1002), Some(1001), None],
        })
        .unwrap();
    assert_eq!(updated.name, "虚数队改");
    assert_eq!(
        updated.members[0]
            .as_ref()
            .map(|member| member.name.as_str()),
        Some("瓦尔特")
    );

    store.delete_team(created.team_id).unwrap();
    assert_eq!(store.summary().unwrap().teams, 0);
    assert!(store.get_team(created.team_id).is_err());
}

#[test]
fn team_rejects_empty_name_duplicates_and_missing_characters() {
    let store = InventoryStore::test_store();
    seed_characters(
        &store,
        &[(1001, "三月七", "Preservation"), (1002, "丹恒", "Hunt")],
    );

    let empty = store.save_team(&TeamInput {
        team_id: None,
        name: "   ".to_owned(),
        note: String::new(),
        character_ids: vec![None, None, None, None],
    });
    assert!(empty.is_err());

    let duplicate = store.save_team(&TeamInput {
        team_id: None,
        name: "重复队".to_owned(),
        note: String::new(),
        character_ids: vec![Some(1001), Some(1001), None, None],
    });
    assert!(duplicate.is_err());

    let missing = store.save_team(&TeamInput {
        team_id: None,
        name: "幽灵队".to_owned(),
        note: String::new(),
        character_ids: vec![Some(9999), None, None, None],
    });
    assert!(missing.is_err());

    let wrong_len = store.save_team(&TeamInput {
        team_id: None,
        name: "槽位错误".to_owned(),
        note: String::new(),
        character_ids: vec![Some(1001)],
    });
    assert!(wrong_len.is_err());
}

#[test]
fn character_build_score_persists_and_appears_on_team_members() {
    let store = InventoryStore::test_store();
    seed_characters(&store, &[(1001, "三月七", "Preservation")]);
    store
        .upsert_character_build_score(&CharacterBuildScore {
            character_id: 1001,
            letter_grade: "A-".to_owned(),
            potential_pct: 71.0,
            completion_pct: 65.0,
            relic_count: 6,
            has_plan: false,
            computed_at: 1,
        })
        .unwrap();
    let listed = store.list_character_build_scores(&[1001, 9999]).unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].letter_grade, "A-");

    let team = store
        .save_team(&TeamInput {
            team_id: None,
            name: "有分队".to_owned(),
            note: String::new(),
            character_ids: vec![Some(1001), None, None, None],
        })
        .unwrap();
    let score = team.members[0].as_ref().unwrap().score.as_ref().unwrap();
    assert_eq!(score.letter_grade, "A-");
    assert!((score.potential_pct - 71.0).abs() < f64::EPSILON);

    store.delete_build_plan(1001).unwrap();
    // delete_build_plan clears score even if no plan existed.
    assert!(store
        .list_character_build_scores(&[1001])
        .unwrap()
        .is_empty());
}

#[test]
fn clear_and_delete_items_invalidate_character_build_scores() {
    let store = InventoryStore::test_store();
    seed_characters(&store, &[(1001, "三月七", "Preservation")]);
    store
        .upsert_character_build_score(&CharacterBuildScore {
            character_id: 1001,
            letter_grade: "B".to_owned(),
            potential_pct: 50.0,
            completion_pct: 40.0,
            relic_count: 2,
            has_plan: false,
            computed_at: 1,
        })
        .unwrap();
    assert_eq!(store.list_character_build_scores(&[1001]).unwrap().len(), 1);

    store.clear(Some(InventoryKind::Relic)).unwrap();
    assert!(store
        .list_character_build_scores(&[1001])
        .unwrap()
        .is_empty());

    store
        .upsert_character_build_score(&CharacterBuildScore {
            character_id: 1001,
            letter_grade: "B".to_owned(),
            potential_pct: 50.0,
            completion_pct: 40.0,
            relic_count: 2,
            has_plan: false,
            computed_at: 2,
        })
        .unwrap();
    store
        .delete_items(&DeleteItemsRequest {
            kind: InventoryKind::Character,
            ids: vec![1001],
        })
        .unwrap();
    assert!(store
        .list_character_build_scores(&[1001])
        .unwrap()
        .is_empty());
}

#[test]
fn team_shows_orphan_member_when_character_removed() {
    let store = InventoryStore::test_store();
    seed_characters(
        &store,
        &[(1001, "三月七", "Preservation"), (1002, "丹恒", "Hunt")],
    );
    let team = store
        .save_team(&TeamInput {
            team_id: None,
            name: "孤儿测试".to_owned(),
            note: String::new(),
            character_ids: vec![Some(1001), Some(1002), None, None],
        })
        .unwrap();

    store.clear(Some(InventoryKind::Character)).unwrap();
    let orphaned = store.get_team(team.team_id).unwrap();
    assert!(!orphaned.members[0].as_ref().unwrap().owned);
    assert!(orphaned.members[0].as_ref().unwrap().name.contains("1001"));
    // clear(kind) keeps teams, matching build-plan retention on partial clear.
    assert_eq!(store.summary().unwrap().teams, 1);
}

#[test]
fn build_plan_tracks_updated_at_and_game_version_and_preserves_on_sync() {
    let store = InventoryStore::test_store();
    seed_characters(
        &store,
        &[
            (1001, "三月七", "Preservation"),
            (1002, "丹恒", "Hunt"),
            (1003, "瓦尔特", "Nihility"),
        ],
    );
    let plan = CharacterBuildPlan {
        character_id: 1001,
        cavern_mode: "fourPiece".to_owned(),
        cavern_set_a: 101,
        cavern_set_b: None,
        planar_set_id: 301,
        main_stats: HashMap::from([("Body".to_owned(), vec!["DEF%".to_owned()])]),
        targets: vec![BuildTarget {
            stat_key: "DEF".to_owned(),
            target: 3200.0,
            priority: 1,
            minimum: 2800.0,
        }],
        effective_substats: vec!["DEF%".to_owned(), "SPD".to_owned()],
        note: String::new(),
        substat_weights: HashMap::new(),
        min_potential_pct: 40.0,
        spd_target: 0.0,
        game_version: String::new(),
        updated_at: 0,
    };
    store.save_build_plan(&plan).unwrap();

    let saved = store.build_plan(1001).unwrap().expect("saved plan");
    assert_eq!(saved.game_version, current_game_version());
    assert!(saved.updated_at > 0);

    // Simulate a legacy plan row saved before game_version existed (blank version, historical timestamp).
    let legacy_timestamp: i64 = 1_735_689_600_000;
    let conn = store.connect().unwrap();
    conn.execute(
            "INSERT INTO character_build_plans(
                character_id, cavern_mode, cavern_set_a, cavern_set_b, planar_set_id,
                main_stats_json, effective_substats_json, note, updated_at, display_order, pinned,
                substat_weights_json, min_potential_pct, spd_target, game_version
             ) VALUES(1002, 'fourPiece', 101, NULL, 301, '{}', '[]', '', ?1, 1, 0, '{}', 40, 0, '')",
            [legacy_timestamp],
        )
        .unwrap();
    conn.execute(
            "INSERT INTO character_build_targets(character_id, stat_key, target, priority, max_gap, minimum)
             VALUES(1002, 'ATK', 2800, 1, 400, 2400)",
            [],
        )
        .unwrap();
    drop(conn);

    let listed = store
        .list_characters(&CharacterFilter::default())
        .unwrap()
        .items;
    let march = listed.iter().find(|c| c.character_id == 1001).unwrap();
    assert!(march.has_build_plan);
    assert_eq!(
        march.build_plan_game_version.as_deref(),
        Some(current_game_version())
    );
    assert_eq!(march.build_plan_updated_at, Some(saved.updated_at));

    let dan = listed.iter().find(|c| c.character_id == 1002).unwrap();
    assert!(dan.has_build_plan);
    assert_eq!(dan.build_plan_game_version, None);
    assert_eq!(dan.build_plan_updated_at, Some(legacy_timestamp));

    let welt = listed.iter().find(|c| c.character_id == 1003).unwrap();
    assert!(!welt.has_build_plan);
    assert_eq!(welt.build_plan_game_version, None);
    assert_eq!(welt.build_plan_updated_at, None);

    // Sync snapshot restore preserves historical updated_at and blank/older game_version.
    let mut snapshot = store.sync_snapshot().unwrap();
    let snap_march = snapshot
        .build_plans
        .iter_mut()
        .find(|p| p.character_id == 1001)
        .unwrap();
    snap_march.game_version = "4.2".to_owned();
    snap_march.updated_at = 1_750_000_000_000;

    let restored_store = InventoryStore::test_store();
    restored_store.replace_with_sync_snapshot(snapshot).unwrap();
    let restored_march = restored_store.build_plan(1001).unwrap().unwrap();
    assert_eq!(restored_march.game_version, "4.2");
    assert_eq!(restored_march.updated_at, 1_750_000_000_000);
    let restored_dan = restored_store.build_plan(1002).unwrap().unwrap();
    assert_eq!(restored_dan.game_version, "");
    assert_eq!(restored_dan.updated_at, legacy_timestamp);

    // Re-saving an older/legacy plan interactively updates it to current_game_version().
    restored_store.save_build_plan(&restored_march).unwrap();
    let updated_march = restored_store.build_plan(1001).unwrap().unwrap();
    assert_eq!(updated_march.game_version, current_game_version());
    assert!(updated_march.updated_at >= 1_750_000_000_000);
}

#[test]
fn batched_queries_preserve_multi_path_equipment_substats_and_pool_reuse() {
    let store = InventoryStore::test_store();
    seed_characters(
        &store,
        &[(1001, "三月七", "Preservation"), (1224, "三月七", "Hunt")],
    );
    {
        let conn = store.connect().unwrap();
        conn.execute(
                "INSERT INTO relics(
                    item_id, set_id, name, set_name, slot, rarity, level, main_stat, main_stat_value,
                    location, equipped_character_id, locked, discard, source, updated_at
                 ) VALUES
                    (9001, 101, '存护头', '铁卫', 'Head', 5, 15, 'HP', 705.6, '三月七', 1001, 1, 0, 'test', 1),
                    (9002, 102, '巡猎头', '快枪手', 'Head', 5, 15, 'HP', 705.6, '三月七', 1224, 0, 0, 'test', 1)",
                [],
            )
            .unwrap();
        conn.execute(
                "INSERT INTO relic_substats(relic_id, kind, position, stat_key, value, count, step) VALUES
                    (9001, 'normal', 0, 'DEF%', 12.9, 3, 2),
                    (9001, 'normal', 1, 'SPD', 4.6, 2, 1),
                    (9001, 'reroll', 0, 'ATK%', 8.6, 2, 0),
                    (9002, 'normal', 0, 'CRIT Rate', 9.7, 3, 2)",
                [],
            )
            .unwrap();
        conn.execute(
            "INSERT INTO light_cones(
                    item_id, template_id, name, level, ascension, superimposition,
                    location, equipped_character_id, locked, source, updated_at
                 ) VALUES
                    (8001, 21001, '朗道的选择', 80, 6, 5, '三月七', 1001, 1, 'test', 1),
                    (8002, 24001, '星海巡航', 80, 6, 5, '三月七', 1224, 1, 'test', 1)",
            [],
        )
        .unwrap();
    }
    // Pool should retain the returned connection for reuse.
    assert!(!store.pool.lock().unwrap().is_empty());

    for (cid, set_a) in [(1001u32, 101u32), (1224u32, 102u32)] {
        store
            .save_build_plan(&CharacterBuildPlan {
                character_id: cid,
                cavern_mode: "fourPiece".to_owned(),
                cavern_set_a: set_a,
                cavern_set_b: None,
                planar_set_id: 301,
                main_stats: HashMap::new(),
                targets: vec![BuildTarget {
                    stat_key: "SPD".to_owned(),
                    target: 134.0,
                    priority: 1,
                    minimum: 130.0,
                }],
                effective_substats: vec!["SPD".to_owned()],
                note: String::new(),
                substat_weights: HashMap::new(),
                min_potential_pct: 40.0,
                spd_target: 134.0,
                game_version: String::new(),
                updated_at: 0,
            })
            .unwrap();
    }

    let dashboard = store.build_dashboard().unwrap();
    assert_eq!(dashboard.len(), 2);
    let march_pres = dashboard
        .iter()
        .find(|e| e.plan.character_id == 1001)
        .expect("Preservation March");
    let march_hunt = dashboard
        .iter()
        .find(|e| e.plan.character_id == 1224)
        .expect("Hunt March");
    assert_eq!(
        march_pres.character["equippedRelics"][0]["itemId"],
        json!(9001)
    );
    assert_eq!(
        march_pres.character["equippedLightCone"]["templateId"],
        json!(21001)
    );
    assert_eq!(
        march_hunt.character["equippedRelics"][0]["itemId"],
        json!(9002)
    );
    assert_eq!(
        march_hunt.character["equippedLightCone"]["templateId"],
        json!(24001)
    );

    let profiles = store.relic_set_farming_profiles().unwrap();
    assert_eq!(profiles.len(), 2);

    let listed_relics = store.list_relics(&RelicFilter::default()).unwrap();
    assert_eq!(listed_relics.total, 2);
    let r9001 = listed_relics
        .items
        .iter()
        .find(|r| r.item_id == 9001)
        .unwrap();
    assert_eq!(r9001.substats.len(), 2);
    assert_eq!(r9001.substats[0].key, "DEF%");
    assert_eq!(r9001.substats[1].key, "SPD");

    store
        .save_team(&TeamInput {
            team_id: None,
            name: "双三月七测试队".to_owned(),
            note: String::new(),
            character_ids: vec![Some(1001), Some(1224), None, None],
        })
        .unwrap();
    let teams = store.list_teams(&TeamFilter::default()).unwrap();
    assert_eq!(teams.total, 1);
    assert_eq!(
        teams.items[0].members[0].as_ref().unwrap().path,
        "Preservation"
    );
    assert_eq!(teams.items[0].members[1].as_ref().unwrap().path, "Hunt");

    let snapshot = store.sync_snapshot().unwrap();
    let exported_9001 = snapshot
        .inventory
        .relics
        .iter()
        .find(|r| r._uid == 9001)
        .unwrap();
    assert_eq!(exported_9001.substats.len(), 2);
    assert_eq!(
        exported_9001.reroll_substats.as_ref().map(|v| v.len()),
        Some(1)
    );
}

#[test]
fn migration_upgrades_schema_v15_missing_game_version_for_sync_snapshot() {
    let path = std::env::temp_dir().join(format!(
        "starrail-auto-tools-v15-migration-{}-{}.sqlite3",
        std::process::id(),
        now_millis()
    ));
    {
        let connection = rusqlite::Connection::open(&path).unwrap();
        connection
            .execute_batch(
                r#"
                CREATE TABLE schema_meta (version INTEGER NOT NULL);
                INSERT INTO schema_meta(version) VALUES (15);

                CREATE TABLE relics (
                    item_id INTEGER PRIMARY KEY,
                    set_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    set_name TEXT NOT NULL,
                    slot TEXT NOT NULL,
                    rarity INTEGER NOT NULL,
                    level INTEGER NOT NULL,
                    main_stat TEXT NOT NULL,
                    location TEXT NOT NULL,
                    locked INTEGER NOT NULL,
                    discard INTEGER NOT NULL,
                    source TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    last_seen_run INTEGER
                );

                CREATE TABLE light_cones (
                    item_id INTEGER PRIMARY KEY,
                    template_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    level INTEGER NOT NULL,
                    ascension INTEGER NOT NULL,
                    superimposition INTEGER NOT NULL,
                    location TEXT NOT NULL,
                    locked INTEGER NOT NULL,
                    source TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    last_seen_run INTEGER
                );

                CREATE TABLE characters (
                    character_id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    path TEXT NOT NULL,
                    level INTEGER NOT NULL,
                    ascension INTEGER NOT NULL,
                    eidolon INTEGER NOT NULL,
                    rarity INTEGER NOT NULL DEFAULT 5,
                    skills_json TEXT NOT NULL,
                    traces_json TEXT NOT NULL,
                    memosprite_json TEXT,
                    ability_version INTEGER NOT NULL,
                    source TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    last_seen_run INTEGER
                );

                CREATE TABLE character_build_plans (
                    character_id INTEGER PRIMARY KEY,
                    cavern_mode TEXT NOT NULL,
                    cavern_set_a INTEGER NOT NULL,
                    cavern_set_b INTEGER,
                    planar_set_id INTEGER NOT NULL,
                    main_stats_json TEXT NOT NULL,
                    effective_substats_json TEXT NOT NULL DEFAULT '[]',
                    note TEXT NOT NULL DEFAULT '',
                    substat_weights_json TEXT NOT NULL DEFAULT '{}',
                    min_potential_pct REAL NOT NULL DEFAULT 40,
                    spd_target REAL NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL,
                    display_order INTEGER NOT NULL DEFAULT 0,
                    pinned INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE cleanup_queue (
                    item_id INTEGER PRIMARY KEY,
                    fingerprint_json TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    last_run_id INTEGER,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                INSERT INTO characters(
                    character_id, name, path, level, ascension, eidolon, rarity,
                    skills_json, traces_json, memosprite_json, ability_version,
                    source, updated_at, last_seen_run
                ) VALUES (1001, '三月七', 'Preservation', 80, 6, 6, 4, '{}', '{}', NULL, 1, 'test', 1000, NULL);

                INSERT INTO character_build_plans(
                    character_id, cavern_mode, cavern_set_a, cavern_set_b, planar_set_id,
                    main_stats_json, effective_substats_json, note, substat_weights_json,
                    min_potential_pct, spd_target, updated_at, display_order, pinned
                ) VALUES (1001, 'fourPiece', 101, NULL, 301, '{}', '[]', 'legacy', '{}', 40, 0, 1735689600000, 0, 0);
                "#,
            )
            .unwrap();
    }

    let store = InventoryStore::initialize(path.clone()).unwrap();
    let version: i64 = store
        .connect()
        .unwrap()
        .query_row("SELECT version FROM schema_meta LIMIT 1", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(version, SCHEMA_VERSION);

    let plan = store.build_plan(1001).unwrap().expect("migrated plan");
    assert_eq!(plan.game_version, "");
    assert_eq!(plan.note, "legacy");

    let snapshot = store.sync_snapshot().unwrap();
    assert_eq!(snapshot.build_plans.len(), 1);
    assert_eq!(snapshot.build_plans[0].game_version, "");

    let listed = store.list_characters(&CharacterFilter::default()).unwrap();
    assert_eq!(listed.items.len(), 1);
    assert!(listed.items[0].has_build_plan);
    assert_eq!(listed.items[0].build_plan_game_version, None);

    let _ = std::fs::remove_file(path);
}

#[test]
fn list_relics_filters_by_set_ids() {
    let store = InventoryStore::test_store();
    {
        let conn = store.connect().unwrap();
        conn.execute(
            "INSERT INTO relics(
                item_id, set_id, name, set_name, slot, rarity, level, main_stat, main_stat_value,
                location, equipped_character_id, locked, discard, source, updated_at
             ) VALUES
                (9101, 133, '伶人手', '戏梦点星的伶人', 'Hands', 5, 15, 'ATK', 352.8, '', NULL, 0, 0, 'test', 1),
                (9102, 133, '伶人头', '戏梦点星的伶人', 'Head', 5, 15, 'HP', 705.6, '', NULL, 0, 0, 'test', 1),
                (9103, 329, '欢愉绳', '神的瞬息欢愉', 'LinkRope', 5, 15, 'HP%', 43.2, '', NULL, 0, 0, 'test', 1)",
            [],
        )
        .unwrap();
    }

    let only_133 = store
        .list_relics(&RelicFilter {
            set_ids: Some(vec![133]),
            ..RelicFilter::default()
        })
        .unwrap();
    assert_eq!(only_133.total, 2);
    assert!(only_133.items.iter().all(|item| item.set_id == 133));

    let only_329 = store
        .list_relics(&RelicFilter {
            set_ids: Some(vec![329]),
            ..RelicFilter::default()
        })
        .unwrap();
    assert_eq!(only_329.total, 1);
    assert_eq!(only_329.items[0].item_id, 9103);
}
