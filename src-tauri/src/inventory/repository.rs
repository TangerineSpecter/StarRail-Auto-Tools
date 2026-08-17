use std::{
    collections::{HashMap, HashSet},
    fs::File,
    io::BufWriter,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{
    params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension, Row,
    Transaction,
};
use serde_json::{json, Value};

use super::build_plan_excel::{self, ExportRow};
use super::models::*;
use super::{
    canonical_character_name, canonical_light_cone_name, canonical_relic_name, character_rarity,
    normalize_import, normalize_main_stat, normalize_slot, resolve_equipped_character_id,
};
use crate::error::AppError;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub(crate) struct AccountMismatch {
    pub existing_uid: u32,
    pub incoming_uid: u32,
}

pub(crate) type ApplyResult = Result<InventorySummary, AccountMismatch>;

impl InventoryStore {
    pub fn initialize(path: PathBuf) -> Result<Self, AppError> {
        let store = Self { path };
        let connection = store.connect()?;
        store.migrate(&connection)?;
        Ok(store)
    }

    fn connect(&self) -> Result<Connection, AppError> {
        let connection = Connection::open(&self.path)?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        Ok(connection)
    }

    fn migrate(&self, connection: &Connection) -> Result<(), AppError> {
        connection.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS schema_meta (
                version INTEGER NOT NULL
            );
            INSERT INTO schema_meta(version)
            SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM schema_meta);

            CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS import_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at INTEGER NOT NULL,
                finished_at INTEGER,
                status TEXT NOT NULL,
                protocol_version TEXT NOT NULL,
                relic_count INTEGER NOT NULL DEFAULT 0,
                light_cone_count INTEGER NOT NULL DEFAULT 0,
                character_count INTEGER NOT NULL DEFAULT 0,
                error TEXT
            );

            CREATE TABLE IF NOT EXISTS relics (
                item_id INTEGER PRIMARY KEY,
                set_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                set_name TEXT NOT NULL,
                slot TEXT NOT NULL,
                rarity INTEGER NOT NULL,
                level INTEGER NOT NULL,
                main_stat TEXT NOT NULL,
                main_stat_value REAL NOT NULL DEFAULT 0,
                location TEXT NOT NULL,
                equipped_character_id INTEGER,
                locked INTEGER NOT NULL,
                discard INTEGER NOT NULL,
                source TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                last_seen_run INTEGER
            );

            CREATE TABLE IF NOT EXISTS relic_substats (
                relic_id INTEGER NOT NULL REFERENCES relics(item_id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                position INTEGER NOT NULL,
                stat_key TEXT NOT NULL,
                value REAL NOT NULL,
                count INTEGER NOT NULL,
                step INTEGER NOT NULL,
                PRIMARY KEY (relic_id, kind, position)
            );

            CREATE TABLE IF NOT EXISTS light_cones (
                item_id INTEGER PRIMARY KEY,
                template_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                level INTEGER NOT NULL,
                ascension INTEGER NOT NULL,
                superimposition INTEGER NOT NULL,
                location TEXT NOT NULL,
                equipped_character_id INTEGER,
                locked INTEGER NOT NULL,
                source TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                last_seen_run INTEGER
            );

            CREATE TABLE IF NOT EXISTS characters (
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

            CREATE TABLE IF NOT EXISTS character_build_plans (
                character_id INTEGER PRIMARY KEY,
                cavern_mode TEXT NOT NULL,
                cavern_set_a INTEGER NOT NULL,
                cavern_set_b INTEGER,
                planar_set_id INTEGER NOT NULL,
                main_stats_json TEXT NOT NULL,
                effective_substats_json TEXT NOT NULL DEFAULT '[]',
                note TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0,
                pinned INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS character_build_targets (
                character_id INTEGER NOT NULL REFERENCES character_build_plans(character_id) ON DELETE CASCADE,
                stat_key TEXT NOT NULL,
                target REAL NOT NULL,
                priority INTEGER NOT NULL,
                max_gap REAL NOT NULL,
                minimum REAL NOT NULL DEFAULT 0,
                PRIMARY KEY (character_id, stat_key)
            );

            CREATE TABLE IF NOT EXISTS teams (
                team_id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                slot0 INTEGER,
                slot1 INTEGER,
                slot2 INTEGER,
                slot3 INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS character_build_scores (
                character_id INTEGER PRIMARY KEY,
                letter_grade TEXT NOT NULL,
                potential_pct REAL NOT NULL,
                completion_pct REAL NOT NULL,
                relic_count INTEGER NOT NULL DEFAULT 0,
                has_plan INTEGER NOT NULL DEFAULT 0,
                computed_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_relics_set_slot ON relics(set_id, slot);
            CREATE INDEX IF NOT EXISTS idx_relics_rarity_level ON relics(rarity, level);
            CREATE INDEX IF NOT EXISTS idx_relics_main_stat ON relics(main_stat);
            CREATE INDEX IF NOT EXISTS idx_relics_location ON relics(location);
            CREATE INDEX IF NOT EXISTS idx_relic_substats_key_value ON relic_substats(stat_key, value);
            CREATE INDEX IF NOT EXISTS idx_light_cones_level ON light_cones(level, ascension);
            CREATE INDEX IF NOT EXISTS idx_light_cones_location ON light_cones(location);
            CREATE INDEX IF NOT EXISTS idx_characters_path_level ON characters(path, level);
            CREATE INDEX IF NOT EXISTS idx_teams_updated_at ON teams(updated_at DESC);
            "#,
        )?;
        // Older databases predate the derived main-stat value. SQLite does not support
        // conditional ADD COLUMN in a batch, so ignore the duplicate-column case.
        let _ = connection.execute(
            "ALTER TABLE relics ADD COLUMN main_stat_value REAL NOT NULL DEFAULT 0",
            [],
        );
        let _ = connection.execute(
            "ALTER TABLE character_build_targets ADD COLUMN minimum REAL NOT NULL DEFAULT 0",
            [],
        );
        let _ = connection.execute(
            "ALTER TABLE character_build_plans ADD COLUMN effective_substats_json TEXT NOT NULL DEFAULT '[]'",
            [],
        );
        let _ = connection.execute(
            "ALTER TABLE character_build_plans ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0",
            [],
        );
        let _ = connection.execute(
            "ALTER TABLE character_build_plans ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0",
            [],
        );
        let _ = connection.execute(
            "ALTER TABLE character_build_plans ADD COLUMN note TEXT NOT NULL DEFAULT ''",
            [],
        );
        let _ = connection.execute(
            "ALTER TABLE character_build_plans ADD COLUMN substat_weights_json TEXT NOT NULL DEFAULT '{}'",
            [],
        );
        let _ = connection.execute(
            "ALTER TABLE character_build_plans ADD COLUMN min_potential_pct REAL NOT NULL DEFAULT 40",
            [],
        );
        let _ = connection.execute(
            "ALTER TABLE character_build_plans ADD COLUMN spd_target REAL NOT NULL DEFAULT 0",
            [],
        );
        let _ = connection.execute(
            "ALTER TABLE relics ADD COLUMN equipped_character_id INTEGER",
            [],
        );
        let _ = connection.execute(
            "ALTER TABLE light_cones ADD COLUMN equipped_character_id INTEGER",
            [],
        );
        let _ = connection.execute(
            "ALTER TABLE characters ADD COLUMN rarity INTEGER NOT NULL DEFAULT 5",
            [],
        );
        connection.execute(
            "UPDATE character_build_targets SET minimum = target - max_gap",
            [],
        )?;
        let schema_version =
            connection.query_row("SELECT version FROM schema_meta LIMIT 1", [], |row| {
                row.get::<_, i64>(0)
            })?;
        if schema_version < SCHEMA_VERSION {
            normalize_existing_records(connection)?;
            backfill_main_stat_values(connection)?;
            backfill_character_rarities(connection)?;
        }
        connection.execute("UPDATE schema_meta SET version = ?1", [SCHEMA_VERSION])?;
        Ok(())
    }

    pub fn summary(&self) -> Result<InventorySummary, AppError> {
        let connection = self.connect()?;
        summary_from_connection(&connection)
    }

    pub fn list_relic_sets(&self) -> Result<Vec<RelicSetOption>, AppError> {
        let connection = self.connect()?;
        let mut statement = connection.prepare(
            "SELECT set_id, MIN(set_name) FROM relics GROUP BY set_id ORDER BY MIN(set_name)",
        )?;
        let sets = statement
            .query_map([], |row| {
                Ok(RelicSetOption {
                    set_id: row.get(0)?,
                    name: row.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(sets)
    }

    pub fn build_plan(&self, character_id: u32) -> Result<Option<CharacterBuildPlan>, AppError> {
        let connection = self.connect()?;
        let row = connection.query_row(
            "SELECT cavern_mode, cavern_set_a, cavern_set_b, planar_set_id, main_stats_json, effective_substats_json, note,
                    COALESCE(substat_weights_json, '{}'), COALESCE(min_potential_pct, 40), COALESCE(spd_target, 0)
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
        }))
    }

    pub fn build_dashboard(&self) -> Result<Vec<BuildDashboardEntry>, AppError> {
        let connection = self.connect()?;
        let character_ids = connection
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
        let mut entries = Vec::new();
        for (character_id, display_order, pinned) in character_ids {
            let Some(plan) = self.build_plan(character_id)? else {
                continue;
            };
            let Some(character) = character_detail(&connection, character_id)? else {
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
        transaction.commit()?;
        Ok(())
    }

    pub fn set_build_dashboard_pinned(
        &self,
        character_id: u32,
        pinned: bool,
    ) -> Result<(), AppError> {
        let changed = self.connect()?.execute(
            "UPDATE character_build_plans SET pinned = ?1 WHERE character_id = ?2",
            params![pinned, character_id],
        )?;
        if changed == 0 {
            return Err(AppError::Database("毕业方案不存在".to_owned()));
        }
        Ok(())
    }

    pub fn export_build_plans_excel(&self, path: &Path) -> Result<(), AppError> {
        let connection = self.connect()?;
        let mut statement = connection.prepare(
            "SELECT character_id, name FROM characters ORDER BY rarity DESC, level DESC, name",
        )?;
        let characters = statement
            .query_map([], |row| {
                Ok((row.get::<_, u32>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let rows = characters
            .into_iter()
            .map(|(character_id, character_name)| {
                Ok(ExportRow {
                    character_id,
                    character_name,
                    plan: self.build_plan(character_id)?,
                })
            })
            .collect::<Result<Vec<_>, AppError>>()?;
        build_plan_excel::export(path, &rows)
    }

    pub fn import_build_plans_excel(&self, path: &Path) -> Result<u64, AppError> {
        let connection = self.connect()?;
        let mut statement = connection.prepare("SELECT character_id, name FROM characters")?;
        let character_ids = statement
            .query_map([], |row| row.get::<_, u32>(0))?
            .collect::<Result<HashSet<_>, _>>()?;
        let mut name_statement = connection.prepare("SELECT character_id, name FROM characters")?;
        let mut legacy_character_ids = HashMap::new();
        let mut duplicate_names = HashSet::new();
        for row in name_statement.query_map([], |row| {
            Ok((row.get::<_, u32>(0)?, row.get::<_, String>(1)?))
        })? {
            let (character_id, name) = row?;
            if legacy_character_ids
                .insert(name.clone(), character_id)
                .is_some()
            {
                duplicate_names.insert(name);
            }
        }
        legacy_character_ids.retain(|name, _| !duplicate_names.contains(name));
        let plans = build_plan_excel::import(path, &character_ids, &legacy_character_ids)?;
        if plans.is_empty() {
            return Ok(0);
        }
        let transaction = connection.unchecked_transaction()?;
        for plan in &plans {
            save_build_plan_in_transaction(&transaction, plan)?;
        }
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

    pub fn save_build_plan(&self, plan: &CharacterBuildPlan) -> Result<(), AppError> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        save_build_plan_in_transaction(&transaction, plan)?;
        // Plan weights changed; drop cached score so the next open/team view recomputes.
        transaction.execute(
            "DELETE FROM character_build_scores WHERE character_id = ?1",
            [plan.character_id],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn delete_build_plan(&self, character_id: u32) -> Result<(), AppError> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        transaction.execute(
            "DELETE FROM character_build_plans WHERE character_id = ?1",
            [character_id],
        )?;
        transaction.execute(
            "DELETE FROM character_build_scores WHERE character_id = ?1",
            [character_id],
        )?;
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

    pub fn list_teams(&self, filter: &TeamFilter) -> Result<PagedResult<Team>, AppError> {
        validate_page(&filter.page)?;
        let connection = self.connect()?;
        let mut clauses = Vec::new();
        let mut values = Vec::new();
        if let Some(search) = clean_filter(&filter.search) {
            clauses.push("(name LIKE ? OR note LIKE ?)".to_owned());
            let pattern = format!("%{search}%");
            values.push(SqlValue::Text(pattern.clone()));
            values.push(SqlValue::Text(pattern));
        }
        let where_sql = if clauses.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", clauses.join(" AND "))
        };
        let total: u64 = connection.query_row(
            &format!("SELECT COUNT(*) FROM teams {where_sql}"),
            params_from_iter(values.iter()),
            |row| row.get(0),
        )?;
        let offset = ((filter.page.page - 1) * filter.page.page_size) as i64;
        let limit = filter.page.page_size as i64;
        let list_sql = format!(
            "SELECT team_id, name, note, slot0, slot1, slot2, slot3, created_at, updated_at
             FROM teams
             {where_sql}
             ORDER BY updated_at DESC, team_id DESC
             LIMIT {limit} OFFSET {offset}"
        );
        let mut statement = connection.prepare(&list_sql)?;
        let rows = statement.query_map(params_from_iter(values.iter()), team_row_from_sqlite)?;
        let mut items = Vec::new();
        for row in rows {
            items.push(hydrate_team(&connection, row?)?);
        }
        Ok(PagedResult {
            items,
            total,
            page: filter.page.page,
            page_size: filter.page.page_size,
        })
    }

    pub fn get_team(&self, team_id: u32) -> Result<Team, AppError> {
        let connection = self.connect()?;
        let mut statement = connection.prepare(
            "SELECT team_id, name, note, slot0, slot1, slot2, slot3, created_at, updated_at
             FROM teams WHERE team_id = ?1",
        )?;
        let raw = statement
            .query_row([team_id], team_row_from_sqlite)
            .optional()?
            .ok_or_else(|| AppError::Database("配队不存在".to_owned()))?;
        hydrate_team(&connection, raw)
    }

    pub fn save_team(&self, input: &TeamInput) -> Result<Team, AppError> {
        let name = normalize_team_name(&input.name);
        if name.is_empty() {
            return Err(AppError::Database("配队名称不能为空".to_owned()));
        }
        let note = normalize_team_note(&input.note);
        if input.character_ids.len() != TEAM_SLOT_COUNT {
            return Err(AppError::Database("配队必须包含 4 个角色槽位".to_owned()));
        }
        let slots = normalize_team_slots(&input.character_ids)?;
        let connection = self.connect()?;
        // Existing orphan slots may be kept on update; only newly assigned members must exist.
        let previous_slots: HashSet<u32> = if let Some(existing_id) = input.team_id {
            connection
                .query_row(
                    "SELECT slot0, slot1, slot2, slot3 FROM teams WHERE team_id = ?1",
                    [existing_id],
                    |row| {
                        Ok([
                            row.get::<_, Option<u32>>(0)?,
                            row.get::<_, Option<u32>>(1)?,
                            row.get::<_, Option<u32>>(2)?,
                            row.get::<_, Option<u32>>(3)?,
                        ])
                    },
                )
                .optional()?
                .into_iter()
                .flatten()
                .flatten()
                .collect()
        } else {
            HashSet::new()
        };
        for slot in slots.iter().flatten() {
            if previous_slots.contains(slot) {
                continue;
            }
            let exists: bool = connection
                .query_row(
                    "SELECT 1 FROM characters WHERE character_id = ?1",
                    [*slot],
                    |_| Ok(true),
                )
                .optional()?
                .unwrap_or(false);
            if !exists {
                return Err(AppError::Database(format!(
                    "角色 {slot} 不在背包档案中，无法加入配队"
                )));
            }
        }
        let now = now_millis();
        let team_id = if let Some(existing_id) = input.team_id {
            let updated = connection.execute(
                "UPDATE teams
                 SET name = ?1, note = ?2, slot0 = ?3, slot1 = ?4, slot2 = ?5, slot3 = ?6,
                     updated_at = ?7
                 WHERE team_id = ?8",
                params![
                    name,
                    note,
                    slots[0],
                    slots[1],
                    slots[2],
                    slots[3],
                    now,
                    existing_id
                ],
            )?;
            if updated == 0 {
                return Err(AppError::Database("配队不存在".to_owned()));
            }
            existing_id
        } else {
            connection.execute(
                "INSERT INTO teams(name, note, slot0, slot1, slot2, slot3, created_at, updated_at)
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![name, note, slots[0], slots[1], slots[2], slots[3], now, now],
            )?;
            connection.last_insert_rowid() as u32
        };
        self.get_team(team_id)
    }

    pub fn delete_team(&self, team_id: u32) -> Result<(), AppError> {
        let deleted = self
            .connect()?
            .execute("DELETE FROM teams WHERE team_id = ?1", [team_id])?;
        if deleted == 0 {
            return Err(AppError::Database("配队不存在".to_owned()));
        }
        Ok(())
    }

    pub fn recommend_build(
        &self,
        request: &BuildRecommendationRequest,
    ) -> Result<BuildRecommendation, AppError> {
        let Some(plan) = self.build_plan(request.character_id)? else {
            return Err(AppError::Database("请先保存该角色的毕业方案".to_owned()));
        };
        let connection = self.connect()?;
        let character_name: String = connection
            .query_row(
                "SELECT name FROM characters WHERE character_id = ?1",
                [request.character_id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| AppError::Database("角色不存在".to_owned()))?;
        let current = load_equipped_build_relics(&connection, request.character_id)?;
        let current_progress = progress_for(&plan.targets, &current);
        let candidates = build_candidates(&connection, &plan, request.include_equipped)?;
        let recommended = choose_build(&plan, candidates, request.character_id);
        let recommended_progress = recommended
            .as_ref()
            .map(|items| progress_for(&plan.targets, items));
        let message = if recommended.is_some() {
            "已按套装结构与属性优先级找到推荐组合。".to_owned()
        } else {
            "当前候选无法同时满足套装、主词条与属性缺口限制。".to_owned()
        };
        Ok(BuildRecommendation {
            current: current_progress,
            recommended: recommended.map(|items| {
                items
                    .into_iter()
                    .map(|item| item.into_choice(request.character_id, &character_name))
                    .collect()
            }),
            recommended_progress,
            message,
        })
    }

    pub fn current_uid(&self) -> Result<Option<u32>, AppError> {
        let connection = self.connect()?;
        let value: Option<String> = connection
            .query_row(
                "SELECT value FROM app_state WHERE key = 'current_uid'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        Ok(value.and_then(|value| value.parse().ok()))
    }

    pub fn apply_full_snapshot(&self, import: &InventoryImport) -> Result<ApplyResult, AppError> {
        let incoming_uid = import.metadata.uid.unwrap_or_default();
        if let Some(existing_uid) = self.current_uid()? {
            if incoming_uid != 0 && existing_uid != incoming_uid {
                return Ok(Err(AccountMismatch {
                    existing_uid,
                    incoming_uid,
                }));
            }
        }

        self.apply_snapshot(import, false, false, &[], &[], &[])
            .map(Ok)
    }

    pub fn replace_account_and_apply(
        &self,
        import: &InventoryImport,
    ) -> Result<InventorySummary, AppError> {
        // Game-driven account replace refreshes inventory only; local teams are kept.
        self.apply_snapshot(import, true, false, &[], &[], &[])
    }

    fn apply_snapshot(
        &self,
        import: &InventoryImport,
        clear_first: bool,
        reset_sync_state: bool,
        build_plans: &[CharacterBuildPlan],
        build_layouts: &[BuildDashboardLayout],
        teams: &[TeamSyncRecord],
    ) -> Result<InventorySummary, AppError> {
        let now = now_millis();
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;

        if clear_first {
            clear_all(&transaction)?;
            // Equipment may change; cached scores are always invalidated on inventory replace.
            clear_character_build_scores(&transaction)?;
            if reset_sync_state {
                transaction.execute("DELETE FROM character_build_plans", [])?;
                // WebDAV full restore wipes local planning data, then reimports from snapshot.
                transaction.execute("DELETE FROM teams", [])?;
                transaction.execute(
                    "DELETE FROM app_state WHERE key IN ('current_uid', 'trailblazer')",
                    [],
                )?;
            }
        } else {
            // Incremental full snapshot still rewrites gear; drop all derived scores.
            clear_character_build_scores(&transaction)?;
        }

        let run_id = transaction.query_row(
            "INSERT INTO import_runs(started_at, status, protocol_version)
             VALUES (?1, 'running', ?2) RETURNING id",
            params![now, PROTOCOL_VERSION],
            |row| row.get::<_, i64>(0),
        )?;

        if let Some(uid) = import.metadata.uid {
            transaction.execute(
                "INSERT INTO app_state(key, value) VALUES ('current_uid', ?1)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [uid.to_string()],
            )?;
        }
        if let Some(trailblazer) = &import.metadata.trailblazer {
            transaction.execute(
                "INSERT INTO app_state(key, value) VALUES ('trailblazer', ?1)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [trailblazer],
            )?;
        }

        for relic in &import.relics {
            upsert_relic(&transaction, relic, now, run_id)?;
        }
        for light_cone in &import.light_cones {
            transaction.execute(
                r#"
                INSERT INTO light_cones(
                    item_id, template_id, name, level, ascension, superimposition,
                    location, equipped_character_id, locked, source, updated_at, last_seen_run
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'network', ?10, ?11)
                ON CONFLICT(item_id) DO UPDATE SET
                    template_id = excluded.template_id,
                    name = excluded.name,
                    level = excluded.level,
                    ascension = excluded.ascension,
                    superimposition = excluded.superimposition,
                    location = excluded.location,
                    equipped_character_id = excluded.equipped_character_id,
                    locked = excluded.locked,
                    source = excluded.source,
                    updated_at = excluded.updated_at,
                    last_seen_run = excluded.last_seen_run
                "#,
                params![
                    light_cone._uid,
                    light_cone.id,
                    light_cone.name,
                    light_cone.level,
                    light_cone.ascension,
                    light_cone.superimposition,
                    light_cone.location,
                    light_cone.equipped_character_id,
                    light_cone.lock,
                    now,
                    run_id
                ],
            )?;
        }
        for character in &import.characters {
            transaction.execute(
                r#"
                INSERT INTO characters(
                    character_id, name, path, level, ascension, eidolon, rarity,
                    skills_json, traces_json, memosprite_json, ability_version,
                    source, updated_at, last_seen_run
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'network', ?12, ?13)
                ON CONFLICT(character_id) DO UPDATE SET
                    name = excluded.name,
                    path = excluded.path,
                    level = excluded.level,
                    ascension = excluded.ascension,
                    eidolon = excluded.eidolon,
                    rarity = excluded.rarity,
                    skills_json = excluded.skills_json,
                    traces_json = excluded.traces_json,
                    memosprite_json = excluded.memosprite_json,
                    ability_version = excluded.ability_version,
                    source = excluded.source,
                    updated_at = excluded.updated_at,
                    last_seen_run = excluded.last_seen_run
                "#,
                params![
                    character.id,
                    character.name,
                    character.path,
                    character.level,
                    character.ascension,
                    character.eidolon,
                    character_rarity(&character.name).unwrap_or(5),
                    serde_json::to_string(&character.skills)
                        .map_err(|error| AppError::Database(error.to_string()))?,
                    serde_json::to_string(&character.traces)
                        .map_err(|error| AppError::Database(error.to_string()))?,
                    character
                        .memosprite
                        .as_ref()
                        .map(serde_json::to_string)
                        .transpose()
                        .map_err(|error| AppError::Database(error.to_string()))?,
                    character.ability_version,
                    now,
                    run_id
                ],
            )?;
        }

        transaction.execute(
            "DELETE FROM relics WHERE last_seen_run IS NULL OR last_seen_run <> ?1",
            [run_id],
        )?;
        transaction.execute(
            "DELETE FROM light_cones WHERE last_seen_run IS NULL OR last_seen_run <> ?1",
            [run_id],
        )?;
        transaction.execute(
            "DELETE FROM characters WHERE last_seen_run IS NULL OR last_seen_run <> ?1",
            [run_id],
        )?;
        transaction.execute(
            r#"
            UPDATE import_runs SET
                finished_at = ?1,
                status = 'complete',
                relic_count = ?2,
                light_cone_count = ?3,
                character_count = ?4
            WHERE id = ?5
            "#,
            params![
                now,
                import.relics.len() as i64,
                import.light_cones.len() as i64,
                import.characters.len() as i64,
                run_id
            ],
        )?;
        for plan in build_plans {
            save_build_plan_in_transaction(&transaction, plan)?;
        }
        apply_build_layouts(&transaction, build_layouts)?;
        if reset_sync_state {
            // Empty slice intentionally clears all teams after wipe.
            replace_teams_in_transaction(&transaction, teams)?;
        }
        transaction.commit()?;
        self.summary()
    }

    pub fn list_relics(
        &self,
        filter: &RelicFilter,
    ) -> Result<PagedResult<RelicListItem>, AppError> {
        validate_page(&filter.page)?;
        let connection = self.connect()?;
        let mut clauses = Vec::new();
        let mut values = Vec::new();

        if let Some(search) = clean_filter(&filter.search) {
            push_equipped_owner_search(
                &connection,
                &mut clauses,
                &mut values,
                &search,
                "(name LIKE ? OR set_name LIKE ? OR location LIKE ?)",
                3,
            )?;
        }
        push_text_filters(&mut clauses, &mut values, "slot", &filter.slots);
        push_number_filters(&mut clauses, &mut values, "rarity", &filter.rarities);
        push_number_filter(&mut clauses, &mut values, "level", ">=", filter.min_level);
        push_number_filter(&mut clauses, &mut values, "level", "<=", filter.max_level);
        push_text_filters(&mut clauses, &mut values, "main_stat", &filter.main_stats);
        let sub_stats = clean_filters(&filter.sub_stats);
        if sub_stats.is_some()
            || filter.min_substat_count.is_some()
            || filter.max_substat_count.is_some()
        {
            let mut substat_clauses = vec!["s.relic_id = relics.item_id".to_owned()];
            if let Some(sub_stats) = sub_stats {
                let placeholders = std::iter::repeat_n("?", sub_stats.len())
                    .collect::<Vec<_>>()
                    .join(", ");
                substat_clauses.push(format!("s.stat_key IN ({placeholders})"));
                values.extend(sub_stats.into_iter().map(SqlValue::Text));
            }
            if let Some(count) = filter.min_substat_count {
                substat_clauses.push("s.count >= ?".to_owned());
                values.push(SqlValue::Integer(count as i64));
            }
            if let Some(count) = filter.max_substat_count {
                substat_clauses.push("s.count <= ?".to_owned());
                values.push(SqlValue::Integer(count as i64));
            }
            clauses.push(format!(
                "EXISTS (SELECT 1 FROM relic_substats s WHERE {})",
                substat_clauses.join(" AND ")
            ));
        }
        push_bool_filter(&mut clauses, &mut values, "locked", filter.locked);
        push_bool_filter(&mut clauses, &mut values, "discard", filter.discard);
        if let Some(equipped) = filter.equipped {
            clauses.push(if equipped {
                "equipped_character_id IS NOT NULL".to_owned()
            } else {
                "equipped_character_id IS NULL".to_owned()
            });
        }

        let where_sql = make_where(&clauses);
        let total = query_count(&connection, "relics", &where_sql, &values)?;
        let mut paged_values = values.clone();
        paged_values.push(SqlValue::Integer(filter.page.page_size as i64));
        paged_values.push(SqlValue::Integer(
            ((filter.page.page - 1) * filter.page.page_size) as i64,
        ));
        let sql = format!(
            "SELECT item_id, set_id, name, set_name, slot, rarity, level, main_stat, main_stat_value,
                    location, equipped_character_id, locked, discard, source, updated_at
             FROM relics {where_sql}
             ORDER BY rarity DESC, level DESC, item_id DESC LIMIT ? OFFSET ?"
        );
        let mut statement = connection.prepare(&sql)?;
        let mut items = statement
            .query_map(params_from_iter(paged_values.iter()), map_relic)?
            .collect::<Result<Vec<_>, _>>()?;

        let mut substat_stmt = connection.prepare(
            "SELECT kind, position, stat_key, value, count, step
             FROM relic_substats WHERE relic_id = ?1 AND kind = 'normal' ORDER BY position",
        )?;

        for item in &mut items {
            item.substats = substat_stmt
                .query_map([item.item_id], |row| {
                    Ok(RelicSubstatItem {
                        kind: row.get(0)?,
                        position: row.get(1)?,
                        key: row.get(2)?,
                        value: row.get(3)?,
                        count: row.get(4)?,
                        step: row.get(5)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
        }

        Ok(PagedResult {
            items,
            total,
            page: filter.page.page,
            page_size: filter.page.page_size,
        })
    }

    pub fn build_plan_count(&self) -> Result<u64, AppError> {
        let connection = self.connect()?;
        Ok(
            connection.query_row("SELECT COUNT(*) FROM character_build_plans", [], |row| {
                row.get(0)
            })?,
        )
    }

    pub fn scan_relics_by_main_stat(
        &self,
        page: &PageQuery,
    ) -> Result<RelicMainStatScanResult, AppError> {
        validate_page(page)?;
        let connection = self.connect()?;
        let plans = connection
            .prepare("SELECT main_stats_json FROM character_build_plans")?
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        let plan_count = plans.len() as u64;
        let mut allowed_main_stats = HashMap::<String, Vec<String>>::new();
        for main_stats_json in plans {
            let main_stats = serde_json::from_str::<HashMap<String, Vec<String>>>(&main_stats_json)
                .unwrap_or_default();
            for (slot, stats) in main_stats {
                if stats.is_empty() {
                    continue;
                }
                let allowed = allowed_main_stats.entry(slot).or_default();
                for stat in stats {
                    if !allowed.contains(&stat) {
                        allowed.push(stat);
                    }
                }
            }
        }
        // Head/Hands always have a single fixed main stat; treat as configured even when
        // plans omit them so unequipped pieces are not flagged as "no target main stat".
        if plan_count > 0 {
            for &(slot, main) in FIXED_MAIN_STATS {
                allowed_main_stats.insert(slot.to_owned(), vec![main.to_owned()]);
            }
        }
        for stats in allowed_main_stats.values_mut() {
            stats.sort();
        }

        let mut clauses = vec!["equipped_character_id IS NULL".to_owned()];
        let mut values = Vec::new();
        for (slot, stats) in &allowed_main_stats {
            let placeholders = std::iter::repeat_n("?", stats.len())
                .collect::<Vec<_>>()
                .join(", ");
            clauses.push(format!("(slot != ? OR main_stat NOT IN ({placeholders}))"));
            values.push(SqlValue::Text(slot.clone()));
            values.extend(stats.iter().cloned().map(SqlValue::Text));
        }
        let where_sql = make_where(&clauses);
        let total = query_count(&connection, "relics", &where_sql, &values)?;
        let mut paged_values = values.clone();
        paged_values.push(SqlValue::Integer(page.page_size as i64));
        paged_values.push(SqlValue::Integer(((page.page - 1) * page.page_size) as i64));
        let sql = format!(
            "SELECT item_id, set_id, name, set_name, slot, rarity, level, main_stat, main_stat_value,
                    location, equipped_character_id, locked, discard, source, updated_at
             FROM relics {where_sql}
             ORDER BY rarity DESC, level DESC, item_id DESC LIMIT ? OFFSET ?"
        );
        let mut statement = connection.prepare(&sql)?;
        let items = statement
            .query_map(params_from_iter(paged_values.iter()), map_relic)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(RelicMainStatScanResult {
            items,
            total,
            page: page.page,
            page_size: page.page_size,
            plan_count,
            allowed_main_stats,
        })
    }

    /// Returns relic main-stat scan results grouped by set → slot → main stat.
    /// No pagination needed — the GROUP BY query produces a compact summary.
    pub fn scan_relics_by_main_stat_grouped(&self) -> Result<RelicMainStatGroupedResult, AppError> {
        let connection = self.connect()?;
        let plans = connection
            .prepare("SELECT main_stats_json FROM character_build_plans")?
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        let plan_count = plans.len() as u64;
        let mut allowed_main_stats = HashMap::<String, Vec<String>>::new();
        for main_stats_json in plans {
            let main_stats = serde_json::from_str::<HashMap<String, Vec<String>>>(&main_stats_json)
                .unwrap_or_default();
            for (slot, stats) in main_stats {
                if stats.is_empty() {
                    continue;
                }
                let allowed = allowed_main_stats.entry(slot).or_default();
                for stat in stats {
                    if !allowed.contains(&stat) {
                        allowed.push(stat);
                    }
                }
            }
        }
        if plan_count > 0 {
            for &(slot, main) in FIXED_MAIN_STATS {
                allowed_main_stats.insert(slot.to_owned(), vec![main.to_owned()]);
            }
        }
        for stats in allowed_main_stats.values_mut() {
            stats.sort();
        }

        let mut clauses = vec!["equipped_character_id IS NULL".to_owned()];
        let mut values = Vec::new();
        for (slot, stats) in &allowed_main_stats {
            let placeholders = std::iter::repeat_n("?", stats.len())
                .collect::<Vec<_>>()
                .join(", ");
            clauses.push(format!("(slot != ? OR main_stat NOT IN ({placeholders}))"));
            values.push(SqlValue::Text(slot.clone()));
            values.extend(stats.iter().cloned().map(SqlValue::Text));
        }
        let where_sql = make_where(&clauses);
        let total = query_count(&connection, "relics", &where_sql, &values)?;

        let sql = format!(
            "SELECT set_id, set_name, slot, main_stat, COUNT(*) AS cnt
             FROM relics {where_sql}
             GROUP BY set_id, set_name, slot, main_stat
             ORDER BY set_name ASC, set_id ASC, slot ASC, cnt DESC"
        );
        let mut statement = connection.prepare(&sql)?;

        // Slot display ordering.
        let slot_order: HashMap<&str, usize> = [
            ("Head", 0),
            ("Hands", 1),
            ("Body", 2),
            ("Feet", 3),
            ("PlanarSphere", 4),
            ("LinkRope", 5),
        ]
        .into_iter()
        .collect();

        let mut groups: Vec<RelicMainStatSetGroup> = Vec::new();

        let rows = statement.query_map(params_from_iter(values.iter()), |row| {
            Ok((
                row.get::<_, u32>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, u64>(4)?,
            ))
        })?;

        for row in rows {
            let (set_id, set_name, slot, main_stat, count) = row?;
            let set_group = match groups.iter_mut().find(|g| g.set_id == set_id) {
                Some(g) => g,
                None => {
                    groups.push(RelicMainStatSetGroup {
                        set_id,
                        set_name: set_name.clone(),
                        parts: Vec::new(),
                    });
                    groups.last_mut().unwrap()
                }
            };
            match set_group.parts.iter_mut().find(|p| p.slot == slot) {
                Some(p) => {
                    p.stats.push(RelicMainStatEntry { main_stat, count });
                }
                None => {
                    set_group.parts.push(RelicMainStatPartGroup {
                        slot,
                        stats: vec![RelicMainStatEntry { main_stat, count }],
                    });
                }
            }
        }

        // Sort parts within each set by slot order.
        for set_group in &mut groups {
            set_group
                .parts
                .sort_by_key(|p| *slot_order.get(p.slot.as_str()).unwrap_or(&99));
        }

        Ok(RelicMainStatGroupedResult {
            groups,
            total,
            plan_count,
            allowed_main_stats,
        })
    }

    pub fn list_light_cones(
        &self,
        filter: &LightConeFilter,
    ) -> Result<PagedResult<LightConeListItem>, AppError> {
        validate_page(&filter.page)?;
        let connection = self.connect()?;
        let mut clauses = Vec::new();
        let mut values = Vec::new();
        if let Some(search) = clean_filter(&filter.search) {
            push_equipped_owner_search(
                &connection,
                &mut clauses,
                &mut values,
                &search,
                "(name LIKE ? OR location LIKE ?)",
                2,
            )?;
        }
        push_number_filter(&mut clauses, &mut values, "level", ">=", filter.min_level);
        push_number_filter(&mut clauses, &mut values, "level", "<=", filter.max_level);
        push_number_filter(
            &mut clauses,
            &mut values,
            "ascension",
            ">=",
            filter.min_ascension,
        );
        push_number_filters(
            &mut clauses,
            &mut values,
            "superimposition",
            &filter.superimposition,
        );
        push_bool_filter(&mut clauses, &mut values, "locked", filter.locked);
        if let Some(equipped) = filter.equipped {
            clauses.push(if equipped {
                "equipped_character_id IS NOT NULL".to_owned()
            } else {
                "equipped_character_id IS NULL".to_owned()
            });
        }
        let where_sql = make_where(&clauses);
        let total = query_count(&connection, "light_cones", &where_sql, &values)?;
        let mut paged_values = values.clone();
        paged_values.push(SqlValue::Integer(filter.page.page_size as i64));
        paged_values.push(SqlValue::Integer(
            ((filter.page.page - 1) * filter.page.page_size) as i64,
        ));
        let sql = format!(
            "SELECT item_id, template_id, name, level, ascension, superimposition,
                    location, equipped_character_id, locked, source, updated_at
             FROM light_cones {where_sql}
             ORDER BY level DESC, superimposition DESC, item_id DESC LIMIT ? OFFSET ?"
        );
        let mut statement = connection.prepare(&sql)?;
        let items = statement
            .query_map(params_from_iter(paged_values.iter()), map_light_cone)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(PagedResult {
            items,
            total,
            page: filter.page.page,
            page_size: filter.page.page_size,
        })
    }

    pub fn list_characters(
        &self,
        filter: &CharacterFilter,
    ) -> Result<PagedResult<CharacterListItem>, AppError> {
        validate_page(&filter.page)?;
        let connection = self.connect()?;
        let mut clauses = Vec::new();
        let mut values = Vec::new();
        if let Some(search) = clean_filter(&filter.search) {
            clauses.push("name LIKE ?".to_owned());
            values.push(SqlValue::Text(format!("%{search}%")));
        }
        push_text_filters(&mut clauses, &mut values, "name", &filter.names);
        push_text_filters(&mut clauses, &mut values, "path", &filter.path);
        push_number_filter(&mut clauses, &mut values, "level", ">=", filter.min_level);
        push_number_filter(&mut clauses, &mut values, "level", "<=", filter.max_level);
        push_number_filter(
            &mut clauses,
            &mut values,
            "ascension",
            ">=",
            filter.min_ascension,
        );
        push_number_filters(&mut clauses, &mut values, "eidolon", &filter.eidolon);
        if let Some(has_build_plan) = filter.has_build_plan {
            clauses.push(if has_build_plan {
                "EXISTS (SELECT 1 FROM character_build_plans WHERE character_build_plans.character_id = characters.character_id)".to_owned()
            } else {
                "NOT EXISTS (SELECT 1 FROM character_build_plans WHERE character_build_plans.character_id = characters.character_id)".to_owned()
            });
        }
        let where_sql = make_where(&clauses);
        let total = query_count(&connection, "characters", &where_sql, &values)?;
        let mut paged_values = values.clone();
        paged_values.push(SqlValue::Integer(filter.page.page_size as i64));
        paged_values.push(SqlValue::Integer(
            ((filter.page.page - 1) * filter.page.page_size) as i64,
        ));
        let sql = format!(
            "SELECT character_id, name, path, level, ascension, eidolon,
                    EXISTS (SELECT 1 FROM character_build_plans WHERE character_build_plans.character_id = characters.character_id),
                    ability_version, source, updated_at
             FROM characters {where_sql}
             ORDER BY rarity DESC, level DESC, eidolon DESC, character_id LIMIT ? OFFSET ?"
        );
        let mut statement = connection.prepare(&sql)?;
        let items = statement
            .query_map(params_from_iter(paged_values.iter()), map_character)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(PagedResult {
            items,
            total,
            page: filter.page.page,
            page_size: filter.page.page_size,
        })
    }

    pub fn detail(&self, kind: InventoryKind, id: u32) -> Result<InventoryDetail, AppError> {
        let connection = self.connect()?;
        let data = match kind {
            InventoryKind::Relic => relic_detail(&connection, id)?,
            InventoryKind::LightCone => light_cone_detail(&connection, id)?,
            InventoryKind::Character => character_detail(&connection, id)?,
        }
        .ok_or_else(|| AppError::Database(format!("找不到数据 ID：{id}")))?;
        Ok(InventoryDetail { kind, data })
    }

    pub fn delete_items(&self, request: &DeleteItemsRequest) -> Result<u64, AppError> {
        if request.ids.is_empty() {
            return Err(AppError::EmptyDeleteRequest);
        }
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        let table = table_for_kind(request.kind);
        let id_column = id_column_for_kind(request.kind);
        let placeholders = std::iter::repeat_n("?", request.ids.len())
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!("DELETE FROM {table} WHERE {id_column} IN ({placeholders})");
        let values = request
            .ids
            .iter()
            .map(|id| SqlValue::Integer(*id as i64))
            .collect::<Vec<_>>();
        let deleted = transaction.execute(&sql, params_from_iter(values.iter()))?;
        // Relic/character/light-cone deletes change equipped gear; drop derived scores.
        clear_character_build_scores(&transaction)?;
        transaction.commit()?;
        Ok(deleted as u64)
    }

    pub fn clear(&self, kind: Option<InventoryKind>) -> Result<(), AppError> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        if let Some(kind) = kind {
            transaction.execute(&format!("DELETE FROM {}", table_for_kind(kind)), [])?;
            // Any inventory-table clear can desync equipped gear vs cached scores.
            clear_character_build_scores(&transaction)?;
        } else {
            clear_all(&transaction)?;
            clear_character_build_scores(&transaction)?;
            transaction.execute("DELETE FROM app_state", [])?;
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn export_to_path(&self, path: &Path) -> Result<(), AppError> {
        let connection = self.connect()?;
        let uid = self.current_uid()?;
        let trailblazer: Option<String> = connection
            .query_row(
                "SELECT value FROM app_state WHERE key = 'trailblazer'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        let export = json!({
            "source": "starrail_auto_tools",
            "build": env!("CARGO_PKG_VERSION"),
            "version": 4,
            "metadata": { "uid": uid, "trailblazer": trailblazer },
            "gacha": { "stellar_jade": 0, "oneric_shards": 0 },
            "materials": [],
            "light_cones": export_light_cones(&connection)?,
            "relics": export_relics(&connection)?,
            "characters": export_characters(&connection)?,
        });
        let writer = BufWriter::new(File::create(path)?);
        serde_json::to_writer_pretty(writer, &export)
            .map_err(|error| AppError::Export(error.to_string()))
    }

    pub fn sync_snapshot(&self) -> Result<SyncSnapshot, AppError> {
        let connection = self.connect()?;
        let metadata = ImportMetadata {
            uid: self.current_uid()?,
            trailblazer: connection
                .query_row(
                    "SELECT value FROM app_state WHERE key = 'trailblazer'",
                    [],
                    |row| row.get(0),
                )
                .optional()?,
        };
        let inventory = InventoryImport {
            metadata,
            relics: serde_json::from_value(Value::Array(export_relics(&connection)?))
                .map_err(|error| AppError::Database(error.to_string()))?,
            light_cones: serde_json::from_value(Value::Array(export_light_cones(&connection)?))
                .map_err(|error| AppError::Database(error.to_string()))?,
            characters: serde_json::from_value(Value::Array(export_characters(&connection)?))
                .map_err(|error| AppError::Database(error.to_string()))?,
        };
        let character_ids = connection
            .prepare("SELECT character_id FROM character_build_plans ORDER BY character_id")?
            .query_map([], |row| row.get::<_, u32>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        let mut build_plans = Vec::with_capacity(character_ids.len());
        for character_id in character_ids {
            if let Some(plan) = self.build_plan(character_id)? {
                build_plans.push(plan);
            }
        }
        let build_layouts = connection
            .prepare(
                "SELECT character_id, display_order, pinned
                 FROM character_build_plans ORDER BY character_id",
            )?
            .query_map([], |row| {
                Ok(BuildDashboardLayout {
                    character_id: row.get(0)?,
                    display_order: row.get(1)?,
                    pinned: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let teams = list_team_sync_records(&connection)?;
        Ok(SyncSnapshot {
            format_version: SYNC_FORMAT_VERSION,
            generated_at: now_millis(),
            source: "starrail-auto-tools".to_owned(),
            inventory,
            build_plans,
            build_layouts,
            teams,
        })
    }

    pub fn replace_with_sync_snapshot(
        &self,
        mut snapshot: SyncSnapshot,
    ) -> Result<InventorySummary, AppError> {
        if !supports_sync_format_version(snapshot.format_version) {
            return Err(AppError::Sync(format!(
                "不支持的同步数据版本：{}",
                snapshot.format_version
            )));
        }
        normalize_import(&mut snapshot.inventory);
        self.apply_snapshot(
            &snapshot.inventory,
            true,
            true,
            &snapshot.build_plans,
            &snapshot.build_layouts,
            &snapshot.teams,
        )
    }

    #[cfg(test)]
    fn test_store() -> Self {
        static TEST_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let sequence = TEST_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "starrail-auto-tools-test-{}-{}-{sequence}.sqlite3",
            std::process::id(),
            now_millis()
        ));
        Self::initialize(path).expect("test database")
    }
}

fn save_build_plan_in_transaction(
    transaction: &Transaction<'_>,
    plan: &CharacterBuildPlan,
) -> Result<(), AppError> {
    if !matches!(plan.cavern_mode.as_str(), "fourPiece" | "twoPlusTwo")
        || plan.targets.is_empty()
        || plan.targets.len() > 3
        || (plan.cavern_mode == "twoPlusTwo" && plan.cavern_set_b.is_none())
    {
        return Err(AppError::Database("毕业方案配置无效".to_owned()));
    }
    if plan.cavern_mode == "twoPlusTwo" && plan.cavern_set_b == Some(plan.cavern_set_a) {
        return Err(AppError::Database(
            "2+2 件套不能选择相同的遗器套装".to_owned(),
        ));
    }
    let note = normalize_build_plan_note(&plan.note);
    transaction.execute(
        "INSERT INTO character_build_plans(
            character_id, cavern_mode, cavern_set_a, cavern_set_b, planar_set_id,
            main_stats_json, effective_substats_json, note, updated_at, display_order, pinned,
            substat_weights_json, min_potential_pct, spd_target
         ) VALUES(
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
            COALESCE((SELECT MAX(display_order) + 1 FROM character_build_plans), 0), 0,
            ?10, ?11, ?12
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
            spd_target = excluded.spd_target",
        params![
            plan.character_id,
            plan.cavern_mode,
            plan.cavern_set_a,
            plan.cavern_set_b,
            plan.planar_set_id,
            serde_json::to_string(&plan.main_stats)
                .map_err(|error| AppError::Database(error.to_string()))?,
            serde_json::to_string(&plan.effective_substats)
                .map_err(|error| AppError::Database(error.to_string()))?,
            note,
            now_millis(),
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
            }
        ],
    )?;
    transaction.execute(
        "DELETE FROM character_build_targets WHERE character_id = ?1",
        [plan.character_id],
    )?;
    for target in &plan.targets {
        if target.minimum > target.target {
            return Err(AppError::Database("最低标准不能高于目标值".to_owned()));
        }
        transaction.execute("INSERT INTO character_build_targets(character_id,stat_key,target,priority,max_gap,minimum) VALUES(?1,?2,?3,?4,?5,?6)", params![plan.character_id, target.stat_key, target.target, target.priority, target.target - target.minimum, target.minimum])?;
    }
    Ok(())
}

fn apply_build_layouts(
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

fn normalize_existing_records(connection: &Connection) -> Result<(), AppError> {
    let relic_rows = {
        let mut statement = connection.prepare(
            "SELECT item_id, set_id, slot, main_stat, location, equipped_character_id FROM relics",
        )?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, u32>(0)?,
                    row.get::<_, u32>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<u32>>(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    for (id, set_id, slot, main_stat, location, existing_equipped_id) in relic_rows {
        let slot = normalize_slot(&slot);
        let main_stat = normalize_main_stat(slot, &main_stat);
        let equipped_id = resolve_equipped_character_id(&location, existing_equipped_id);
        let location = equipped_id
            .and_then(canonical_character_name)
            .unwrap_or(&location);
        connection.execute(
            "UPDATE relics SET name = COALESCE(?2, name), set_name = COALESCE(?2, set_name), slot = ?3, main_stat = ?4, location = ?5, equipped_character_id = ?6 WHERE item_id = ?1",
            params![id, canonical_relic_name(set_id), slot, main_stat, location, equipped_id],
        )?;
    }
    let cone_rows = {
        let mut statement = connection.prepare(
            "SELECT item_id, template_id, location, equipped_character_id FROM light_cones",
        )?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, u32>(0)?,
                    row.get::<_, u32>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<u32>>(3)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    for (id, template_id, location, existing_equipped_id) in cone_rows {
        let equipped_id = resolve_equipped_character_id(&location, existing_equipped_id);
        let location = equipped_id
            .and_then(canonical_character_name)
            .unwrap_or(&location);
        connection.execute(
            "UPDATE light_cones SET name = COALESCE(?2, name), location = ?3, equipped_character_id = ?4 WHERE item_id = ?1",
            params![id, canonical_light_cone_name(template_id), location, equipped_id],
        )?;
    }
    let character_rows = {
        let mut statement = connection.prepare("SELECT character_id FROM characters")?;
        let rows = statement
            .query_map([], |row| row.get::<_, u32>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    for id in character_rows {
        connection.execute(
            "UPDATE characters SET name = COALESCE(?2, name) WHERE character_id = ?1",
            params![id, canonical_character_name(id)],
        )?;
    }
    connection.execute("UPDATE relic_substats SET stat_key = CASE stat_key WHEN 'HP_' THEN 'HP%' WHEN 'ATK_' THEN 'ATK%' WHEN 'DEF_' THEN 'DEF%' WHEN 'CRIT Rate_' THEN 'CRIT Rate' WHEN 'CRIT Rate%' THEN 'CRIT Rate' WHEN 'CRIT DMG_' THEN 'CRIT DMG' WHEN 'CRIT DMG%' THEN 'CRIT DMG' WHEN 'Effect Hit Rate_' THEN 'Effect Hit Rate' WHEN 'Effect Hit Rate%' THEN 'Effect Hit Rate' WHEN 'Effect RES_' THEN 'Effect RES' WHEN 'Effect RES%' THEN 'Effect RES' WHEN 'Break Effect_' THEN 'Break Effect' WHEN 'Break Effect%' THEN 'Break Effect' ELSE stat_key END", [])?;
    Ok(())
}

#[derive(Debug, Clone)]
struct BuildCandidate {
    item_id: u32,
    name: String,
    slot: String,
    set_id: u32,
    main_stat: String,
    location: String,
    equipped_character_id: Option<u32>,
    stats: HashMap<String, f64>,
}

impl BuildCandidate {
    fn into_choice(self, character_id: u32, character_name: &str) -> BuildRelicChoice {
        let borrowed = match self.equipped_character_id {
            Some(owner_id) => owner_id != character_id,
            None => !self.location.is_empty() && self.location != character_name,
        };
        BuildRelicChoice {
            item_id: self.item_id,
            name: self.name,
            slot: self.slot,
            set_id: self.set_id,
            main_stat: self.main_stat,
            borrowed,
            location: self.location,
        }
    }
}

const BUILD_SLOTS: [&str; 6] = ["Head", "Hands", "Body", "Feet", "PlanarSphere", "LinkRope"];

fn load_build_relics(
    connection: &Connection,
    where_clause: &str,
    params: &[&dyn rusqlite::ToSql],
) -> Result<Vec<BuildCandidate>, AppError> {
    let mut statement = connection.prepare(&format!(
        "SELECT relics.item_id, relics.name, relics.slot, relics.set_id, relics.main_stat, \
             relics.main_stat_value, relics.location, relics.equipped_character_id, \
             relic_substats.stat_key, relic_substats.value \
             FROM relics \
             LEFT JOIN relic_substats ON relic_substats.relic_id = relics.item_id \
                 AND relic_substats.kind = 'normal' \
             WHERE {where_clause} \
             ORDER BY relics.item_id, relic_substats.position"
    ))?;
    let mut rows = statement.query(params)?;
    let mut items = Vec::new();
    while let Some(row) = rows.next()? {
        let item_id = row.get::<_, u32>(0)?;
        if items.last().map(|item: &BuildCandidate| item.item_id) != Some(item_id) {
            let main_stat = row.get::<_, String>(4)?;
            let main_stat_value = row.get::<_, f64>(5)?;
            let mut stats = HashMap::new();
            *stats.entry(main_stat.clone()).or_default() += main_stat_value;
            items.push(BuildCandidate {
                item_id,
                name: row.get(1)?,
                slot: row.get(2)?,
                set_id: row.get(3)?,
                main_stat,
                location: row.get(6)?,
                equipped_character_id: row.get(7)?,
                stats,
            });
        }
        if let (Some(key), Some(value)) = (
            row.get::<_, Option<String>>(8)?,
            row.get::<_, Option<f64>>(9)?,
        ) {
            if let Some(item) = items.last_mut() {
                *item.stats.entry(key).or_default() += value;
            }
        }
    }
    Ok(items)
}

fn load_equipped_build_relics(
    connection: &Connection,
    character_id: u32,
) -> Result<Vec<BuildCandidate>, AppError> {
    // Must key by character id — multi-path protagonists share one display name.
    load_build_relics(
        connection,
        "relics.equipped_character_id = ?1",
        &[&character_id],
    )
}

fn build_candidates(
    connection: &Connection,
    plan: &CharacterBuildPlan,
    include_equipped: bool,
) -> Result<Vec<BuildCandidate>, AppError> {
    let cavern_set_b = plan.cavern_set_b.unwrap_or_default();
    let is_two_plus_two = plan.cavern_mode == "twoPlusTwo";
    let items = load_build_relics(
        connection,
        "((relics.slot IN ('PlanarSphere', 'LinkRope') AND relics.set_id = ?1) \
          OR (relics.slot NOT IN ('PlanarSphere', 'LinkRope') AND relics.set_id = ?2) \
          OR (?3 = 1 AND relics.slot NOT IN ('PlanarSphere', 'LinkRope') AND relics.set_id = ?4)) \
         AND (?5 = 1 OR relics.location = '')",
        &[
            &plan.planar_set_id,
            &plan.cavern_set_a,
            &is_two_plus_two,
            &cavern_set_b,
            &include_equipped,
        ],
    )?;
    Ok(items
        .into_iter()
        .filter(|item| {
            // Head/Hands fixed mains: set-or-unset on the plan is equivalent.
            if let Some(fixed) = fixed_main_stat_for_slot(&item.slot) {
                return item.main_stat == fixed;
            }
            plan.main_stats
                .get(&item.slot)
                .map(|values| values.is_empty() || values.contains(&item.main_stat))
                .unwrap_or(false)
        })
        .collect())
}

fn progress_for(targets: &[BuildTarget], relics: &[BuildCandidate]) -> Vec<BuildProgress> {
    let mut totals = HashMap::<String, f64>::new();
    for relic in relics {
        for (key, value) in &relic.stats {
            *totals.entry(key.clone()).or_default() += value;
        }
    }
    let mut output = targets
        .iter()
        .map(|target| {
            let current = *totals.get(&target.stat_key).unwrap_or(&0.0);
            BuildProgress {
                stat_key: target.stat_key.clone(),
                current,
                target: target.target,
                gap: (target.target - current).max(0.0),
                minimum: target.minimum,
                priority: target.priority,
            }
        })
        .collect::<Vec<_>>();
    output.sort_by_key(|item| item.priority);
    output
}

fn choose_build(
    plan: &CharacterBuildPlan,
    candidates: Vec<BuildCandidate>,
    _character_id: u32,
) -> Option<Vec<BuildCandidate>> {
    let mut per_slot = BUILD_SLOTS
        .iter()
        .map(|slot| {
            candidates
                .iter()
                .filter(|item| item.slot == *slot)
                .cloned()
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    for (index, items) in per_slot.iter_mut().enumerate() {
        let sort_items = |items: &mut Vec<BuildCandidate>| {
            items.sort_by(|a, b| {
                individual_key(&plan.targets, a)
                    .partial_cmp(&individual_key(&plan.targets, b))
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
        };
        if plan.cavern_mode == "twoPlusTwo" && index < 4 {
            let slot_candidates = std::mem::take(items);
            let mut set_a = slot_candidates
                .iter()
                .filter(|item| item.set_id == plan.cavern_set_a)
                .cloned()
                .collect::<Vec<_>>();
            let mut set_b = slot_candidates
                .iter()
                .filter(|item| Some(item.set_id) == plan.cavern_set_b)
                .cloned()
                .collect::<Vec<_>>();
            sort_items(&mut set_a);
            sort_items(&mut set_b);
            set_a.truncate(4);
            set_b.truncate(4);
            *items = [set_a, set_b].concat();
        } else {
            sort_items(items);
            items.truncate(8);
        }
    }
    if per_slot.iter().any(Vec::is_empty) {
        return None;
    }
    let mut search = BuildSearch::new(&per_slot, plan);
    search.visit(0, &mut Vec::new(), &mut [0.0; 3]);
    search.best.map(|(_, items)| items)
}

struct BuildSearch<'a> {
    pools: &'a [Vec<BuildCandidate>],
    targets: Vec<&'a BuildTarget>,
    cavern_mode: &'a str,
    cavern_set_a: u32,
    cavern_set_b: Option<u32>,
    best: Option<([f64; 3], Vec<BuildCandidate>)>,
}

impl<'a> BuildSearch<'a> {
    fn new(pools: &'a [Vec<BuildCandidate>], plan: &'a CharacterBuildPlan) -> Self {
        let mut targets = plan.targets.iter().collect::<Vec<_>>();
        targets.sort_by_key(|target| target.priority);
        Self {
            pools,
            targets,
            cavern_mode: &plan.cavern_mode,
            cavern_set_a: plan.cavern_set_a,
            cavern_set_b: plan.cavern_set_b,
            best: None,
        }
    }

    fn visit(&mut self, index: usize, selected: &mut Vec<BuildCandidate>, totals: &mut [f64; 3]) {
        if index == self.pools.len() {
            self.consider(selected, totals);
            return;
        }
        let item_count = self.pools[index].len();
        for item_index in 0..item_count {
            let item = self.pools[index][item_index].clone();
            for (target_index, target) in self.targets.iter().enumerate() {
                totals[target_index] += item.stats.get(&target.stat_key).copied().unwrap_or(0.0);
            }
            selected.push(item.clone());
            self.visit(index + 1, selected, totals);
            selected.pop();
            for (target_index, target) in self.targets.iter().enumerate() {
                totals[target_index] -= item.stats.get(&target.stat_key).copied().unwrap_or(0.0);
            }
        }
    }

    fn consider(&mut self, selected: &[BuildCandidate], totals: &[f64; 3]) {
        if self.cavern_mode == "twoPlusTwo" {
            let a = selected[..4]
                .iter()
                .filter(|item| item.set_id == self.cavern_set_a)
                .count();
            let b = selected[..4]
                .iter()
                .filter(|item| Some(item.set_id) == self.cavern_set_b)
                .count();
            if a != 2 || b != 2 {
                return;
            }
        }
        let mut key = [0.0; 3];
        for (target_index, target) in self.targets.iter().enumerate() {
            if totals[target_index] < target.minimum {
                return;
            }
            key[target_index] = (target.target - totals[target_index]).max(0.0);
        }
        if self
            .best
            .as_ref()
            .map(|(old, _)| key[..self.targets.len()] < old[..self.targets.len()])
            .unwrap_or(true)
        {
            self.best = Some((key, selected.to_vec()));
        }
    }
}

fn individual_key(targets: &[BuildTarget], item: &BuildCandidate) -> f64 {
    targets
        .iter()
        .map(|target| {
            (target.target - item.stats.get(&target.stat_key).copied().unwrap_or(0.0)).max(0.0)
                * (1000.0 / (target.priority.max(1) as f64))
        })
        .sum()
}

/// Static relic-main-affix growth table. Values are the in-game internal values
/// displayed after rounding; they depend only on rarity, enhancement level and key.
fn main_stat_value(rarity: u32, level: u32, stat_key: &str) -> f64 {
    let (base, per_level) = match stat_key {
        "HP" => (112.896, 39.5136),
        "ATK" => (56.448, 19.7568),
        "HP%" | "ATK%" | "Effect Hit Rate" => (6.912, 2.4192),
        "DEF%" => (8.64, 3.024),
        "SPD" => {
            return match rarity {
                5 => 4.032 + level as f64 * 1.4,
                4 => 3.2256 + level as f64 * 1.1,
                3 => 2.4192 + level as f64,
                2 => 1.6128 + level as f64,
                _ => 0.0,
            }
        }
        "CRIT Rate" => (5.184, 1.8144),
        "CRIT DMG" | "Break Effect" => (10.368, 3.6288),
        "Outgoing Healing Boost" => (5.5296, 1.93536),
        "Energy Regeneration Rate" => (3.1104, 1.08864),
        "Physical DMG Boost"
        | "Fire DMG Boost"
        | "Ice DMG Boost"
        | "Lightning DMG Boost"
        | "Wind DMG Boost"
        | "Quantum DMG Boost"
        | "Imaginary DMG Boost" => (6.2208, 2.17728),
        _ => return 0.0,
    };
    let scale = match rarity {
        5 => 1.0,
        4 => 0.8,
        3 => 0.6,
        2 => 0.4,
        _ => return 0.0,
    };
    (base + per_level * level as f64) * scale
}

fn backfill_main_stat_values(connection: &Connection) -> Result<(), AppError> {
    let mut statement =
        connection.prepare("SELECT item_id, rarity, level, main_stat FROM relics")?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, u32>(0)?,
                row.get::<_, u32>(1)?,
                row.get::<_, u32>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for (item_id, rarity, level, stat_key) in rows {
        connection.execute(
            "UPDATE relics SET main_stat_value = ?1 WHERE item_id = ?2",
            params![main_stat_value(rarity, level, &stat_key), item_id],
        )?;
    }
    Ok(())
}

fn backfill_character_rarities(connection: &Connection) -> Result<(), AppError> {
    let mut statement = connection.prepare("SELECT character_id, name FROM characters")?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, u32>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for (character_id, name) in rows {
        if let Some(rarity) = character_rarity(&name) {
            connection.execute(
                "UPDATE characters SET rarity = ?1 WHERE character_id = ?2",
                params![rarity, character_id],
            )?;
        }
    }
    Ok(())
}

fn upsert_relic(
    transaction: &Transaction<'_>,
    relic: &ImportRelic,
    now: i64,
    run_id: i64,
) -> Result<(), AppError> {
    transaction.execute(
        r#"
        INSERT INTO relics(
            item_id, set_id, name, set_name, slot, rarity, level, main_stat, main_stat_value,
            location, equipped_character_id, locked, discard, source, updated_at, last_seen_run
        ) VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'network', ?13, ?14)
        ON CONFLICT(item_id) DO UPDATE SET
            set_id = excluded.set_id,
            name = excluded.name,
            set_name = excluded.set_name,
            slot = excluded.slot,
            rarity = excluded.rarity,
            level = excluded.level,
            main_stat = excluded.main_stat,
            main_stat_value = excluded.main_stat_value,
            location = excluded.location,
            equipped_character_id = excluded.equipped_character_id,
            locked = excluded.locked,
            discard = excluded.discard,
            source = excluded.source,
            updated_at = excluded.updated_at,
            last_seen_run = excluded.last_seen_run
        "#,
        params![
            relic._uid,
            relic.set_id,
            relic.name,
            relic.slot,
            relic.rarity,
            relic.level,
            relic.mainstat,
            main_stat_value(relic.rarity, relic.level, &relic.mainstat),
            relic.location,
            relic.equipped_character_id,
            relic.lock,
            relic.discard,
            now,
            run_id
        ],
    )?;
    transaction.execute(
        "DELETE FROM relic_substats WHERE relic_id = ?1",
        [relic._uid],
    )?;
    insert_substats(transaction, relic._uid, "normal", &relic.substats)?;
    if let Some(substats) = &relic.reroll_substats {
        insert_substats(transaction, relic._uid, "reroll", substats)?;
    }
    if let Some(substats) = &relic.preview_substats {
        insert_substats(transaction, relic._uid, "preview", substats)?;
    }
    Ok(())
}

fn insert_substats(
    transaction: &Transaction<'_>,
    relic_id: u32,
    kind: &str,
    substats: &[ImportSubstat],
) -> Result<(), AppError> {
    for (position, substat) in substats.iter().enumerate() {
        transaction.execute(
            "INSERT INTO relic_substats(relic_id, kind, position, stat_key, value, count, step)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                relic_id,
                kind,
                position as i64,
                substat.key,
                substat.value,
                substat.count,
                substat.step
            ],
        )?;
    }
    Ok(())
}

fn summary_from_connection(connection: &Connection) -> Result<InventorySummary, AppError> {
    let relics = connection.query_row("SELECT COUNT(*) FROM relics", [], |row| row.get(0))?;
    let light_cones =
        connection.query_row("SELECT COUNT(*) FROM light_cones", [], |row| row.get(0))?;
    let characters =
        connection.query_row("SELECT COUNT(*) FROM characters", [], |row| row.get(0))?;
    let teams = connection.query_row("SELECT COUNT(*) FROM teams", [], |row| row.get(0))?;
    let last_sync_at = connection
        .query_row(
            "SELECT MAX(finished_at) FROM import_runs WHERE status = 'complete'",
            [],
            |row| row.get(0),
        )
        .optional()?
        .flatten();
    Ok(InventorySummary {
        relics,
        light_cones,
        characters,
        teams,
        last_sync_at,
        protocol_version: PROTOCOL_VERSION.to_owned(),
    })
}

fn clear_all(transaction: &Transaction<'_>) -> Result<(), AppError> {
    transaction.execute("DELETE FROM relics", [])?;
    transaction.execute("DELETE FROM light_cones", [])?;
    transaction.execute("DELETE FROM characters", [])?;
    Ok(())
}

fn validate_page(page: &PageQuery) -> Result<(), AppError> {
    if page.page == 0 || page.page_size == 0 || page.page_size > 200 {
        Err(AppError::InvalidPage)
    } else {
        Ok(())
    }
}

fn clean_filter(value: &Option<String>) -> Option<String> {
    value
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn clean_filters(value: &Option<Vec<String>>) -> Option<Vec<String>> {
    value
        .as_ref()
        .map(|values| {
            values
                .iter()
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .filter(|values| !values.is_empty())
}

/// Inventory path codes (English) → Chinese labels used in the UI.
fn inventory_path_label(path: &str) -> &str {
    match path {
        "Destruction" => "毁灭",
        "Hunt" => "巡猎",
        "Erudition" => "智识",
        "Harmony" => "同谐",
        "Nihility" => "虚无",
        "Preservation" => "存护",
        "Abundance" => "丰饶",
        "Remembrance" => "记忆",
        "Elation" => "欢愉",
        other => other,
    }
}

fn character_matches_equipment_search(name: &str, path: &str, search: &str) -> bool {
    if name.contains(search) || path.contains(search) {
        return true;
    }
    let path_zh = inventory_path_label(path);
    if path_zh.contains(search) {
        return true;
    }
    // Multi-path display forms: 开拓者·同谐 / 三月七 巡猎
    let dotted = format!("{name}·{path_zh}");
    let spaced = format!("{name} {path_zh}");
    let compact = format!("{name}{path_zh}");
    dotted.contains(search) || spaced.contains(search) || compact.contains(search)
}

fn matching_equipped_character_ids(
    connection: &Connection,
    search: &str,
) -> Result<Vec<u32>, AppError> {
    let mut statement = connection.prepare("SELECT character_id, name, path FROM characters")?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, u32>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    let mut ids = Vec::new();
    for row in rows {
        let (id, name, path) = row?;
        if character_matches_equipment_search(&name, &path, search) {
            ids.push(id);
        }
    }
    Ok(ids)
}

/// Search item name fields plus equipped-owner name/path (including multi-path labels).
fn push_equipped_owner_search(
    connection: &Connection,
    clauses: &mut Vec<String>,
    values: &mut Vec<SqlValue>,
    search: &str,
    base_clause: &str,
    base_like_count: usize,
) -> Result<(), AppError> {
    let pattern = SqlValue::Text(format!("%{search}%"));
    let owner_ids = matching_equipped_character_ids(connection, search)?;
    if owner_ids.is_empty() {
        clauses.push(base_clause.to_owned());
        for _ in 0..base_like_count {
            values.push(pattern.clone());
        }
        return Ok(());
    }
    let placeholders = std::iter::repeat_n("?", owner_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    clauses.push(format!(
        "({base_clause} OR equipped_character_id IN ({placeholders}))"
    ));
    for _ in 0..base_like_count {
        values.push(pattern.clone());
    }
    values.extend(owner_ids.into_iter().map(|id| SqlValue::Integer(id as i64)));
    Ok(())
}

fn push_text_filters(
    clauses: &mut Vec<String>,
    values: &mut Vec<SqlValue>,
    column: &str,
    value: &Option<Vec<String>>,
) {
    if let Some(values_to_match) = clean_filters(value) {
        let placeholders = std::iter::repeat_n("?", values_to_match.len())
            .collect::<Vec<_>>()
            .join(", ");
        clauses.push(format!("{column} IN ({placeholders})"));
        values.extend(values_to_match.into_iter().map(SqlValue::Text));
    }
}

fn push_number_filters(
    clauses: &mut Vec<String>,
    values: &mut Vec<SqlValue>,
    column: &str,
    value: &Option<Vec<u32>>,
) {
    if let Some(values_to_match) = value.as_ref().filter(|values| !values.is_empty()) {
        let placeholders = std::iter::repeat_n("?", values_to_match.len())
            .collect::<Vec<_>>()
            .join(", ");
        clauses.push(format!("{column} IN ({placeholders})"));
        values.extend(
            values_to_match
                .iter()
                .copied()
                .map(|value| SqlValue::Integer(value as i64)),
        );
    }
}

fn push_number_filter(
    clauses: &mut Vec<String>,
    values: &mut Vec<SqlValue>,
    column: &str,
    operator: &str,
    value: Option<u32>,
) {
    if let Some(value) = value {
        clauses.push(format!("{column} {operator} ?"));
        values.push(SqlValue::Integer(value as i64));
    }
}

fn push_bool_filter(
    clauses: &mut Vec<String>,
    values: &mut Vec<SqlValue>,
    column: &str,
    value: Option<bool>,
) {
    if let Some(value) = value {
        clauses.push(format!("{column} = ?"));
        values.push(SqlValue::Integer(i64::from(value)));
    }
}

fn make_where(clauses: &[String]) -> String {
    if clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    }
}

fn query_count(
    connection: &Connection,
    table: &str,
    where_sql: &str,
    values: &[SqlValue],
) -> Result<u64, AppError> {
    let sql = format!("SELECT COUNT(*) FROM {table} {where_sql}");
    Ok(connection.query_row(&sql, params_from_iter(values.iter()), |row| row.get(0))?)
}

fn map_relic(row: &Row<'_>) -> rusqlite::Result<RelicListItem> {
    Ok(RelicListItem {
        item_id: row.get(0)?,
        set_id: row.get(1)?,
        name: row.get(2)?,
        set_name: row.get(3)?,
        slot: row.get(4)?,
        rarity: row.get(5)?,
        level: row.get(6)?,
        main_stat: row.get(7)?,
        main_stat_value: row.get(8)?,
        location: row.get(9)?,
        equipped_character_id: row.get(10)?,
        locked: row.get(11)?,
        discard: row.get(12)?,
        source: row.get(13)?,
        updated_at: row.get(14)?,
        substats: vec![],
    })
}

fn map_light_cone(row: &Row<'_>) -> rusqlite::Result<LightConeListItem> {
    Ok(LightConeListItem {
        item_id: row.get(0)?,
        template_id: row.get(1)?,
        name: row.get(2)?,
        level: row.get(3)?,
        ascension: row.get(4)?,
        superimposition: row.get(5)?,
        location: row.get(6)?,
        equipped_character_id: row.get(7)?,
        locked: row.get(8)?,
        source: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn map_character(row: &Row<'_>) -> rusqlite::Result<CharacterListItem> {
    Ok(CharacterListItem {
        character_id: row.get(0)?,
        name: row.get(1)?,
        path: row.get(2)?,
        level: row.get(3)?,
        ascension: row.get(4)?,
        eidolon: row.get(5)?,
        has_build_plan: row.get(6)?,
        ability_version: row.get(7)?,
        source: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn relic_detail(connection: &Connection, id: u32) -> Result<Option<Value>, AppError> {
    let relic = connection
        .query_row(
            "SELECT item_id, set_id, name, set_name, slot, rarity, level, main_stat, main_stat_value,
                    location, equipped_character_id, locked, discard, source, updated_at
             FROM relics WHERE item_id = ?1",
            [id],
            map_relic,
        )
        .optional()?;
    let Some(relic) = relic else {
        return Ok(None);
    };
    let mut statement = connection.prepare(
        "SELECT kind, position, stat_key, value, count, step
         FROM relic_substats WHERE relic_id = ?1 ORDER BY kind, position",
    )?;
    let substats = statement
        .query_map([id], |row| {
            Ok(json!({
                "kind": row.get::<_, String>(0)?,
                "position": row.get::<_, u32>(1)?,
                "key": row.get::<_, String>(2)?,
                "value": row.get::<_, f64>(3)?,
                "count": row.get::<_, u32>(4)?,
                "step": row.get::<_, u32>(5)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut value =
        serde_json::to_value(relic).map_err(|error| AppError::Database(error.to_string()))?;
    value["substats"] = Value::Array(substats);
    Ok(Some(value))
}

fn light_cone_detail(connection: &Connection, id: u32) -> Result<Option<Value>, AppError> {
    let item = connection
        .query_row(
            "SELECT item_id, template_id, name, level, ascension, superimposition,
                    location, equipped_character_id, locked, source, updated_at
             FROM light_cones WHERE item_id = ?1",
            [id],
            map_light_cone,
        )
        .optional()?;
    item.map(|item| {
        serde_json::to_value(item).map_err(|error| AppError::Database(error.to_string()))
    })
    .transpose()
}

fn character_detail(connection: &Connection, id: u32) -> Result<Option<Value>, AppError> {
    let detail = connection
        .query_row(
            "SELECT character_id, name, path, level, ascension, eidolon,
                    skills_json, traces_json, memosprite_json, ability_version,
                    source, updated_at
             FROM characters WHERE character_id = ?1",
            [id],
            |row| {
                let skills: String = row.get(6)?;
                let traces: String = row.get(7)?;
                let memosprite: Option<String> = row.get(8)?;
                Ok(json!({
                    "characterId": row.get::<_, u32>(0)?,
                    "name": row.get::<_, String>(1)?,
                    "path": row.get::<_, String>(2)?,
                    "level": row.get::<_, u32>(3)?,
                    "ascension": row.get::<_, u32>(4)?,
                    "eidolon": row.get::<_, u32>(5)?,
                    "skills": serde_json::from_str::<Value>(&skills).unwrap_or(Value::Null),
                    "traces": serde_json::from_str::<Value>(&traces).unwrap_or(Value::Null),
                    "memosprite": memosprite
                        .and_then(|value| serde_json::from_str::<Value>(&value).ok()),
                    "abilityVersion": row.get::<_, u32>(9)?,
                    "source": row.get::<_, String>(10)?,
                    "updatedAt": row.get::<_, i64>(11)?,
                }))
            },
        )
        .optional()
        .map_err(AppError::from)?;
    let Some(mut detail) = detail else {
        return Ok(None);
    };

    let relic_ids = connection
        .prepare("SELECT item_id FROM relics WHERE equipped_character_id = ?1 ORDER BY slot")?
        .query_map([id], |row| row.get::<_, u32>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    let equipped_relics = relic_ids
        .into_iter()
        .map(|item_id| relic_detail(connection, item_id))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .flatten()
        .collect();
    let light_cone_id = connection
        .query_row(
            "SELECT item_id FROM light_cones WHERE equipped_character_id = ?1 LIMIT 1",
            [id],
            |row| row.get::<_, u32>(0),
        )
        .optional()?;
    detail["equippedRelics"] = Value::Array(equipped_relics);
    detail["equippedLightCone"] = light_cone_id
        .map(|item_id| light_cone_detail(connection, item_id))
        .transpose()?
        .flatten()
        .unwrap_or(Value::Null);
    Ok(Some(detail))
}

/// Export location uses the equipped character id when known.
///
/// Multi-path protagonists (开拓者 / 三月七) share one display name across several ids.
/// Re-importing a Chinese display name cannot recover which path owned the gear, so the
/// exchange format must carry the authoritative numeric id (same as the game exporter).
fn export_equipped_location(location: &str, equipped_character_id: Option<u32>) -> String {
    match equipped_character_id {
        Some(id) => id.to_string(),
        None => location.to_owned(),
    }
}

fn export_relics(connection: &Connection) -> Result<Vec<Value>, AppError> {
    let mut statement = connection.prepare(
        "SELECT item_id, set_id, name, slot, rarity, level, main_stat,
                location, equipped_character_id, locked, discard FROM relics ORDER BY item_id",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, u32>(0)?,
            row.get::<_, u32>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, u32>(4)?,
            row.get::<_, u32>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, Option<u32>>(8)?,
            row.get::<_, bool>(9)?,
            row.get::<_, bool>(10)?,
        ))
    })?;
    let mut result = Vec::new();
    for row in rows {
        let (id, set_id, name, slot, rarity, level, mainstat, location, equipped_id, lock, discard) =
            row?;
        let substats = export_substats(connection, id, "normal")?;
        let reroll_substats = export_substats(connection, id, "reroll")?;
        let preview_substats = export_substats(connection, id, "preview")?;
        result.push(json!({
            "set_id": set_id,
            "name": name,
            "slot": slot,
            "rarity": rarity,
            "level": level,
            "mainstat": mainstat,
            "substats": substats,
            "reroll_substats": reroll_substats,
            "preview_substats": preview_substats,
            "location": export_equipped_location(&location, equipped_id),
            "lock": lock,
            "discard": discard,
            "_uid": id.to_string(),
        }));
    }
    Ok(result)
}

fn export_substats(
    connection: &Connection,
    relic_id: u32,
    kind: &str,
) -> Result<Vec<Value>, AppError> {
    let mut statement = connection.prepare(
        "SELECT stat_key, value, count, step FROM relic_substats
         WHERE relic_id = ?1 AND kind = ?2 ORDER BY position",
    )?;
    let values = statement
        .query_map(params![relic_id, kind], |row| {
            Ok(json!({
                "key": row.get::<_, String>(0)?,
                "value": row.get::<_, f64>(1)?,
                "count": row.get::<_, u32>(2)?,
                "step": row.get::<_, u32>(3)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(values)
}

fn export_light_cones(connection: &Connection) -> Result<Vec<Value>, AppError> {
    let mut statement = connection.prepare(
        "SELECT item_id, template_id, name, level, ascension, superimposition,
                location, equipped_character_id, locked FROM light_cones ORDER BY item_id",
    )?;
    let values = statement
        .query_map([], |row| {
            let location: String = row.get(6)?;
            let equipped_id: Option<u32> = row.get(7)?;
            Ok(json!({
                "_uid": row.get::<_, u32>(0)?.to_string(),
                "id": row.get::<_, u32>(1)?.to_string(),
                "name": row.get::<_, String>(2)?,
                "level": row.get::<_, u32>(3)?,
                "ascension": row.get::<_, u32>(4)?,
                "superimposition": row.get::<_, u32>(5)?,
                "location": export_equipped_location(&location, equipped_id),
                "lock": row.get::<_, bool>(8)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(values)
}

fn export_characters(connection: &Connection) -> Result<Vec<Value>, AppError> {
    let mut statement = connection.prepare(
        "SELECT character_id, name, path, level, ascension, eidolon,
                skills_json, traces_json, memosprite_json, ability_version
         FROM characters ORDER BY character_id",
    )?;
    let values = statement
        .query_map([], |row| {
            let skills: String = row.get(6)?;
            let traces: String = row.get(7)?;
            let memosprite: Option<String> = row.get(8)?;
            Ok(json!({
                "id": row.get::<_, u32>(0)?.to_string(),
                "name": row.get::<_, String>(1)?,
                "path": row.get::<_, String>(2)?,
                "level": row.get::<_, u32>(3)?,
                "ascension": row.get::<_, u32>(4)?,
                "eidolon": row.get::<_, u32>(5)?,
                "skills": serde_json::from_str::<Value>(&skills).unwrap_or(Value::Null),
                "traces": serde_json::from_str::<Value>(&traces).unwrap_or(Value::Null),
                "memosprite": memosprite
                    .and_then(|value| serde_json::from_str::<Value>(&value).ok()),
                "ability_version": row.get::<_, u32>(9)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(values)
}

struct TeamRow {
    team_id: u32,
    name: String,
    note: String,
    slots: [Option<u32>; TEAM_SLOT_COUNT],
    created_at: i64,
    updated_at: i64,
}

fn team_row_from_sqlite(row: &Row<'_>) -> rusqlite::Result<TeamRow> {
    Ok(TeamRow {
        team_id: row.get(0)?,
        name: row.get(1)?,
        note: row.get(2)?,
        slots: [row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?],
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn normalize_team_slots(
    character_ids: &[Option<u32>],
) -> Result<[Option<u32>; TEAM_SLOT_COUNT], AppError> {
    let mut slots = [None; TEAM_SLOT_COUNT];
    let mut seen = HashSet::new();
    for (index, id) in character_ids.iter().enumerate().take(TEAM_SLOT_COUNT) {
        if let Some(character_id) = id {
            if !seen.insert(*character_id) {
                return Err(AppError::Database(
                    "同一配队内不能重复选择同一角色".to_owned(),
                ));
            }
            slots[index] = Some(*character_id);
        }
    }
    Ok(slots)
}

fn clear_character_build_scores(transaction: &Transaction<'_>) -> Result<(), AppError> {
    transaction.execute("DELETE FROM character_build_scores", [])?;
    Ok(())
}

fn load_character_build_score(
    connection: &Connection,
    character_id: u32,
) -> Result<Option<CharacterBuildScore>, AppError> {
    connection
        .query_row(
            "SELECT character_id, letter_grade, potential_pct, completion_pct,
                    relic_count, has_plan, computed_at
             FROM character_build_scores WHERE character_id = ?1",
            [character_id],
            |row| {
                Ok(CharacterBuildScore {
                    character_id: row.get(0)?,
                    letter_grade: row.get(1)?,
                    potential_pct: row.get(2)?,
                    completion_pct: row.get(3)?,
                    relic_count: row.get(4)?,
                    has_plan: row.get(5)?,
                    computed_at: row.get(6)?,
                })
            },
        )
        .optional()
        .map_err(AppError::from)
}

fn hydrate_team(connection: &Connection, row: TeamRow) -> Result<Team, AppError> {
    let mut members = Vec::with_capacity(TEAM_SLOT_COUNT);
    for slot in row.slots {
        members.push(match slot {
            None => None,
            Some(character_id) => {
                let score = load_character_build_score(connection, character_id)?;
                let owned = connection
                    .query_row(
                        "SELECT name, path, level FROM characters WHERE character_id = ?1",
                        [character_id],
                        |character_row| {
                            Ok(TeamMember {
                                character_id,
                                name: character_row.get(0)?,
                                path: character_row.get(1)?,
                                level: character_row.get(2)?,
                                owned: true,
                                score: score.clone(),
                            })
                        },
                    )
                    .optional()?;
                Some(owned.unwrap_or(TeamMember {
                    character_id,
                    name: format!("未知角色 #{character_id}"),
                    path: String::new(),
                    level: 0,
                    owned: false,
                    score: None,
                }))
            }
        });
    }
    Ok(Team {
        team_id: row.team_id,
        name: row.name,
        note: row.note,
        members,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

fn list_team_sync_records(connection: &Connection) -> Result<Vec<TeamSyncRecord>, AppError> {
    let mut statement = connection.prepare(
        "SELECT team_id, name, note, slot0, slot1, slot2, slot3, created_at, updated_at
         FROM teams
         ORDER BY team_id ASC",
    )?;
    let rows = statement.query_map([], team_row_from_sqlite)?;
    let mut teams = Vec::new();
    for row in rows {
        let raw = row?;
        teams.push(TeamSyncRecord {
            team_id: raw.team_id,
            name: raw.name,
            note: raw.note,
            character_ids: raw.slots.into_iter().collect(),
            created_at: raw.created_at,
            updated_at: raw.updated_at,
        });
    }
    Ok(teams)
}

/// Replace all teams from a WebDAV snapshot. Empty input leaves the table empty after wipe.
fn replace_teams_in_transaction(
    transaction: &Transaction<'_>,
    teams: &[TeamSyncRecord],
) -> Result<(), AppError> {
    for team in teams {
        let name = normalize_team_name(&team.name);
        if name.is_empty() {
            return Err(AppError::Database("同步配队名称不能为空".to_owned()));
        }
        if team.character_ids.len() != TEAM_SLOT_COUNT {
            return Err(AppError::Database(
                "同步配队必须包含 4 个角色槽位".to_owned(),
            ));
        }
        // Sync restores planning data as-is; missing characters surface as orphan slots in UI.
        let slots = normalize_team_slots(&team.character_ids)?;
        let note = normalize_team_note(&team.note);
        transaction.execute(
            "INSERT INTO teams(
                team_id, name, note, slot0, slot1, slot2, slot3, created_at, updated_at
             ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                team.team_id,
                name,
                note,
                slots[0],
                slots[1],
                slots[2],
                slots[3],
                team.created_at,
                team.updated_at
            ],
        )?;
    }
    Ok(())
}

fn table_for_kind(kind: InventoryKind) -> &'static str {
    match kind {
        InventoryKind::Relic => "relics",
        InventoryKind::LightCone => "light_cones",
        InventoryKind::Character => "characters",
    }
}

fn id_column_for_kind(kind: InventoryKind) -> &'static str {
    match kind {
        InventoryKind::Relic | InventoryKind::LightCone => "item_id",
        InventoryKind::Character => "character_id",
    }
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
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
            eidolon: 0,
            skills: json!({}),
            traces: json!({}),
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
                "traces": {},
                "ability_version": 1
            }]
        }))
        .unwrap();
        assert_eq!(payload.relics[0]._uid, 90001);
        assert_eq!(payload.light_cones[0].id, 20001);
        assert_eq!(payload.characters[0].id, 1001);
    }

    #[test]
    fn real_export_is_normalized_before_sqlite_filters() {
        let store = InventoryStore::test_store();
        let mut snapshot: InventoryImport =
            serde_json::from_str(include_str!("../../../examples/starrail-inventory.json"))
                .unwrap();
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
    fn two_plus_two_optimizer_never_returns_four_plus_zero() {
        let plan = CharacterBuildPlan {
            character_id: 1,
            cavern_mode: "twoPlusTwo".to_owned(),
            cavern_set_a: 10,
            cavern_set_b: Some(11),
            planar_set_id: 20,
            main_stats: HashMap::new(),
            targets: vec![BuildTarget {
                stat_key: "SPD".to_owned(),
                target: 0.0,
                priority: 1,
                minimum: 0.0,
            }],
            effective_substats: vec![],
            note: String::new(),
            substat_weights: HashMap::new(),
            min_potential_pct: 40.0,
            spd_target: 0.0,
        };
        let mut candidates = Vec::new();
        for (index, slot) in BUILD_SLOTS.iter().enumerate() {
            let sets: Vec<u32> = if index < 4 { vec![10, 11] } else { vec![20] };
            for set_id in sets {
                candidates.push(BuildCandidate {
                    item_id: candidates.len() as u32 + 1,
                    name: "测试遗器".to_owned(),
                    slot: (*slot).to_owned(),
                    set_id,
                    main_stat: "SPD".to_owned(),
                    location: String::new(),
                    equipped_character_id: None,
                    stats: HashMap::new(),
                });
            }
        }
        let selected = choose_build(&plan, candidates, 1).unwrap();
        assert_eq!(
            selected[..4]
                .iter()
                .filter(|item| item.set_id == 10)
                .count(),
            2
        );
        assert_eq!(
            selected[..4]
                .iter()
                .filter(|item| item.set_id == 11)
                .count(),
            2
        );
        assert!(selected[4..].iter().all(|item| item.set_id == 20));
    }

    #[test]
    fn optimizer_handles_the_full_eight_candidates_per_slot() {
        let plan = CharacterBuildPlan {
            character_id: 1,
            cavern_mode: "fourPiece".to_owned(),
            cavern_set_a: 10,
            cavern_set_b: None,
            planar_set_id: 20,
            main_stats: HashMap::new(),
            targets: vec![
                BuildTarget {
                    stat_key: "Break Effect".to_owned(),
                    target: 48.0,
                    priority: 1,
                    minimum: 0.0,
                },
                BuildTarget {
                    stat_key: "SPD".to_owned(),
                    target: 42.0,
                    priority: 2,
                    minimum: 0.0,
                },
            ],
            effective_substats: vec![],
            note: String::new(),
            substat_weights: HashMap::new(),
            min_potential_pct: 40.0,
            spd_target: 0.0,
        };
        let mut candidates = Vec::new();
        for (slot_index, slot) in BUILD_SLOTS.iter().enumerate() {
            for rank in 0..8 {
                candidates.push(BuildCandidate {
                    item_id: candidates.len() as u32 + 1,
                    name: "测试遗器".to_owned(),
                    slot: (*slot).to_owned(),
                    set_id: if slot_index < 4 { 10 } else { 20 },
                    main_stat: "HP".to_owned(),
                    location: String::new(),
                    equipped_character_id: None,
                    stats: HashMap::from([
                        ("Break Effect".to_owned(), rank as f64),
                        ("SPD".to_owned(), (7 - rank) as f64),
                    ]),
                });
            }
        }
        let selected = choose_build(&plan, candidates, 1).unwrap();
        let progress = progress_for(&plan.targets, &selected);
        assert_eq!(progress[0].current, 42.0);
        assert_eq!(progress[1].current, 0.0);
    }

    #[test]
    fn candidate_query_reads_only_matching_sets_and_equipment_state() {
        let store = InventoryStore::test_store();
        let connection = store.connect().unwrap();
        for (item_id, set_id, slot, location) in [
            (1, 10, "Head", ""),
            (2, 10, "Head", "其他角色"),
            (3, 99, "Head", ""),
            (4, 20, "LinkRope", ""),
        ] {
            connection
                .execute(
                    "INSERT INTO relics(item_id, set_id, name, set_name, slot, rarity, level, main_stat, main_stat_value, location, locked, discard, source, updated_at) VALUES(?1, ?2, '测试遗器', '测试套装', ?3, 5, 15, 'HP', 100, ?4, 0, 0, 'test', 0)",
                    params![item_id, set_id, slot, location],
                )
                .unwrap();
        }
        connection
            .execute(
                "INSERT INTO relic_substats(relic_id, kind, position, stat_key, value, count, step) VALUES(1, 'normal', 0, 'SPD', 5, 1, 0)",
                [],
            )
            .unwrap();
        let plan = CharacterBuildPlan {
            character_id: 1,
            cavern_mode: "fourPiece".to_owned(),
            cavern_set_a: 10,
            cavern_set_b: None,
            planar_set_id: 20,
            main_stats: HashMap::from([
                ("Head".to_owned(), vec![]),
                ("LinkRope".to_owned(), vec![]),
            ]),
            targets: vec![BuildTarget {
                stat_key: "SPD".to_owned(),
                target: 0.0,
                priority: 1,
                minimum: 0.0,
            }],
            effective_substats: vec![],
            note: String::new(),
            substat_weights: HashMap::new(),
            min_potential_pct: 40.0,
            spd_target: 0.0,
        };

        let unequipped = build_candidates(&connection, &plan, false).unwrap();
        assert_eq!(
            unequipped
                .iter()
                .map(|item| item.item_id)
                .collect::<Vec<_>>(),
            vec![1, 4]
        );
        assert_eq!(unequipped[0].stats["HP"], 100.0);
        assert_eq!(unequipped[0].stats["SPD"], 5.0);

        let including_equipped = build_candidates(&connection, &plan, true).unwrap();
        assert_eq!(
            including_equipped
                .iter()
                .map(|item| item.item_id)
                .collect::<Vec<_>>(),
            vec![1, 2, 4]
        );
    }

    #[test]
    fn calculates_fixed_main_stat_growth_from_rarity_and_level() {
        assert!((main_stat_value(5, 15, "SPD") - 25.032).abs() < 0.001);
        assert!((main_stat_value(5, 15, "HP") - 705.6).abs() < 0.001);
        assert!((main_stat_value(5, 15, "CRIT Rate") - 32.4).abs() < 0.001);
        assert!((main_stat_value(4, 12, "SPD") - 16.4256).abs() < 0.001);
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
}
