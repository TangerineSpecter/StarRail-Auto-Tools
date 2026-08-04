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
    location_id, normalize_import, normalize_main_stat, normalize_slot,
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

            CREATE INDEX IF NOT EXISTS idx_relics_set_slot ON relics(set_id, slot);
            CREATE INDEX IF NOT EXISTS idx_relics_rarity_level ON relics(rarity, level);
            CREATE INDEX IF NOT EXISTS idx_relics_main_stat ON relics(main_stat);
            CREATE INDEX IF NOT EXISTS idx_relics_location ON relics(location);
            CREATE INDEX IF NOT EXISTS idx_relic_substats_key_value ON relic_substats(stat_key, value);
            CREATE INDEX IF NOT EXISTS idx_light_cones_level ON light_cones(level, ascension);
            CREATE INDEX IF NOT EXISTS idx_light_cones_location ON light_cones(location);
            CREATE INDEX IF NOT EXISTS idx_characters_path_level ON characters(path, level);
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
            "SELECT cavern_mode, cavern_set_a, cavern_set_b, planar_set_id, main_stats_json, effective_substats_json FROM character_build_plans WHERE character_id = ?1",
            [character_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?, row.get::<_, Option<u32>>(2)?, row.get::<_, u32>(3)?, row.get::<_, String>(4)?, row.get::<_, String>(5)?))
        ).optional()?;
        let Some((
            cavern_mode,
            cavern_set_a,
            cavern_set_b,
            planar_set_id,
            main_stats_json,
            effective_substats_json,
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
        transaction.commit()?;
        Ok(())
    }

    pub fn delete_build_plan(&self, character_id: u32) -> Result<(), AppError> {
        self.connect()?.execute(
            "DELETE FROM character_build_plans WHERE character_id = ?1",
            [character_id],
        )?;
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
        let current = load_equipped_build_relics(&connection, &character_name)?;
        let current_progress = progress_for(&plan.targets, &current);
        let candidates = build_candidates(&connection, &plan, request.include_equipped)?;
        let recommended = choose_build(&plan, candidates, &character_name);
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
                    .map(|item| item.into_choice(&character_name))
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

        self.apply_snapshot(import, false, false, &[], &[]).map(Ok)
    }

    pub fn replace_account_and_apply(
        &self,
        import: &InventoryImport,
    ) -> Result<InventorySummary, AppError> {
        self.apply_snapshot(import, true, false, &[], &[])
    }

    fn apply_snapshot(
        &self,
        import: &InventoryImport,
        clear_first: bool,
        reset_sync_state: bool,
        build_plans: &[CharacterBuildPlan],
        build_layouts: &[BuildDashboardLayout],
    ) -> Result<InventorySummary, AppError> {
        let now = now_millis();
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;

        if clear_first {
            clear_all(&transaction)?;
            if reset_sync_state {
                transaction.execute("DELETE FROM character_build_plans", [])?;
                transaction.execute(
                    "DELETE FROM app_state WHERE key IN ('current_uid', 'trailblazer')",
                    [],
                )?;
            }
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
            clauses.push("(name LIKE ? OR set_name LIKE ?)".to_owned());
            let value = SqlValue::Text(format!("%{search}%"));
            values.push(value.clone());
            values.push(value);
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

    pub fn list_light_cones(
        &self,
        filter: &LightConeFilter,
    ) -> Result<PagedResult<LightConeListItem>, AppError> {
        validate_page(&filter.page)?;
        let connection = self.connect()?;
        let mut clauses = Vec::new();
        let mut values = Vec::new();
        if let Some(search) = clean_filter(&filter.search) {
            clauses.push("name LIKE ?".to_owned());
            values.push(SqlValue::Text(format!("%{search}%")));
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
        transaction.commit()?;
        Ok(deleted as u64)
    }

    pub fn clear(&self, kind: Option<InventoryKind>) -> Result<(), AppError> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        if let Some(kind) = kind {
            transaction.execute(&format!("DELETE FROM {}", table_for_kind(kind)), [])?;
        } else {
            clear_all(&transaction)?;
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
        Ok(SyncSnapshot {
            format_version: SYNC_FORMAT_VERSION,
            generated_at: now_millis(),
            source: "starrail-auto-tools".to_owned(),
            inventory,
            build_plans,
            build_layouts,
        })
    }

    pub fn replace_with_sync_snapshot(
        &self,
        mut snapshot: SyncSnapshot,
    ) -> Result<InventorySummary, AppError> {
        if !supports_sync_format_version(snapshot.format_version) {
            return Err(AppError::WebDav(format!(
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
    transaction.execute(
        "INSERT INTO character_build_plans(
            character_id, cavern_mode, cavern_set_a, cavern_set_b, planar_set_id,
            main_stats_json, effective_substats_json, updated_at, display_order, pinned
         ) VALUES(
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
            COALESCE((SELECT MAX(display_order) + 1 FROM character_build_plans), 0), 0
         )
         ON CONFLICT(character_id) DO UPDATE SET
            cavern_mode = excluded.cavern_mode,
            cavern_set_a = excluded.cavern_set_a,
            cavern_set_b = excluded.cavern_set_b,
            planar_set_id = excluded.planar_set_id,
            main_stats_json = excluded.main_stats_json,
            effective_substats_json = excluded.effective_substats_json,
            updated_at = excluded.updated_at",
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
            now_millis()
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
        let mut statement =
            connection.prepare("SELECT item_id, set_id, slot, main_stat, location FROM relics")?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, u32>(0)?,
                    row.get::<_, u32>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    for (id, set_id, slot, main_stat, location) in relic_rows {
        let slot = normalize_slot(&slot);
        let main_stat = normalize_main_stat(slot, &main_stat);
        let location_id = location_id(&location);
        let location = location_id
            .and_then(canonical_character_name)
            .unwrap_or(&location);
        connection.execute(
            "UPDATE relics SET name = COALESCE(?2, name), set_name = COALESCE(?2, set_name), slot = ?3, main_stat = ?4, location = ?5, equipped_character_id = ?6 WHERE item_id = ?1",
            params![id, canonical_relic_name(set_id), slot, main_stat, location, location_id],
        )?;
    }
    let cone_rows = {
        let mut statement =
            connection.prepare("SELECT item_id, template_id, location FROM light_cones")?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, u32>(0)?,
                    row.get::<_, u32>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    for (id, template_id, location) in cone_rows {
        let location_id = location_id(&location);
        let location = location_id
            .and_then(canonical_character_name)
            .unwrap_or(&location);
        connection.execute(
            "UPDATE light_cones SET name = COALESCE(?2, name), location = ?3, equipped_character_id = ?4 WHERE item_id = ?1",
            params![id, canonical_light_cone_name(template_id), location, location_id],
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
    stats: HashMap<String, f64>,
}

impl BuildCandidate {
    fn into_choice(self, character_name: &str) -> BuildRelicChoice {
        BuildRelicChoice {
            item_id: self.item_id,
            name: self.name,
            slot: self.slot,
            set_id: self.set_id,
            main_stat: self.main_stat,
            borrowed: !self.location.is_empty() && self.location != character_name,
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
    let mut statement = connection.prepare(
        &format!(
            "SELECT relics.item_id, relics.name, relics.slot, relics.set_id, relics.main_stat, \
             relics.main_stat_value, relics.location, relic_substats.stat_key, relic_substats.value \
             FROM relics \
             LEFT JOIN relic_substats ON relic_substats.relic_id = relics.item_id \
                 AND relic_substats.kind = 'normal' \
             WHERE {where_clause} \
             ORDER BY relics.item_id, relic_substats.position"
        ),
    )?;
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
                stats,
            });
        }
        if let (Some(key), Some(value)) = (
            row.get::<_, Option<String>>(7)?,
            row.get::<_, Option<f64>>(8)?,
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
    character_name: &str,
) -> Result<Vec<BuildCandidate>, AppError> {
    load_build_relics(connection, "relics.location = ?1", &[&character_name])
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
    character_name: &str,
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
    let _ = character_name;
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

fn export_relics(connection: &Connection) -> Result<Vec<Value>, AppError> {
    let mut statement = connection.prepare(
        "SELECT item_id, set_id, name, slot, rarity, level, main_stat,
                location, locked, discard FROM relics ORDER BY item_id",
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
            row.get::<_, bool>(8)?,
            row.get::<_, bool>(9)?,
        ))
    })?;
    let mut result = Vec::new();
    for row in rows {
        let (id, set_id, name, slot, rarity, level, mainstat, location, lock, discard) = row?;
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
            "location": location,
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
                location, locked FROM light_cones ORDER BY item_id",
    )?;
    let values = statement
        .query_map([], |row| {
            Ok(json!({
                "_uid": row.get::<_, u32>(0)?.to_string(),
                "id": row.get::<_, u32>(1)?.to_string(),
                "name": row.get::<_, String>(2)?,
                "level": row.get::<_, u32>(3)?,
                "ascension": row.get::<_, u32>(4)?,
                "superimposition": row.get::<_, u32>(5)?,
                "location": row.get::<_, String>(6)?,
                "lock": row.get::<_, bool>(7)?,
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
    }

    #[test]
    fn relic_main_stat_scan_returns_unconfigured_slots_and_paginates() {
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
            main_stats: HashMap::new(),
            targets: vec![BuildTarget {
                stat_key: "SPD".to_owned(),
                target: 160.0,
                priority: 1,
                minimum: 140.0,
            }],
            effective_substats: vec![],
        };
        store.save_build_plan(&plan).unwrap();

        let first_page = store
            .scan_relics_by_main_stat(&PageQuery {
                page: 1,
                page_size: 1,
            })
            .unwrap();
        assert_eq!(first_page.total, 2);
        assert_eq!(first_page.items.len(), 1);
        assert!(!first_page.allowed_main_stats.contains_key("Head"));
        let second_page = store
            .scan_relics_by_main_stat(&PageQuery {
                page: 2,
                page_size: 1,
            })
            .unwrap();
        assert_eq!(second_page.items.len(), 1);
        assert_ne!(first_page.items[0].item_id, second_page.items[0].item_id);
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
        };
        store.save_build_plan(&plan).unwrap();
        store.clear(None).unwrap();
        assert_eq!(
            store.build_plan(1001).unwrap().unwrap().targets[0].target,
            180.0
        );
        assert_eq!(
            store.build_plan(1001).unwrap().unwrap().effective_substats,
            vec!["SPD".to_owned(), "CRIT Rate".to_owned()]
        );
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
                    stats: HashMap::new(),
                });
            }
        }
        let selected = choose_build(&plan, candidates, "测试角色").unwrap();
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
                    stats: HashMap::from([
                        ("Break Effect".to_owned(), rank as f64),
                        ("SPD".to_owned(), (7 - rank) as f64),
                    ]),
                });
            }
        }
        let selected = choose_build(&plan, candidates, "测试角色").unwrap();
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
}
