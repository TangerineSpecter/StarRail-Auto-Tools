use std::{
    collections::{HashMap, HashSet},
    path::Path,
    sync::OnceLock,
};

use calamine::{open_workbook_auto, Data, Reader};
use rust_xlsxwriter::{DataValidation, Format, FormatAlign, Note, Workbook, Worksheet};
use serde::Deserialize;

use super::models::{
    fixed_main_stat_for_slot, normalize_build_plan_note, normalize_build_target_stat_key,
    BuildTarget, CharacterBuildPlan,
};
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
const TARGET_STATS: [&str; 9] = [
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
    pub character_rarity: u32,
    pub character_path: String,
    pub character_element: String,
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
#[derive(Deserialize)]
struct CharacterCatalogue {
    characters: Vec<CatalogueCharacter>,
}
#[derive(Deserialize)]
struct CatalogueCharacter {
    name: String,
    element: String,
    path: String,
}

fn headers() -> Vec<&'static str> {
    vec![
        "角色",
        "星级",
        "属性",
        "命途",
        "遗器模式",
        "遗器套装 A",
        "遗器套装 B",
        "位面饰品",
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
        "副词条权重 1",
        "副词条权重 2",
        "副词条权重 3",
        "副词条权重 4",
        "副词条权重 5",
        "说明",
        // Columns 35+ are machine-oriented extensions (older files omit them safely).
        "角色 ID",
        "质量门槛",
        "速度断点",
    ]
}
fn header_tip(header: &str) -> &'static str {
    match header {
        "角色" => "必须从下拉列表选择。开拓者、三月七按命途区分，例如“开拓者·同谐”；不要手工改名。",
        "遗器模式" => "必须从下拉选择：4 件套或 2+2 件套。",
        "遗器套装 A" | "遗器套装 B" => {
            "从下拉选择四件遗器区套装。2+2 模式必须填写 A、B 两列，且两套不能相同；4 件套时 B 留空。"
        }
        "位面饰品" => "必须从下拉选择位面饰品套装。",
        "躯干主词条 1"
        | "躯干主词条 2"
        | "脚部主词条 1"
        | "脚部主词条 2"
        | "位面球主词条 1"
        | "位面球主词条 2"
        | "位面球主词条 3"
        | "位面球主词条 4"
        | "连结绳主词条 1"
        | "连结绳主词条 2" => "仅可从下拉选择该部位合法主词条。可留空；同一部位填多个表示任一项均可。",
        "目标属性 1" | "目标属性 2" | "目标属性 3" => {
            "仅可从下拉选择，行号决定优先级。生命/攻击/防御只使用数值属性，不使用百分比属性；同一属性不可重复。"
        }
        "目标值 1" | "目标值 2" | "目标值 3" => "填写大于等于 0 的毕业目标值；与同编号属性、最低标准必须同时填写。",
        "最低标准 1" | "最低标准 2" | "最低标准 3" => {
            "填写大于等于 0 的最低值，且不能高于同一编号的目标值。"
        }
        "有效副词条 1" | "有效副词条 2" | "有效副词条 3" | "有效副词条 4" | "有效副词条 5" => {
            "仅可从下拉选择。最多 5 个，用于遗器词条质量统计；不要重复填写同一词条。"
        }
        "副词条权重 1" | "副词条权重 2" | "副词条权重 3" | "副词条权重 4" | "副词条权重 5" => {
            "与同编号有效副词条对应。仅允许 0、0.25、0.5、0.75、1；留空表示不单独设置。"
        }
        "说明" => "可选备注，最长 500 个字符。",
        "角色 ID" => "隐藏的系统匹配字段，请勿修改；角色名称与 ID 不一致时以有效 ID 为准。",
        "质量门槛" => "质量达标的最低潜力百分比，范围 0～100；留空时默认为 40。",
        "速度断点" => "可选，填写大于等于 0 的速度目标。",
        "星级" | "属性" | "命途" => "仅用于筛选和查看。修改这些列不会影响导入结果。",
        _ => "填写毕业方案配置。",
    }
}
pub(super) fn character_element(name: &str, path: &str) -> String {
    static CATALOGUE: OnceLock<CharacterCatalogue> = OnceLock::new();
    let catalogue = CATALOGUE.get_or_init(|| {
        serde_json::from_str(include_str!("../../../src/data/characters.json"))
            .expect("bundled character catalogue must be valid")
    });
    catalogue
        .characters
        .iter()
        .find(|character| character.name == name && character.path == path)
        .map(|character| character.element.clone())
        .unwrap_or_default()
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
        if matches!(slot, "Head" | "Hands") {
            continue;
        }
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
    let targets = write_options(
        options,
        option_column,
        &TARGET_STATS
            .iter()
            .map(|value| stat_label(value).to_owned())
            .collect::<Vec<_>>(),
    )?;
    let weights = write_options(
        options,
        option_column,
        &[
            "0".into(),
            "0.25".into(),
            "0.5".into(),
            "0.75".into(),
            "1".into(),
        ],
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
        let note = Note::new(header_tip(header)).set_width(260).set_height(90);
        sheet
            .insert_note(0, column as u16, &note)
            .map_err(io_error)?;
    }
    sheet.set_freeze_panes(1, 1).map_err(io_error)?;
    for (index, row_data) in rows.iter().enumerate() {
        let row = index as u32 + 1;
        sheet
            .write_string(row, 0, &row_data.character_name)
            .map_err(io_error)?;
        sheet
            .write_number(row, 1, row_data.character_rarity)
            .map_err(io_error)?;
        if !row_data.character_element.is_empty() {
            sheet
                .write_string(row, 2, &row_data.character_element)
                .map_err(io_error)?;
        }
        sheet
            .write_string(row, 3, &row_data.character_path)
            .map_err(io_error)?;
        let Some(plan) = &row_data.plan else {
            continue;
        };
        sheet
            .write_string(
                row,
                4,
                if plan.cavern_mode == "twoPlusTwo" {
                    "2+2 件套"
                } else {
                    "4 件套"
                },
            )
            .map_err(io_error)?;
        for (column, id) in [
            (5, Some(plan.cavern_set_a)),
            (6, plan.cavern_set_b),
            (7, Some(plan.planar_set_id)),
        ] {
            if let Some(name) = id.and_then(|id| names.get(&id)) {
                sheet.write_string(row, column, *name).map_err(io_error)?;
            }
        }
        for (slot, column, count) in [
            ("Body", 8, 2),
            ("Feet", 10, 2),
            ("PlanarSphere", 12, 4),
            ("LinkRope", 16, 2),
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
            let column = 18 + target_index as u16 * 3;
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
        for (stat_index, stat) in plan.effective_substats.iter().take(5).enumerate() {
            sheet
                .write_string(row, 27 + stat_index as u16, stat_label(stat))
                .map_err(io_error)?;
            if let Some(weight) = plan.substat_weights.get(stat) {
                sheet
                    .write_number(row, 32 + stat_index as u16, *weight)
                    .map_err(io_error)?;
            }
        }
        if !plan.note.is_empty() {
            sheet.write_string(row, 37, &plan.note).map_err(io_error)?;
        }
        // 38 = character id (also written below for rows without plans)
        sheet
            .write_number(row, 39, plan.min_potential_pct)
            .map_err(io_error)?;
        if plan.spd_target > 0.0 {
            sheet
                .write_number(row, 40, plan.spd_target)
                .map_err(io_error)?;
        }
    }
    validation(sheet, 0, 0, &characters)?;
    validation(sheet, 4, 4, &modes)?;
    validation(sheet, 5, 6, &cavern_options)?;
    validation(sheet, 7, 7, &planar_options)?;
    for (slot, first, last) in [
        ("Body", 8, 9),
        ("Feet", 10, 11),
        ("PlanarSphere", 12, 15),
        ("LinkRope", 16, 17),
    ] {
        validation(sheet, first, last, main_options[slot].as_str())?;
    }
    validation(sheet, 18, 18, &targets)?;
    validation(sheet, 21, 21, &targets)?;
    validation(sheet, 24, 24, &targets)?;
    validation(sheet, 27, 31, &substats)?;
    validation(sheet, 32, 36, &weights)?;
    // Hide the machine-only character id.
    sheet.set_column_hidden(38).map_err(io_error)?;
    sheet.set_column_width(37, 28.0).map_err(io_error)?;
    sheet.set_column_width(39, 12.0).map_err(io_error)?;
    sheet.set_column_width(40, 12.0).map_err(io_error)?;
    for (index, row_data) in rows.iter().enumerate() {
        sheet
            .write_number(index as u32 + 1, 38, row_data.character_id)
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
    display_character_ids: &HashMap<String, u32>,
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
    let legacy_layout = range
        .rows()
        .next()
        .is_some_and(|header| text(header.get(5)) == "头部主词条");
    let has_filter_columns = range
        .rows()
        .next()
        .is_some_and(|header| text(header.get(1)) == "星级");
    let has_visible_weights = range.rows().next().is_some_and(|header| {
        text(header.get(if has_filter_columns { 32 } else { 29 })) == "副词条权重 1"
    });
    let (body_column, feet_column, sphere_column, rope_column, target_column, substat_column) =
        if legacy_layout {
            (7, 9, 11, 15, 17, 26)
        } else if has_filter_columns {
            (8, 10, 12, 16, 18, 27)
        } else {
            (5, 7, 9, 13, 15, 24)
        };
    let (
        note_column,
        character_id_column,
        legacy_weights_column,
        min_potential_column,
        spd_column,
        visible_weights_column,
    ) = if legacy_layout {
        (32, 33, Some(34), 35, 36, None)
    } else if has_filter_columns && has_visible_weights {
        (37, 38, None, 39, 40, Some(32))
    } else if has_visible_weights {
        (34, 35, None, 36, 37, Some(29))
    } else {
        (29, 30, Some(31), 32, 33, None)
    };
    let mut plans = Vec::new();
    for row in range.rows().skip(1) {
        let character_name = text(row.first());
        if character_name.is_empty() {
            continue;
        }
        // Prefer the hidden character-id column. Legacy exports stored it in column 32.
        let character_id = number(row.get(character_id_column))
            .or_else(|| legacy_layout.then(|| number(row.get(32))).flatten())
            .filter(|id| *id >= 0.0 && id.fract() == 0.0)
            .map(|id| id as u32)
            .filter(|id| character_ids.contains(id))
            .or_else(|| display_character_ids.get(&character_name).copied())
            .or_else(|| legacy_character_ids.get(&character_name).copied());
        let Some(character_id) = character_id else {
            continue;
        };
        let input_offset = if has_filter_columns { 3 } else { 0 };
        let mode = text(row.get(1 + input_offset));
        let set_a = text(row.get(2 + input_offset));
        let set_b = text(row.get(3 + input_offset));
        let planar = text(row.get(4 + input_offset));
        if row
            .iter()
            .skip(1 + input_offset)
            .all(|cell| text(Some(cell)).is_empty())
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
            ("Body", body_column, 2),
            ("Feet", feet_column, 2),
            ("PlanarSphere", sphere_column, 4),
            ("LinkRope", rope_column, 2),
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
            // Head/Hands are game-fixed; empty cells normalize to the only legal main.
            if values.is_empty() {
                if let Some(fixed) = fixed_main_stat_for_slot(slot) {
                    values.push(fixed.to_owned());
                }
            }
            main_stats.insert(slot.to_owned(), values);
        }
        for slot in ["Head", "Hands"] {
            if let Some(fixed) = fixed_main_stat_for_slot(slot) {
                main_stats.insert(slot.to_owned(), vec![fixed.to_owned()]);
            }
        }
        let mut targets = Vec::new();
        let mut malformed = false;
        for index in 0..3 {
            let column = target_column + index * 3;
            let raw_stat = text(row.get(column));
            let stat = stat_key(&raw_stat);
            let target = number(row.get(column + 1));
            let minimum = number(row.get(column + 2));
            if raw_stat.is_empty() && target.is_none() && minimum.is_none() {
                continue;
            }
            match (
                stat.map(|value| normalize_build_target_stat_key(&value).to_owned())
                    .filter(|value| TARGET_STATS.contains(&value.as_str())),
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
        let effective_substats = (substat_column..substat_column + 5)
            .filter_map(|column| {
                let stat = stat_key(&text(row.get(column)));
                stat.filter(|value| SUBSTATS.contains(&value.as_str()))
            })
            .collect::<Vec<_>>();
        if effective_substats.iter().collect::<HashSet<_>>().len() != effective_substats.len() {
            continue;
        }
        // New exports store notes in a dedicated column. Older files used that slot for character id,
        // so only treat the cell as a note when it is not a pure integer id.
        let note_raw = text(row.get(note_column));
        let note = if note_raw.is_empty()
            || (legacy_layout
                && note_raw.parse::<u32>().is_ok()
                && number(row.get(character_id_column)).is_none())
        {
            String::new()
        } else {
            normalize_build_plan_note(&note_raw)
        };
        // Older exports stored weights in a hidden JSON extension. New exports store at most
        // five visible weights, each paired with its effective-substat column.
        let mut substat_weights = legacy_weights_column
            .map(|column| parse_substat_weights(&text(row.get(column))))
            .unwrap_or_default();
        if let Some(first_weight_column) = visible_weights_column {
            for index in 0..5 {
                let raw_stat = text(row.get(substat_column + index));
                let raw_weight = text(row.get(first_weight_column + index));
                if raw_weight.is_empty() {
                    continue;
                }
                let Some(stat) =
                    stat_key(&raw_stat).filter(|value| SUBSTATS.contains(&value.as_str()))
                else {
                    malformed = true;
                    continue;
                };
                if let Some(weight) = number(row.get(first_weight_column + index)).filter(|value| {
                    value.is_finite()
                        && (0.0..=1.0).contains(value)
                        && ((value * 4.0).round() - value * 4.0).abs() < f64::EPSILON
                }) {
                    substat_weights.insert(stat, weight);
                } else {
                    malformed = true;
                }
            }
        }
        if malformed {
            continue;
        }
        let min_potential_pct = number(row.get(min_potential_column))
            .filter(|value| value.is_finite() && *value >= 0.0)
            .map(|value| value.min(100.0))
            .unwrap_or(40.0);
        let spd_target = number(row.get(spd_column))
            .filter(|value| value.is_finite() && *value >= 0.0)
            .unwrap_or(0.0);
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
            substat_weights,
            min_potential_pct,
            spd_target,
        });
    }
    Ok(plans)
}

fn parse_substat_weights(raw: &str) -> HashMap<String, f64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return HashMap::new();
    }
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) else {
        return HashMap::new();
    };
    let Some(object) = parsed.as_object() else {
        return HashMap::new();
    };
    let mut weights = HashMap::new();
    for (key, value) in object {
        let Some(number) = value.as_f64() else {
            continue;
        };
        if !number.is_finite() || !(0.0..=1.0).contains(&number) {
            continue;
        }
        // Accept English keys; ignore unknown keys so partial maps still import.
        if SUBSTATS.contains(&key.as_str()) {
            weights.insert(key.clone(), number);
        }
    }
    weights
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
                stat_key: "HP%".into(),
                target: 134.0,
                minimum: 120.0,
                priority: 1,
            }],
            effective_substats: vec!["SPD".into(), "CRIT Rate".into()],
            note: "  优先速度，暴伤次之  ".into(),
            substat_weights: HashMap::from([
                ("SPD".into(), 1.0),
                ("CRIT Rate".into(), 1.0),
                ("CRIT DMG".into(), 1.0),
                ("ATK%".into(), 0.75),
            ]),
            min_potential_pct: 45.0,
            spd_target: 160.0,
        };
        export(
            &path,
            &[
                ExportRow {
                    character_id: 1001,
                    character_name: "测试角色".into(),
                    character_rarity: 5,
                    character_path: "巡猎".into(),
                    character_element: "风".into(),
                    plan: Some(plan.clone()),
                },
                ExportRow {
                    character_id: 1002,
                    character_name: "测试角色".into(),
                    character_rarity: 5,
                    character_path: "巡猎".into(),
                    character_element: "风".into(),
                    plan: Some(CharacterBuildPlan {
                        character_id: 1002,
                        note: "副C说明".into(),
                        ..plan.clone()
                    }),
                },
                ExportRow {
                    character_id: 1003,
                    character_name: "重复目标角色".into(),
                    character_rarity: 5,
                    character_path: "巡猎".into(),
                    character_element: "风".into(),
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
                    character_rarity: 5,
                    character_path: "巡猎".into(),
                    character_element: "风".into(),
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
            &HashMap::new(),
        )
        .unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!(imported.len(), 2);
        assert_eq!(imported[0].targets[0].stat_key, "HP");
        assert_eq!(imported[0].cavern_set_a, 101);
        assert_eq!(imported[0].note, "优先速度，暴伤次之");
        assert_eq!(imported[0].substat_weights.get("SPD"), Some(&1.0));
        assert_eq!(imported[0].substat_weights.get("CRIT Rate"), Some(&1.0));
        assert!(!imported[0].substat_weights.contains_key("ATK%"));
        assert_eq!(imported[0].min_potential_pct, 45.0);
        assert_eq!(imported[0].spd_target, 160.0);
        assert_eq!(imported[1].character_id, 1002);
        assert_eq!(imported[1].note, "副C说明");
        assert_eq!(imported[1].spd_target, 160.0);
    }

    #[test]
    fn parse_substat_weights_ignores_invalid_entries() {
        let weights = parse_substat_weights(r#"{"SPD":1,"ATK%":0.75,"nope":1,"CRIT Rate":2}"#);
        assert_eq!(weights.get("SPD"), Some(&1.0));
        assert_eq!(weights.get("ATK%"), Some(&0.75));
        assert!(!weights.contains_key("nope"));
        assert!(!weights.contains_key("CRIT Rate")); // out of 0..=1
    }

    #[test]
    fn parses_percent_values_as_percentage_points() {
        assert_eq!(number(Some(&Data::String("70%".into()))), Some(70.0));
        assert_eq!(number(Some(&Data::String("160％".into()))), Some(160.0));
    }

    #[test]
    fn imports_visible_weights_by_their_matching_substat_column() {
        let path = std::env::temp_dir().join(format!(
            "build-plan-sparse-visible-weights-{}.xlsx",
            std::process::id()
        ));
        let catalogue = catalogue().unwrap();
        let cavern = catalogue
            .sets
            .iter()
            .find(|set| set.kind == "cavern")
            .unwrap();
        let planar = catalogue
            .sets
            .iter()
            .find(|set| set.kind == "planar")
            .unwrap();
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name(SHEET_NAME).unwrap();
        for (column, header) in headers().iter().enumerate() {
            sheet.write_string(0, column as u16, *header).unwrap();
        }
        sheet.write_string(1, 0, "测试角色").unwrap();
        sheet.write_number(1, 38, 1001).unwrap();
        sheet.write_string(1, 4, "4 件套").unwrap();
        sheet.write_string(1, 5, &cavern.name).unwrap();
        sheet.write_string(1, 7, &planar.name).unwrap();
        sheet.write_string(1, 18, "速度").unwrap();
        sheet.write_number(1, 19, 134.0).unwrap();
        sheet.write_number(1, 20, 120.0).unwrap();
        sheet.write_string(1, 27, "速度").unwrap();
        sheet.write_number(1, 32, 1.0).unwrap();
        sheet.write_string(1, 29, "暴击率").unwrap();
        sheet.write_number(1, 34, 0.5).unwrap();
        workbook.save(&path).unwrap();

        let imported = import(
            &path,
            &HashSet::from([1001]),
            &HashMap::new(),
            &HashMap::from([("测试角色".into(), 1001)]),
        )
        .unwrap();
        std::fs::remove_file(path).unwrap();

        assert_eq!(imported.len(), 1);
        assert_eq!(imported[0].substat_weights.get("SPD"), Some(&1.0));
        assert_eq!(imported[0].substat_weights.get("CRIT Rate"), Some(&0.5));
    }

    #[test]
    fn imports_multi_path_character_by_display_name_without_id_column() {
        let path =
            std::env::temp_dir().join(format!("build-plan-multi-path-{}.xlsx", std::process::id()));
        let catalogue = catalogue().unwrap();
        let cavern = catalogue
            .sets
            .iter()
            .find(|set| set.kind == "cavern")
            .unwrap();
        let planar = catalogue
            .sets
            .iter()
            .find(|set| set.kind == "planar")
            .unwrap();
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name(SHEET_NAME).unwrap();
        sheet.write_string(0, 0, "角色").unwrap();
        // This row intentionally has no hidden character-id column, as in a manually created
        // workbook or an older export without the machine-oriented extension.
        sheet.write_string(1, 0, "开拓者·同谐").unwrap();
        sheet.write_string(1, 1, "4 件套").unwrap();
        sheet.write_string(1, 2, &cavern.name).unwrap();
        sheet.write_string(1, 4, &planar.name).unwrap();
        sheet.write_string(1, 15, "速度").unwrap();
        sheet.write_number(1, 16, 134.0).unwrap();
        sheet.write_number(1, 17, 120.0).unwrap();
        workbook.save(&path).unwrap();

        let imported = import(
            &path,
            &HashSet::from([8001, 8006]),
            &HashMap::from([("开拓者·同谐".into(), 8006)]),
            &HashMap::new(),
        )
        .unwrap();
        std::fs::remove_file(path).unwrap();

        assert_eq!(imported.len(), 1);
        assert_eq!(imported[0].character_id, 8006);
    }

    #[test]
    fn imports_legacy_layout_and_limits_effective_substats_to_five() {
        let path = std::env::temp_dir().join(format!(
            "build-plan-legacy-layout-{}.xlsx",
            std::process::id()
        ));
        let catalogue = catalogue().unwrap();
        let cavern = catalogue
            .sets
            .iter()
            .find(|set| set.kind == "cavern")
            .unwrap();
        let planar = catalogue
            .sets
            .iter()
            .find(|set| set.kind == "planar")
            .unwrap();
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.set_name(SHEET_NAME).unwrap();
        sheet.write_string(0, 0, "角色").unwrap();
        sheet.write_string(0, 5, "头部主词条").unwrap();
        sheet.write_string(1, 0, "测试角色").unwrap();
        sheet.write_string(1, 1, "4 件套").unwrap();
        sheet.write_string(1, 2, &cavern.name).unwrap();
        sheet.write_string(1, 4, &planar.name).unwrap();
        sheet.write_string(1, 17, "速度").unwrap();
        sheet.write_number(1, 18, 134.0).unwrap();
        sheet.write_number(1, 19, 120.0).unwrap();
        for (index, stat) in [
            "速度",
            "暴击率",
            "暴击伤害",
            "攻击力",
            "击破特攻",
            "效果命中",
        ]
        .iter()
        .enumerate()
        {
            sheet.write_string(1, 26 + index as u16, *stat).unwrap();
        }
        workbook.save(&path).unwrap();

        let imported = import(
            &path,
            &HashSet::from([1001]),
            &HashMap::new(),
            &HashMap::from([("测试角色".into(), 1001)]),
        )
        .unwrap();
        std::fs::remove_file(path).unwrap();

        assert_eq!(imported.len(), 1);
        assert_eq!(imported[0].effective_substats.len(), 5);
        assert_eq!(imported[0].main_stats["Head"], vec!["HP".to_owned()]);
        assert_eq!(imported[0].main_stats["Hands"], vec!["ATK".to_owned()]);
    }
}
