use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

use calamine::{open_workbook_auto, Data, Reader};
use rust_xlsxwriter::{DataValidation, Format, FormatAlign, Workbook, Worksheet};
use serde::Deserialize;

use super::models::{normalize_build_plan_note, BuildTarget, CharacterBuildPlan};
use crate::error::AppError;

pub(super) const SHEET_NAME: &str = "角色目标";
const OPTION_SHEET: &str = "选项";
const MAX_ROWS: u32 = 500;
const SUBSTATS: [&str; 12] = [
    "HP",
    "HP%",
    "ATK",
    "ATK%",
    "DEF",
    "DEF%",
    "SPD",
    "CRIT Rate",
    "CRIT DMG",
    "Effect Hit Rate",
    "Effect RES",
    "Break Effect",
];
const STAT_LABELS: [(&str, &str); 21] = [
    ("HP", "生命值"),
    ("HP%", "生命百分比"),
    ("ATK", "攻击力"),
    ("ATK%", "攻击百分比"),
    ("DEF", "防御力"),
    ("DEF%", "防御百分比"),
    ("SPD", "速度"),
    ("CRIT Rate", "暴击率"),
    ("CRIT DMG", "暴击伤害"),
    ("Effect Hit Rate", "效果命中"),
    ("Effect RES", "效果抵抗"),
    ("Break Effect", "击破特攻"),
    ("Outgoing Healing Boost", "治疗量加成"),
    ("Energy Regeneration Rate", "能量恢复效率"),
    ("Physical DMG Boost", "物理属性伤害提高"),
    ("Fire DMG Boost", "火属性伤害提高"),
    ("Ice DMG Boost", "冰属性伤害提高"),
    ("Lightning DMG Boost", "雷属性伤害提高"),
    ("Wind DMG Boost", "风属性伤害提高"),
    ("Quantum DMG Boost", "量子属性伤害提高"),
    ("Imaginary DMG Boost", "虚数属性伤害提高"),
];
const MAIN_STATS: [(&str, &[&str]); 6] = [
    ("Head", &["HP"]),
    ("Hands", &["ATK"]),
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
#[derive(Clone)]
pub(super) struct ExportRow {
    pub character_id: u32,
    pub character_name: String,
    pub plan: Option<CharacterBuildPlan>,
}
#[derive(Deserialize)]
struct RelicCatalogue {
    sets: Vec<RelicSet>,
}
#[derive(Deserialize)]
struct RelicSet {
    id: u32,
    name: String,
    kind: String,
}

fn headers() -> Vec<&'static str> {
    vec![
        "角色",
        "遗器模式",
        "遗器套装 A",
        "遗器套装 B",
        "位面饰品",
        "头部主词条",
        "手部主词条",
        "躯干主词条 1",
        "躯干主词条 2",
        "脚部主词条 1",
        "脚部主词条 2",
        "位面球主词条 1",
        "位面球主词条 2",
        "位面球主词条 3",
        "位面球主词条 4",
        "连结绳主词条 1",
        "连结绳主词条 2",
        "目标属性 1",
        "目标值 1",
        "最低标准 1",
        "目标属性 2",
        "目标值 2",
        "最低标准 2",
        "目标属性 3",
        "目标值 3",
        "最低标准 3",
        "有效副词条 1",
        "有效副词条 2",
        "有效副词条 3",
        "有效副词条 4",
        "有效副词条 5",
        "有效副词条 6",
        "说明",
    ]
}
fn catalogue() -> Result<RelicCatalogue, AppError> {
    serde_json::from_str(include_str!("../../../src/data/relic-sets.json")).map_err(io_error)
}
fn io_error(error: impl std::fmt::Display) -> AppError {
    AppError::Database(error.to_string())
}
fn stat_label(key: &str) -> &str {
    STAT_LABELS
        .iter()
        .find(|(value, _)| *value == key)
        .map_or(key, |(_, label)| *label)
}
fn stat_key(value: &str) -> Option<String> {
    STAT_LABELS
        .iter()
        .find(|(key, label)| *key == value || *label == value)
        .map(|(key, _)| (*key).to_owned())
}
fn column_name(mut column: u16) -> String {
    let mut value = String::new();
    loop {
        value.insert(0, char::from(b'A' + (column % 26) as u8));
        if column < 26 {
            return value;
        }
        column = column / 26 - 1;
    }
}
fn write_options(
    sheet: &mut Worksheet,
    column: u16,
    values: &[String],
) -> Result<String, AppError> {
    sheet.write_string(0, column, "选项").map_err(io_error)?;
    for (index, value) in values.iter().enumerate() {
        sheet
            .write_string(index as u32 + 1, column, value)
            .map_err(io_error)?;
    }
    let letter = column_name(column);
    Ok(format!(
        "='{OPTION_SHEET}'!${letter}$2:${letter}${}",
        values.len() + 1
    ))
}
fn validation(sheet: &mut Worksheet, first: u16, last: u16, formula: &str) -> Result<(), AppError> {
    let rule = DataValidation::new().allow_list_formula(formula.into());
    sheet
        .add_data_validation(1, first, MAX_ROWS, last, &rule)
        .map_err(io_error)?;
    Ok(())
}

pub(super) fn export(path: &Path, rows: &[ExportRow]) -> Result<(), AppError> {
    let catalogue = catalogue()?;
    let character_names = rows
        .iter()
        .map(|row| row.character_name.clone())
        .collect::<Vec<_>>();
    let cavern = catalogue
        .sets
        .iter()
        .filter(|set| set.kind == "cavern")
        .map(|set| set.name.clone())
        .collect::<Vec<_>>();
    let planar = catalogue
        .sets
        .iter()
        .filter(|set| set.kind == "planar")
        .map(|set| set.name.clone())
        .collect::<Vec<_>>();
    let names = catalogue
        .sets
        .iter()
        .map(|set| (set.id, set.name.as_str()))
        .collect::<HashMap<_, _>>();
    let mut workbook = Workbook::new();
    let options = workbook.add_worksheet();
    options.set_name(OPTION_SHEET).map_err(io_error)?;
    let mut option_column = 0;
    let characters = write_options(options, option_column, &character_names)?;
    option_column += 1;
    let modes = write_options(
        options,
        option_column,
        &["4 件套".into(), "2+2 件套".into()],
    )?;
    option_column += 1;
    let cavern_options = write_options(options, option_column, &cavern)?;
    option_column += 1;
    let planar_options = write_options(options, option_column, &planar)?;
    option_column += 1;
    let mut main_options = HashMap::new();
    for (slot, values) in MAIN_STATS {
        main_options.insert(
            slot,
            write_options(
                options,
                option_column,
                &values
                    .iter()
                    .map(|value| stat_label(value).to_owned())
                    .collect::<Vec<_>>(),
            )?,
        );
        option_column += 1;
    }
    let substats = write_options(
        options,
        option_column,
        &SUBSTATS
            .iter()
            .map(|value| stat_label(value).to_owned())
            .collect::<Vec<_>>(),
    )?;
    options.set_hidden(true);
    let sheet = workbook.add_worksheet();
    sheet.set_name(SHEET_NAME).map_err(io_error)?;
    let heading = Format::new()
        .set_bold()
        .set_align(FormatAlign::Center)
        .set_background_color("1F4E78")
        .set_font_color("FFFFFF");
    for (column, header) in headers().iter().enumerate() {
        sheet
            .write_string_with_format(0, column as u16, *header, &heading)
            .map_err(io_error)?;
        sheet
            .set_column_width(column as u16, if column == 0 { 18.0 } else { 16.0 })
            .map_err(io_error)?;
    }
    sheet.set_freeze_panes(1, 1).map_err(io_error)?;
    for (index, row_data) in rows.iter().enumerate() {
        let row = index as u32 + 1;
        sheet
            .write_string(row, 0, &row_data.character_name)
            .map_err(io_error)?;
        let Some(plan) = &row_data.plan else {
            continue;
        };
        sheet
            .write_string(
                row,
                1,
                if plan.cavern_mode == "twoPlusTwo" {
                    "2+2 件套"
                } else {
                    "4 件套"
                },
            )
            .map_err(io_error)?;
        for (column, id) in [
            (2, Some(plan.cavern_set_a)),
            (3, plan.cavern_set_b),
            (4, Some(plan.planar_set_id)),
        ] {
            if let Some(name) = id.and_then(|id| names.get(&id)) {
                sheet.write_string(row, column, *name).map_err(io_error)?;
            }
        }
        for (slot, column, count) in [
            ("Head", 5, 1),
            ("Hands", 6, 1),
            ("Body", 7, 2),
            ("Feet", 9, 2),
            ("PlanarSphere", 11, 4),
            ("LinkRope", 15, 2),
        ] {
            for offset in 0..count {
                if let Some(value) = plan
                    .main_stats
                    .get(slot)
                    .and_then(|values| values.get(offset))
                {
                    sheet
                        .write_string(row, column + offset as u16, stat_label(value))
                        .map_err(io_error)?;
                }
            }
        }
        for (target_index, target) in plan.targets.iter().take(3).enumerate() {
            let column = 17 + target_index as u16 * 3;
            sheet
                .write_string(row, column, stat_label(&target.stat_key))
                .map_err(io_error)?;
            sheet
                .write_number(row, column + 1, target.target)
                .map_err(io_error)?;
            sheet
                .write_number(row, column + 2, target.minimum)
                .map_err(io_error)?;
        }
        for (stat_index, stat) in plan.effective_substats.iter().take(6).enumerate() {
            sheet
                .write_string(row, 26 + stat_index as u16, stat_label(stat))
                .map_err(io_error)?;
        }
        if !plan.note.is_empty() {
            sheet
                .write_string(row, 32, &plan.note)
                .map_err(io_error)?;
        }
    }
    validation(sheet, 0, 0, &characters)?;
    validation(sheet, 1, 1, &modes)?;
    validation(sheet, 2, 3, &cavern_options)?;
    validation(sheet, 4, 4, &planar_options)?;
    for (slot, first, last) in [
        ("Head", 5, 5),
        ("Hands", 6, 6),
        ("Body", 7, 8),
        ("Feet", 9, 10),
        ("PlanarSphere", 11, 14),
        ("LinkRope", 15, 16),
    ] {
        validation(sheet, first, last, main_options[slot].as_str())?;
    }
    validation(sheet, 17, 17, &substats)?;
    validation(sheet, 20, 20, &substats)?;
    validation(sheet, 23, 23, &substats)?;
    validation(sheet, 26, 31, &substats)?;
    // Column 32 is "说明" (from headers). Character ID is hidden at column 33.
    sheet
        .write_string_with_format(0, 33, "角色 ID", &heading)
        .map_err(io_error)?;
    sheet.set_column_hidden(33).map_err(io_error)?;
    sheet
        .set_column_width(32, 28.0)
        .map_err(io_error)?;
    for (index, row_data) in rows.iter().enumerate() {
        sheet
            .write_number(index as u32 + 1, 33, row_data.character_id)
            .map_err(io_error)?;
    }
    workbook.worksheets_mut().swap(0, 1);
    workbook.save(path).map_err(io_error)
}
fn text(cell: Option<&Data>) -> String {
    cell.map(|cell| cell.to_string().trim().to_owned())
        .unwrap_or_default()
}
fn number(cell: Option<&Data>) -> Option<f64> {
    let value = text(cell);
    let value = value
        .strip_suffix('%')
        .or_else(|| value.strip_suffix('％'))
        .unwrap_or(&value)
        .trim();
    value.parse().ok()
}
pub(super) fn import(
    path: &Path,
    character_ids: &HashSet<u32>,
    legacy_character_ids: &HashMap<String, u32>,
) -> Result<Vec<CharacterBuildPlan>, AppError> {
    let mut workbook = open_workbook_auto(path).map_err(io_error)?;
    let range = workbook.worksheet_range(SHEET_NAME).map_err(io_error)?;
    let catalogue = catalogue()?;
    let sets = catalogue
        .sets
        .into_iter()
        .map(|set| (set.name, (set.id, set.kind)))
        .collect::<HashMap<_, _>>();
    let mut plans = Vec::new();
    for row in range.rows().skip(1) {
        let character_name = text(row.first());
        if character_name.is_empty() {
            continue;
        }
        // Prefer the hidden character-id column (33). Older exports stored it in column 32.
        let character_id = number(row.get(33))
            .or_else(|| number(row.get(32)))
            .filter(|id| *id >= 0.0 && id.fract() == 0.0)
            .map(|id| id as u32)
            .filter(|id| character_ids.contains(id))
            .or_else(|| legacy_character_ids.get(&character_name).copied());
        let Some(character_id) = character_id else {
            continue;
        };
        let mode = text(row.get(1));
        let set_a = text(row.get(2));
        let set_b = text(row.get(3));
        let planar = text(row.get(4));
        if row.iter().skip(1).all(|cell| text(Some(cell)).is_empty())
            || mode.is_empty()
            || set_a.is_empty()
            || planar.is_empty()
        {
            continue;
        }
        let Some((cavern_set_a, cavern_kind)) = sets.get(&set_a) else {
            continue;
        };
        if cavern_kind != "cavern" {
            continue;
        }
        let cavern_set_b = if mode == "2+2 件套" {
            let Some((id, kind)) = sets.get(&set_b) else {
                continue;
            };
            if kind != "cavern" || id == cavern_set_a {
                continue;
            }
            Some(*id)
        } else if mode == "4 件套" {
            None
        } else {
            continue;
        };
        let Some((planar_set_id, planar_kind)) = sets.get(&planar) else {
            continue;
        };
        if planar_kind != "planar" {
            continue;
        }
        let mut main_stats = HashMap::new();
        let mut malformed_main_stats = false;
        for (slot, column, count) in [
            ("Head", 5, 1),
            ("Hands", 6, 1),
            ("Body", 7, 2),
            ("Feet", 9, 2),
            ("PlanarSphere", 11, 4),
            ("LinkRope", 15, 2),
        ] {
            let allowed = MAIN_STATS
                .iter()
                .find(|(name, _)| *name == slot)
                .map_or(&[][..], |(_, allowed)| *allowed);
            let mut values = Vec::new();
            for offset in 0..count {
                let value = text(row.get(column + offset));
                if value.is_empty() {
                    continue;
                }
                match stat_key(&value) {
                    Some(stat) if allowed.contains(&stat.as_str()) => values.push(stat),
                    _ => malformed_main_stats = true,
                }
            }
            main_stats.insert(slot.to_owned(), values);
        }
        let mut targets = Vec::new();
        let mut malformed = false;
        for index in 0..3 {
            let column = 17 + index * 3;
            let raw_stat = text(row.get(column));
            let stat = stat_key(&raw_stat);
            let target = number(row.get(column + 1));
            let minimum = number(row.get(column + 2));
            if raw_stat.is_empty() && target.is_none() && minimum.is_none() {
                continue;
            }
            match (
                stat.filter(|value| SUBSTATS.contains(&value.as_str())),
                target,
                minimum,
            ) {
                (Some(stat), Some(target), Some(minimum))
                    if minimum >= 0.0 && target >= 0.0 && minimum <= target =>
                {
                    if targets
                        .iter()
                        .any(|target: &BuildTarget| target.stat_key == stat)
                    {
                        malformed = true;
                        continue;
                    }
                    targets.push(BuildTarget {
                        stat_key: stat,
                        target,
                        minimum,
                        priority: targets.len() as u32 + 1,
                    })
                }
                _ => malformed = true,
            }
        }
        if malformed_main_stats || malformed || targets.is_empty() {
            continue;
        }
        let effective_substats = (26..32)
            .filter_map(|column| {
                let stat = stat_key(&text(row.get(column)));
                stat.filter(|value| SUBSTATS.contains(&value.as_str()))
            })
            .collect();
        // New exports store notes in column 32. Older files used that slot for character id,
        // so only treat the cell as a note when it is not a pure integer id.
        let note_raw = text(row.get(32));
        let note = if note_raw.is_empty()
            || (note_raw.parse::<u32>().is_ok() && number(row.get(33)).is_none())
        {
            String::new()
        } else {
            normalize_build_plan_note(&note_raw)
        };
        plans.push(CharacterBuildPlan {
            character_id,
            cavern_mode: if cavern_set_b.is_some() {
                "twoPlusTwo".into()
            } else {
                "fourPiece".into()
            },
            cavern_set_a: *cavern_set_a,
            cavern_set_b,
            planar_set_id: *planar_set_id,
            main_stats,
            targets,
            effective_substats,
            note,
        });
    }
    Ok(plans)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_then_import_preserves_a_complete_plan() {
        let path = std::env::temp_dir().join(format!("build-plan-{}.xlsx", std::process::id()));
        let plan = CharacterBuildPlan {
            character_id: 1001,
            cavern_mode: "fourPiece".into(),
            cavern_set_a: 101,
            cavern_set_b: None,
            planar_set_id: 301,
            main_stats: HashMap::from([("Body".into(), vec!["CRIT Rate".into()])]),
            targets: vec![BuildTarget {
                stat_key: "SPD".into(),
                target: 134.0,
                minimum: 120.0,
                priority: 1,
            }],
            effective_substats: vec!["SPD".into(), "CRIT Rate".into()],
            note: "  优先速度，暴伤次之  ".into(),
        };
        export(
            &path,
            &[
                ExportRow {
                    character_id: 1001,
                    character_name: "测试角色".into(),
                    plan: Some(plan.clone()),
                },
                ExportRow {
                    character_id: 1002,
                    character_name: "测试角色".into(),
                    plan: Some(CharacterBuildPlan {
                        character_id: 1002,
                        note: "副C说明".into(),
                        ..plan.clone()
                    }),
                },
                ExportRow {
                    character_id: 1003,
                    character_name: "重复目标角色".into(),
                    plan: Some(CharacterBuildPlan {
                        character_id: 1003,
                        targets: vec![
                            BuildTarget {
                                stat_key: "SPD".into(),
                                target: 134.0,
                                minimum: 120.0,
                                priority: 1,
                            },
                            BuildTarget {
                                stat_key: "SPD".into(),
                                target: 140.0,
                                minimum: 130.0,
                                priority: 2,
                            },
                        ],
                        ..plan.clone()
                    }),
                },
                ExportRow {
                    character_id: 1004,
                    character_name: "错误主词条角色".into(),
                    plan: Some(CharacterBuildPlan {
                        character_id: 1004,
                        main_stats: HashMap::from([("Body".into(), vec!["错误属性".into()])]),
                        ..plan
                    }),
                },
            ],
        )
        .unwrap();
        let imported = import(
            &path,
            &HashSet::from([1001, 1002, 1003, 1004]),
            &HashMap::new(),
        )
        .unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!(imported.len(), 2);
        assert_eq!(imported[0].targets[0].stat_key, "SPD");
        assert_eq!(imported[0].cavern_set_a, 101);
        assert_eq!(imported[0].note, "优先速度，暴伤次之");
        assert_eq!(imported[1].character_id, 1002);
        assert_eq!(imported[1].note, "副C说明");
    }

    #[test]
    fn parses_percent_values_as_percentage_points() {
        assert_eq!(number(Some(&Data::String("70%".into()))), Some(70.0));
        assert_eq!(number(Some(&Data::String("160％".into()))), Some(160.0));
    }
}
