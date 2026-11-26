use rusqlite::{params, Connection};

use super::super::models::{InventoryStore, SCHEMA_VERSION};
use super::super::{
    canonical_character_name, canonical_light_cone_name, canonical_relic_name, character_rarity,
    normalize_main_stat, normalize_slot, resolve_equipped_character_id,
};
use super::optimizer::main_stat_value;
use crate::error::AppError;

impl InventoryStore {
    pub(super) fn migrate(&self, connection: &Connection) -> Result<(), AppError> {
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
                substat_weights_json TEXT NOT NULL DEFAULT '{}',
                min_potential_pct REAL NOT NULL DEFAULT 40,
                spd_target REAL NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0,
                pinned INTEGER NOT NULL DEFAULT 0,
                game_version TEXT NOT NULL DEFAULT ''
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

            CREATE TABLE IF NOT EXISTS cleanup_queue (
                item_id INTEGER PRIMARY KEY,
                uid INTEGER NOT NULL DEFAULT 0,
                fingerprint_json TEXT NOT NULL,
                display_name TEXT NOT NULL,
                status TEXT NOT NULL,
                last_run_id INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS cleanup_runs (
                run_id INTEGER PRIMARY KEY AUTOINCREMENT,
                status TEXT NOT NULL,
                uid INTEGER NOT NULL,
                inventory_hash TEXT NOT NULL,
                model_revision TEXT NOT NULL,
                template_revision TEXT NOT NULL,
                protocol_version TEXT NOT NULL,
                directory TEXT,
                message TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                completed_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS cleanup_run_items (
                run_id INTEGER NOT NULL REFERENCES cleanup_runs(run_id) ON DELETE CASCADE,
                item_id INTEGER NOT NULL,
                expected_fingerprint_json TEXT NOT NULL,
                recognized_fingerprint_json TEXT,
                preview_status TEXT NOT NULL,
                execution_status TEXT NOT NULL,
                confidence REAL,
                image_path TEXT,
                reason TEXT,
                PRIMARY KEY (run_id, item_id)
            );

            CREATE INDEX IF NOT EXISTS idx_relics_set_slot ON relics(set_id, slot);
            CREATE INDEX IF NOT EXISTS idx_relics_rarity_level ON relics(rarity, level);
            CREATE INDEX IF NOT EXISTS idx_relics_rarity_level_id ON relics(rarity DESC, level DESC, item_id DESC);
            CREATE INDEX IF NOT EXISTS idx_relics_main_stat ON relics(main_stat);
            CREATE INDEX IF NOT EXISTS idx_relics_location ON relics(location);
            CREATE INDEX IF NOT EXISTS idx_relics_equipped_char ON relics(equipped_character_id);
            CREATE INDEX IF NOT EXISTS idx_relic_substats_key_value ON relic_substats(stat_key, value);
            CREATE INDEX IF NOT EXISTS idx_light_cones_level ON light_cones(level, ascension);
            CREATE INDEX IF NOT EXISTS idx_light_cones_location ON light_cones(location);
            CREATE INDEX IF NOT EXISTS idx_light_cones_equipped_char ON light_cones(equipped_character_id);
            CREATE INDEX IF NOT EXISTS idx_light_cones_template_id ON light_cones(template_id);
            CREATE INDEX IF NOT EXISTS idx_characters_path_level ON characters(path, level);
            CREATE INDEX IF NOT EXISTS idx_teams_updated_at ON teams(updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_cleanup_queue_uid_created ON cleanup_queue(uid, created_at, item_id);
            CREATE INDEX IF NOT EXISTS idx_cleanup_runs_created_at ON cleanup_runs(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_cleanup_run_items_status ON cleanup_run_items(run_id, preview_status, execution_status);
            "#,
        )?;
        let schema_version =
            connection.query_row("SELECT version FROM schema_meta LIMIT 1", [], |row| {
                row.get::<_, i64>(0)
            })?;
        if schema_version < SCHEMA_VERSION {
            // Older databases predate derived columns. SQLite does not support conditional
            // ADD COLUMN in a batch, so ignore the duplicate-column case during upgrades.
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
                "ALTER TABLE character_build_plans ADD COLUMN game_version TEXT NOT NULL DEFAULT ''",
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
            let _ = connection.execute(
                "ALTER TABLE cleanup_queue ADD COLUMN uid INTEGER NOT NULL DEFAULT 0",
                [],
            );
            connection.execute(
                "UPDATE character_build_targets SET minimum = target - max_gap",
                [],
            )?;
            normalize_existing_records(connection)?;
            backfill_main_stat_values(connection)?;
            backfill_character_rarities(connection)?;
            migrate_percentage_build_targets(connection)?;
            connection.execute("UPDATE schema_meta SET version = ?1", [SCHEMA_VERSION])?;
        }
        Ok(())
    }
}

fn migrate_percentage_build_targets(connection: &Connection) -> Result<(), AppError> {
    // Avoid primary-key collisions when an older plan contains both a flat target and its
    // percentage variant; the existing flat target is already the meaningful standing stat.
    connection.execute(
        "DELETE FROM character_build_targets AS percentage
         WHERE percentage.stat_key IN ('HP%', 'ATK%', 'DEF%')
           AND EXISTS (
             SELECT 1 FROM character_build_targets AS flat
             WHERE flat.character_id = percentage.character_id
               AND flat.stat_key = CASE percentage.stat_key
                 WHEN 'HP%' THEN 'HP'
                 WHEN 'ATK%' THEN 'ATK'
                 WHEN 'DEF%' THEN 'DEF'
               END
           )",
        [],
    )?;
    connection.execute(
        "UPDATE character_build_targets
         SET stat_key = CASE stat_key
           WHEN 'HP%' THEN 'HP'
           WHEN 'ATK%' THEN 'ATK'
           WHEN 'DEF%' THEN 'DEF'
           ELSE stat_key
         END
         WHERE stat_key IN ('HP%', 'ATK%', 'DEF%')",
        [],
    )?;
    Ok(())
}

pub(super) fn normalize_existing_records(connection: &Connection) -> Result<(), AppError> {
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
