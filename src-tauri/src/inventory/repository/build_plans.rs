use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

use rusqlite::{
    params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension, Transaction,
};

use super::super::build_plan_excel::{self, ExportRow};
use super::super::models::*;
use super::queries::load_character_details_batch;
use super::{inventory_path_label, now_millis, touch_sync_local_updated_at};
use crate::error::AppError;

impl InventoryStore {
    pub fn build_plan(&self, character_id: u32) -> Result<Option<CharacterBuildPlan>, AppError> {
        let connection = self.connect()?;
        Self::build_plan_from_connection(&connection, character_id)
    }

    pub(super) fn build_plan_from_connection(
        connection: &Connection,
        character_id: u32,
    ) -> Result<Option<CharacterBuildPlan>, AppError> {
        let row = connection.query_row(
            "SELECT cavern_mode, cavern_set_a, cavern_set_b, planar_set_id, main_stats_json, effective_substats_json, note,
                    COALESCE(substat_weights_json, '{}'), COALESCE(min_potential_pct, 40), COALESCE(spd_target, 0),
                    COALESCE(game_version, ''), updated_at
             FROM character_build_plans WHERE character_id = ?1",
            [character_id], |row| Ok((
                row.get::<_, String>(0)?,
                row.get::<_, u32>(1)?,
                row.get::<_, Option<u32>>(2)?,
                row.get::<_, u32>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, f64>(8)?,
                row.get::<_, f64>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, i64>(11)?,
            ))
        ).optional()?;
        let Some((
            cavern_mode,
            cavern_set_a,
            cavern_set_b,
            planar_set_id,
            main_stats_json,
            effective_substats_json,
            note,
            substat_weights_json,
            min_potential_pct,
            spd_target,
            game_version,
            updated_at,
        )) = row
        else {
            return Ok(None);
        };
        let mut statement = connection.prepare("SELECT stat_key, target, priority, minimum FROM character_build_targets WHERE character_id = ?1 ORDER BY priority, stat_key")?;
        let targets = statement
            .query_map([character_id], |row| {
                Ok(BuildTarget {
                    stat_key: row.get(0)?,
                    target: row.get(1)?,
                    priority: row.get(2)?,
                    minimum: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Some(CharacterBuildPlan {
            character_id,
            cavern_mode,
            cavern_set_a,
            cavern_set_b,
            planar_set_id,
            main_stats: serde_json::from_str(&main_stats_json).unwrap_or_default(),
            targets,
            effective_substats: serde_json::from_str(&effective_substats_json).unwrap_or_default(),
            note,
            substat_weights: serde_json::from_str(&substat_weights_json).unwrap_or_default(),
            min_potential_pct,
            spd_target,
            game_version,
            updated_at,
        }))
    }

    pub fn build_dashboard(&self) -> Result<Vec<BuildDashboardEntry>, AppError> {
        let connection = self.connect()?;
        let ordered = connection
            .prepare(
                "SELECT character_id, display_order, pinned
                 FROM character_build_plans
                 ORDER BY pinned DESC, display_order, updated_at DESC, character_id",
            )?
            .query_map([], |row| {
                Ok((
                    row.get::<_, u32>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, bool>(2)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        if ordered.is_empty() {
            return Ok(Vec::new());
        }
        let mut plans = load_all_build_plans(&connection)?;
        let eligible_ids: Vec<u32> = ordered
            .iter()
            .filter_map(|(character_id, _, _)| {
                plans
                    .get(character_id)
                    .filter(|plan| !plan.targets.is_empty())
                    .map(|_| *character_id)
            })
            .collect();
        let mut details = load_character_details_batch(&connection, &eligible_ids)?;
        let mut entries = Vec::with_capacity(eligible_ids.len());
        for (character_id, display_order, pinned) in ordered {
            let Some(plan) = plans.remove(&character_id) else {
                continue;
            };
            // A weight-only record is used by Stat Score before the user configures a graduation
            // target. It must not appear as an incomplete graduation card.
            if plan.targets.is_empty() {
                continue;
            }
            let Some(character) = details.remove(&character_id) else {
                continue;
            };
            entries.push(BuildDashboardEntry {
                plan,
                character,
                display_order,
                pinned,
            });
        }
        Ok(entries)
    }

    /// Return every saved plan whose character still exists, including weight-only plans.
    /// Farming scores need the plan even before a user configures graduation targets.
    pub fn relic_set_farming_profiles(&self) -> Result<Vec<RelicSetFarmingProfile>, AppError> {
        let connection = self.connect()?;
        let character_ids = connection
            .prepare(
                "SELECT character_build_plans.character_id
                 FROM character_build_plans
                 INNER JOIN characters ON characters.character_id = character_build_plans.character_id
                 ORDER BY character_build_plans.updated_at DESC, character_build_plans.character_id ASC",
            )?
            .query_map([], |row| row.get::<_, u32>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        if character_ids.is_empty() {
            return Ok(Vec::new());
        }
        let mut plans = load_all_build_plans(&connection)?;
        let mut details = load_character_details_batch(&connection, &character_ids)?;
        let mut profiles = Vec::with_capacity(character_ids.len());
        for character_id in character_ids {
            let Some(plan) = plans.remove(&character_id) else {
                continue;
            };
            let Some(character) = details.remove(&character_id) else {
                continue;
            };
            profiles.push(RelicSetFarmingProfile { plan, character });
        }
        Ok(profiles)
    }

    pub fn reorder_build_dashboard(&self, character_ids: &[u32]) -> Result<(), AppError> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        let existing = transaction
            .prepare("SELECT character_id FROM character_build_plans ORDER BY character_id")?
            .query_map([], |row| row.get::<_, u32>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        if existing.len() != character_ids.len()
            || character_ids.iter().copied().collect::<HashSet<_>>()
                != existing.into_iter().collect::<HashSet<_>>()
        {
            return Err(AppError::Database(
                "毕业方案列表已变化，请刷新后重新排序".to_owned(),
            ));
        }
        for (display_order, character_id) in character_ids.iter().enumerate() {
            transaction.execute(
                "UPDATE character_build_plans SET display_order = ?1 WHERE character_id = ?2",
                params![display_order as i64, character_id],
            )?;
        }
        touch_sync_local_updated_at(&transaction, now_millis())?;
        transaction.commit()?;
        Ok(())
    }

    pub fn set_build_dashboard_pinned(
        &self,
        character_id: u32,
        pinned: bool,
    ) -> Result<(), AppError> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        let changed = transaction.execute(
            "UPDATE character_build_plans SET pinned = ?1 WHERE character_id = ?2",
            params![pinned, character_id],
        )?;
        if changed == 0 {
            return Err(AppError::Database("毕业方案不存在".to_owned()));
        }
        touch_sync_local_updated_at(&transaction, now_millis())?;
        transaction.commit()?;
        Ok(())
    }

    pub fn export_build_plans_excel(&self, path: &Path) -> Result<(), AppError> {
        let connection = self.connect()?;
        let mut statement = connection.prepare(
            "SELECT character_id, name, path, rarity FROM characters ORDER BY rarity DESC, level DESC, name",
        )?;
        let characters = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, u32>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, u32>(3)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let duplicate_names = characters.iter().fold(
            HashMap::<String, usize>::new(),
            |mut counts, (_, name, _, _)| {
                *counts.entry(name.clone()).or_default() += 1;
                counts
            },
        );
        let mut plans = load_all_build_plans(&connection)?;
        let rows = characters
            .into_iter()
            .map(
                |(character_id, character_name, character_path, character_rarity)| {
                    let catalogue_path = inventory_path_label(&character_path);
                    let character_element =
                        build_plan_excel::character_element(&character_name, catalogue_path);
                    let display_name = if duplicate_names[character_name.as_str()] > 1 {
                        format!("{character_name}·{catalogue_path}")
                    } else {
                        character_name
                    };
                    ExportRow {
                        character_id,
                        character_name: display_name,
                        character_rarity,
                        character_path: catalogue_path.to_owned(),
                        character_element,
                        plan: plans.remove(&character_id),
                    }
                },
            )
            .collect::<Vec<_>>();
        build_plan_excel::export(path, &rows)
    }

    pub fn import_build_plans_excel(&self, path: &Path) -> Result<u64, AppError> {
        let connection = self.connect()?;
        let mut statement = connection.prepare("SELECT character_id, name FROM characters")?;
        let character_ids = statement
            .query_map([], |row| row.get::<_, u32>(0))?
            .collect::<Result<HashSet<_>, _>>()?;
        let mut name_statement =
            connection.prepare("SELECT character_id, name, path FROM characters")?;
        let mut legacy_character_ids = HashMap::new();
        let mut duplicate_names = HashSet::new();
        let mut display_character_ids = HashMap::new();
        for row in name_statement.query_map([], |row| {
            Ok((
                row.get::<_, u32>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })? {
            let (character_id, name, path) = row?;
            if legacy_character_ids
                .insert(name.clone(), character_id)
                .is_some()
            {
                duplicate_names.insert(name.clone());
            }
            display_character_ids.insert(
                format!("{name}·{}", inventory_path_label(&path)),
                character_id,
            );
        }
        legacy_character_ids.retain(|name, _| !duplicate_names.contains(name));
        let plans = build_plan_excel::import(
            path,
            &character_ids,
            &display_character_ids,
            &legacy_character_ids,
        )?;
        if plans.is_empty() {
            return Ok(0);
        }
        let transaction = connection.unchecked_transaction()?;
        for plan in &plans {
            save_build_plan_in_transaction(&transaction, plan, BuildPlanSaveMode::ImportExcel)?;
        }
        touch_sync_local_updated_at(&transaction, now_millis())?;
        transaction.commit()?;
        Ok(plans.len() as u64)
    }

    pub fn recommended_characters_for_relic_set(
        &self,
        set_id: u32,
    ) -> Result<Vec<RelicSetRecommendedCharacter>, AppError> {
        let connection = self.connect()?;
        let mut statement = connection.prepare(
            "SELECT characters.character_id, characters.name,
                    character_build_plans.main_stats_json,
                    character_build_plans.effective_substats_json
             FROM character_build_plans
             INNER JOIN characters ON characters.character_id = character_build_plans.character_id
             WHERE cavern_set_a = ?1 OR cavern_set_b = ?1 OR planar_set_id = ?1
             ORDER BY character_build_plans.updated_at DESC, characters.character_id ASC",
        )?;
        let rows = statement
            .query_map([set_id], |row| {
                Ok((
                    row.get::<_, u32>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()
            .map_err(AppError::from)?;
        let characters = rows
            .into_iter()
            .map(
                |(character_id, name, main_stats_json, effective_substats_json)| {
                    RelicSetRecommendedCharacter {
                        character_id,
                        name,
                        main_stats: serde_json::from_str(&main_stats_json).unwrap_or_default(),
                        effective_substats: serde_json::from_str(&effective_substats_json)
                            .unwrap_or_default(),
                    }
                },
            )
            .collect();
        Ok(characters)
    }

    pub fn relic_set_target_counts(&self) -> Result<Vec<RelicSetTargetCount>, AppError> {
        let connection = self.connect()?;
        let mut statement = connection.prepare(
            "WITH selected_sets AS (
                 SELECT character_id, cavern_set_a AS set_id
                 FROM character_build_plans
                 INNER JOIN characters USING (character_id)
                 WHERE cavern_set_a > 0
                 UNION ALL
                 SELECT character_id, cavern_set_b AS set_id
                 FROM character_build_plans
                 INNER JOIN characters USING (character_id)
                 WHERE cavern_set_b IS NOT NULL AND cavern_set_b > 0
                 UNION ALL
                 SELECT character_id, planar_set_id AS set_id
                 FROM character_build_plans
                 INNER JOIN characters USING (character_id)
                 WHERE planar_set_id > 0
             )
             SELECT set_id, COUNT(DISTINCT character_id) AS target_count
             FROM selected_sets
             GROUP BY set_id
             ORDER BY target_count DESC, set_id ASC",
        )?;
        let counts = statement
            .query_map([], |row| {
                Ok(RelicSetTargetCount {
                    set_id: row.get(0)?,
                    count: row.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(counts)
    }

    pub fn save_build_plan(&self, plan: &CharacterBuildPlan) -> Result<(), AppError> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        save_build_plan_in_transaction(&transaction, plan, BuildPlanSaveMode::StampCurrent)?;
        // Plan weights changed; drop cached score so the next open/team view recomputes.
        transaction.execute(
            "DELETE FROM character_build_scores WHERE character_id = ?1",
            [plan.character_id],
        )?;
        touch_sync_local_updated_at(&transaction, now_millis())?;
        transaction.commit()?;
        Ok(())
    }

    pub fn delete_build_plan(&self, character_id: u32) -> Result<(), AppError> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        let deleted = transaction.execute(
            "DELETE FROM character_build_plans WHERE character_id = ?1",
            [character_id],
        )?;
        transaction.execute(
            "DELETE FROM character_build_scores WHERE character_id = ?1",
            [character_id],
        )?;
        if deleted > 0 {
            touch_sync_local_updated_at(&transaction, now_millis())?;
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn upsert_character_build_score(
        &self,
        score: &CharacterBuildScore,
    ) -> Result<(), AppError> {
        let connection = self.connect()?;
        connection.execute(
            "INSERT INTO character_build_scores(
                character_id, letter_grade, potential_pct, completion_pct,
                relic_count, has_plan, computed_at
             ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(character_id) DO UPDATE SET
                letter_grade = excluded.letter_grade,
                potential_pct = excluded.potential_pct,
                completion_pct = excluded.completion_pct,
                relic_count = excluded.relic_count,
                has_plan = excluded.has_plan,
                computed_at = excluded.computed_at",
            params![
                score.character_id,
                score.letter_grade.trim(),
                score.potential_pct,
                score.completion_pct,
                score.relic_count,
                score.has_plan,
                if score.computed_at > 0 {
                    score.computed_at
                } else {
                    now_millis()
                },
            ],
        )?;
        Ok(())
    }

    pub fn list_character_build_scores(
        &self,
        character_ids: &[u32],
    ) -> Result<Vec<CharacterBuildScore>, AppError> {
        if character_ids.is_empty() {
            return Ok(Vec::new());
        }
        let connection = self.connect()?;
        let placeholders = std::iter::repeat_n("?", character_ids.len())
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT character_id, letter_grade, potential_pct, completion_pct,
                    relic_count, has_plan, computed_at
             FROM character_build_scores
             WHERE character_id IN ({placeholders})"
        );
        let values = character_ids
            .iter()
            .map(|id| SqlValue::Integer(*id as i64))
            .collect::<Vec<_>>();
        let mut statement = connection.prepare(&sql)?;
        let rows = statement.query_map(params_from_iter(values.iter()), |row| {
            Ok(CharacterBuildScore {
                character_id: row.get(0)?,
                letter_grade: row.get(1)?,
                potential_pct: row.get(2)?,
                completion_pct: row.get(3)?,
                relic_count: row.get(4)?,
                has_plan: row.get(5)?,
                computed_at: row.get(6)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    pub fn delete_character_build_score(&self, character_id: u32) -> Result<(), AppError> {
        self.connect()?.execute(
            "DELETE FROM character_build_scores WHERE character_id = ?1",
            [character_id],
        )?;
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum BuildPlanSaveMode {
    /// Interactive user save: stamp current timestamp and current game version.
    StampCurrent,
    /// Excel import: stamp current timestamp; preserve explicit version cell or stamp current.
    ImportExcel,
    /// Sync snapshot restore: preserve exact timestamp and game version from the snapshot.
    PreserveMetadata,
}

pub(super) fn save_build_plan_in_transaction(
    transaction: &Transaction<'_>,
    plan: &CharacterBuildPlan,
    mode: BuildPlanSaveMode,
) -> Result<(), AppError> {
    let weight_only = plan.targets.is_empty()
        && plan.cavern_set_a == 0
        && plan.cavern_set_b.is_none()
        && plan.planar_set_id == 0
        && plan.main_stats.values().all(Vec::is_empty);
    if !matches!(plan.cavern_mode.as_str(), "fourPiece" | "twoPlusTwo")
        || plan.targets.len() > 3
        || (plan.cavern_mode == "twoPlusTwo" && plan.cavern_set_b.is_none())
        || (!weight_only && plan.targets.is_empty())
    {
        return Err(AppError::Database("毕业方案配置无效".to_owned()));
    }
    if plan.cavern_mode == "twoPlusTwo" && plan.cavern_set_b == Some(plan.cavern_set_a) {
        return Err(AppError::Database(
            "2+2 件套不能选择相同的遗器套装".to_owned(),
        ));
    }
    if plan
        .substat_weights
        .values()
        .filter(|weight| **weight > 0.0)
        .count()
        > 5
    {
        return Err(AppError::Database(
            "词条权重最多设置 5 个，请先将一个已设置的权重调为 0".to_owned(),
        ));
    }
    let note = normalize_build_plan_note(&plan.note);
    let mut normalized_targets = Vec::new();
    let mut target_keys = HashSet::new();
    for target in &plan.targets {
        let stat_key = normalize_build_target_stat_key(&target.stat_key).to_owned();
        // A legacy percentage target can become the same flat-stat target as an existing row.
        // Keep the higher-priority row and retain contiguous priorities for the saved plan.
        if !target_keys.insert(stat_key.clone()) {
            continue;
        }
        normalized_targets.push(BuildTarget {
            stat_key,
            target: target.target,
            priority: normalized_targets.len() as u32 + 1,
            minimum: target.minimum,
        });
    }
    let existing_effective_substats = transaction
        .query_row(
            "SELECT effective_substats_json FROM character_build_plans WHERE character_id = ?1",
            [plan.character_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default();
    // Preserve a pre-existing six-item legacy plan unless its effective-substat selection is
    // changed. All new or edited selections are capped at five so they round-trip through Excel.
    let effective_substats = if existing_effective_substats.len() == 6
        && existing_effective_substats == plan.effective_substats
    {
        plan.effective_substats.clone()
    } else {
        plan.effective_substats.iter().take(5).cloned().collect()
    };
    let updated_at = match mode {
        BuildPlanSaveMode::StampCurrent | BuildPlanSaveMode::ImportExcel => now_millis(),
        BuildPlanSaveMode::PreserveMetadata => plan.updated_at.max(0),
    };
    let game_version = match mode {
        BuildPlanSaveMode::StampCurrent => {
            normalize_build_plan_game_version(current_game_version())
        }
        BuildPlanSaveMode::ImportExcel => {
            let explicit = normalize_build_plan_game_version(&plan.game_version);
            if explicit.is_empty() {
                normalize_build_plan_game_version(current_game_version())
            } else {
                explicit
            }
        }
        BuildPlanSaveMode::PreserveMetadata => {
            normalize_build_plan_game_version(&plan.game_version)
        }
    };
    transaction.execute(
        "INSERT INTO character_build_plans(
            character_id, cavern_mode, cavern_set_a, cavern_set_b, planar_set_id,
            main_stats_json, effective_substats_json, note, updated_at, display_order, pinned,
            substat_weights_json, min_potential_pct, spd_target, game_version
         ) VALUES(
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
            COALESCE((SELECT MAX(display_order) + 1 FROM character_build_plans), 0), 0,
            ?10, ?11, ?12, ?13
         )
         ON CONFLICT(character_id) DO UPDATE SET
            cavern_mode = excluded.cavern_mode,
            cavern_set_a = excluded.cavern_set_a,
            cavern_set_b = excluded.cavern_set_b,
            planar_set_id = excluded.planar_set_id,
            main_stats_json = excluded.main_stats_json,
            effective_substats_json = excluded.effective_substats_json,
            note = excluded.note,
            updated_at = excluded.updated_at,
            substat_weights_json = excluded.substat_weights_json,
            min_potential_pct = excluded.min_potential_pct,
            spd_target = excluded.spd_target,
            game_version = excluded.game_version",
        params![
            plan.character_id,
            plan.cavern_mode,
            plan.cavern_set_a,
            plan.cavern_set_b,
            plan.planar_set_id,
            serde_json::to_string(&plan.main_stats)
                .map_err(|error| AppError::Database(error.to_string()))?,
            serde_json::to_string(&effective_substats)
                .map_err(|error| AppError::Database(error.to_string()))?,
            note,
            updated_at,
            serde_json::to_string(&plan.substat_weights)
                .map_err(|error| AppError::Database(error.to_string()))?,
            // Allow 0 as an explicit threshold; only replace non-finite / negative values.
            if plan.min_potential_pct.is_finite() && plan.min_potential_pct >= 0.0 {
                plan.min_potential_pct.min(100.0)
            } else {
                40.0
            },
            if plan.spd_target.is_finite() && plan.spd_target >= 0.0 {
                plan.spd_target
            } else {
                0.0
            },
            game_version
        ],
    )?;
    transaction.execute(
        "DELETE FROM character_build_targets WHERE character_id = ?1",
        [plan.character_id],
    )?;
    for target in &normalized_targets {
        if target.minimum > target.target {
            return Err(AppError::MinExceedsTarget);
        }
        transaction.execute("INSERT INTO character_build_targets(character_id,stat_key,target,priority,max_gap,minimum) VALUES(?1,?2,?3,?4,?5,?6)", params![plan.character_id, target.stat_key, target.target, target.priority, target.target - target.minimum, target.minimum])?;
    }
    Ok(())
}

pub(super) fn apply_build_layouts(
    transaction: &Transaction<'_>,
    layouts: &[BuildDashboardLayout],
) -> Result<(), AppError> {
    for layout in layouts {
        transaction.execute(
            "UPDATE character_build_plans
             SET display_order = ?1, pinned = ?2
             WHERE character_id = ?3",
            params![layout.display_order, layout.pinned, layout.character_id],
        )?;
    }
    Ok(())
}

pub(super) fn load_all_build_plans(
    connection: &Connection,
) -> Result<HashMap<u32, CharacterBuildPlan>, AppError> {
    let mut target_stmt = connection.prepare(
        "SELECT character_id, stat_key, target, priority, minimum
         FROM character_build_targets
         ORDER BY character_id, priority, stat_key",
    )?;
    let mut targets_by_char = HashMap::<u32, Vec<BuildTarget>>::new();
    let target_rows = target_stmt.query_map([], |row| {
        Ok((
            row.get::<_, u32>(0)?,
            BuildTarget {
                stat_key: row.get(1)?,
                target: row.get(2)?,
                priority: row.get(3)?,
                minimum: row.get(4)?,
            },
        ))
    })?;
    for row in target_rows {
        let (character_id, target) = row?;
        targets_by_char
            .entry(character_id)
            .or_default()
            .push(target);
    }

    let mut plan_stmt = connection.prepare(
        "SELECT character_id, cavern_mode, cavern_set_a, cavern_set_b, planar_set_id,
                main_stats_json, effective_substats_json, note,
                COALESCE(substat_weights_json, '{}'), COALESCE(min_potential_pct, 40),
                COALESCE(spd_target, 0), COALESCE(game_version, ''), updated_at
         FROM character_build_plans",
    )?;
    let plan_rows = plan_stmt.query_map([], |row| {
        Ok((
            row.get::<_, u32>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, u32>(2)?,
            row.get::<_, Option<u32>>(3)?,
            row.get::<_, u32>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, f64>(9)?,
            row.get::<_, f64>(10)?,
            row.get::<_, String>(11)?,
            row.get::<_, i64>(12)?,
        ))
    })?;
    let mut plans = HashMap::new();
    for row in plan_rows {
        let (
            character_id,
            cavern_mode,
            cavern_set_a,
            cavern_set_b,
            planar_set_id,
            main_stats_json,
            effective_substats_json,
            note,
            substat_weights_json,
            min_potential_pct,
            spd_target,
            game_version,
            updated_at,
        ) = row?;
        plans.insert(
            character_id,
            CharacterBuildPlan {
                character_id,
                cavern_mode,
                cavern_set_a,
                cavern_set_b,
                planar_set_id,
                main_stats: serde_json::from_str(&main_stats_json).unwrap_or_default(),
                targets: targets_by_char.remove(&character_id).unwrap_or_default(),
                effective_substats: serde_json::from_str(&effective_substats_json)
                    .unwrap_or_default(),
                note,
                substat_weights: serde_json::from_str(&substat_weights_json).unwrap_or_default(),
                min_potential_pct,
                spd_target,
                game_version,
                updated_at,
            },
        );
    }
    Ok(plans)
}

pub(super) fn clear_character_build_scores(transaction: &Transaction<'_>) -> Result<(), AppError> {
    transaction.execute("DELETE FROM character_build_scores", [])?;
    Ok(())
}
