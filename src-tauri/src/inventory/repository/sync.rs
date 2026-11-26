use rusqlite::{params, OptionalExtension, Transaction};
use serde_json::Value;

use super::super::models::*;
use super::super::{character_rarity, normalize_import};
use super::build_plans::{
    apply_build_layouts, clear_character_build_scores, save_build_plan_in_transaction,
    BuildPlanSaveMode,
};
use super::export::{export_characters, export_light_cones, export_relics};
use super::optimizer::main_stat_value;
use super::teams::{list_team_sync_records, replace_teams_in_transaction};
use super::{
    app_state_i64, app_state_string, clear_all, clear_sync_baseline, now_millis, set_sync_baseline,
    set_sync_local_updated_at, sync_local_updated_at, touch_sync_local_updated_at, AccountMismatch,
    ApplyResult, SnapshotApplyOptions, SYNC_LAST_SYNCED_AT_KEY, SYNC_REMOTE_REVISION_KEY,
};
use crate::error::AppError;

impl InventoryStore {
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

        self.apply_snapshot(
            import,
            SnapshotApplyOptions {
                clear_first: false,
                reset_sync_state: false,
                build_plans: &[],
                build_layouts: &[],
                teams: &[],
                sync_generated_at: None,
                sync_remote_revision: None,
                expected_local_generated_at: None,
            },
        )
        .map(Ok)
    }

    pub fn replace_account_and_apply(
        &self,
        import: &InventoryImport,
    ) -> Result<InventorySummary, AppError> {
        // Game-driven account replace refreshes inventory only; local teams are kept.
        self.apply_snapshot(
            import,
            SnapshotApplyOptions {
                clear_first: true,
                reset_sync_state: false,
                build_plans: &[],
                build_layouts: &[],
                teams: &[],
                sync_generated_at: None,
                sync_remote_revision: None,
                expected_local_generated_at: None,
            },
        )
    }

    fn apply_snapshot(
        &self,
        import: &InventoryImport,
        options: SnapshotApplyOptions<'_>,
    ) -> Result<InventorySummary, AppError> {
        let now = now_millis();
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;

        if let Some(expected) = options.expected_local_generated_at {
            if sync_local_updated_at(&transaction)? != expected {
                return Err(AppError::Sync(
                    "下载期间本地数据已变化，请重新检查后再覆盖".to_owned(),
                ));
            }
        }

        if options.clear_first {
            clear_all(&transaction)?;
            // Equipment may change; cached scores are always invalidated on inventory replace.
            clear_character_build_scores(&transaction)?;
            if options.reset_sync_state {
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
        {
            let mut light_cone_stmt = transaction.prepare_cached(
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
            )?;
            for light_cone in &import.light_cones {
                light_cone_stmt.execute(params![
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
                ])?;
            }
            let mut character_stmt = transaction.prepare_cached(
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
            )?;
            for character in &import.characters {
                character_stmt.execute(params![
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
                ])?;
            }
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
        for plan in options.build_plans {
            save_build_plan_in_transaction(
                &transaction,
                plan,
                BuildPlanSaveMode::PreserveMetadata,
            )?;
        }
        apply_build_layouts(&transaction, options.build_layouts)?;
        if options.reset_sync_state {
            // Empty slice intentionally clears all teams after wipe.
            replace_teams_in_transaction(&transaction, options.teams)?;
        }
        if let Some(sync_generated_at) = options.sync_generated_at {
            set_sync_local_updated_at(&transaction, sync_generated_at)?;
            if let Some(revision) = options.sync_remote_revision {
                set_sync_baseline(&transaction, sync_generated_at, revision)?;
            } else {
                clear_sync_baseline(&transaction)?;
            }
        } else {
            touch_sync_local_updated_at(&transaction, now)?;
        }
        transaction.commit()?;
        self.summary()
    }

    pub fn sync_snapshot(&self) -> Result<SyncSnapshot, AppError> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        let generated_at = sync_local_updated_at(&transaction)?;
        let metadata = ImportMetadata {
            uid: app_state_string(&transaction, "current_uid")?
                .and_then(|value| value.parse().ok()),
            trailblazer: transaction
                .query_row(
                    "SELECT value FROM app_state WHERE key = 'trailblazer'",
                    [],
                    |row| row.get(0),
                )
                .optional()?,
        };
        let inventory = InventoryImport {
            metadata,
            relics: serde_json::from_value(Value::Array(export_relics(&transaction)?))
                .map_err(|error| AppError::Database(error.to_string()))?,
            light_cones: serde_json::from_value(Value::Array(export_light_cones(&transaction)?))
                .map_err(|error| AppError::Database(error.to_string()))?,
            characters: serde_json::from_value(Value::Array(export_characters(&transaction)?))
                .map_err(|error| AppError::Database(error.to_string()))?,
        };
        let character_ids = transaction
            .prepare("SELECT character_id FROM character_build_plans ORDER BY character_id")?
            .query_map([], |row| row.get::<_, u32>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        let mut build_plans = Vec::with_capacity(character_ids.len());
        for character_id in character_ids {
            if let Some(plan) = Self::build_plan_from_connection(&transaction, character_id)? {
                build_plans.push(plan);
            }
        }
        let build_layouts = transaction
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
        let teams = list_team_sync_records(&transaction)?;
        Ok(SyncSnapshot {
            format_version: SYNC_FORMAT_VERSION,
            generated_at,
            source: "starrail-auto-tools".to_owned(),
            inventory,
            build_plans,
            build_layouts,
            teams,
        })
    }

    pub fn sync_local_state(&self) -> Result<SyncLocalState, AppError> {
        let connection = self.connect()?;
        Ok(SyncLocalState {
            generated_at: sync_local_updated_at(&connection)?,
            last_synced_generated_at: app_state_i64(&connection, SYNC_LAST_SYNCED_AT_KEY)?,
            remote_revision: app_state_string(&connection, SYNC_REMOTE_REVISION_KEY)?,
        })
    }

    pub fn mark_sync_uploaded(&self, generated_at: i64, revision: &str) -> Result<(), AppError> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        set_sync_baseline(&transaction, generated_at, revision)?;
        transaction.commit()?;
        Ok(())
    }

    #[cfg(test)]
    pub(super) fn replace_with_sync_snapshot(
        &self,
        snapshot: SyncSnapshot,
    ) -> Result<InventorySummary, AppError> {
        self.replace_with_sync_snapshot_at_revision(snapshot, None, None)
    }

    pub fn replace_with_sync_snapshot_at_revision(
        &self,
        mut snapshot: SyncSnapshot,
        remote_revision: Option<&str>,
        expected_local_generated_at: Option<i64>,
    ) -> Result<InventorySummary, AppError> {
        if !supports_sync_format_version(snapshot.format_version) {
            return Err(AppError::Sync(format!(
                "不支持的同步数据版本：{}",
                snapshot.format_version
            )));
        }
        normalize_import(&mut snapshot.inventory);
        let sync_generated_at = snapshot.generated_at;
        self.apply_snapshot(
            &snapshot.inventory,
            SnapshotApplyOptions {
                clear_first: true,
                reset_sync_state: true,
                build_plans: &snapshot.build_plans,
                build_layouts: &snapshot.build_layouts,
                teams: &snapshot.teams,
                sync_generated_at: Some(sync_generated_at),
                sync_remote_revision: remote_revision,
                expected_local_generated_at,
            },
        )
    }
}

fn upsert_relic(
    transaction: &Transaction<'_>,
    relic: &ImportRelic,
    now: i64,
    run_id: i64,
) -> Result<(), AppError> {
    {
        let mut upsert_stmt = transaction.prepare_cached(
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
        )?;
        upsert_stmt.execute(params![
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
        ])?;
        let mut delete_stmt =
            transaction.prepare_cached("DELETE FROM relic_substats WHERE relic_id = ?1")?;
        delete_stmt.execute([relic._uid])?;
    }
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
    let mut statement = transaction.prepare_cached(
        "INSERT INTO relic_substats(relic_id, kind, position, stat_key, value, count, step)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )?;
    for (position, substat) in substats.iter().enumerate() {
        statement.execute(params![
            relic_id,
            kind,
            position as i64,
            substat.key,
            substat.value,
            substat.count,
            substat.step
        ])?;
    }
    Ok(())
}
