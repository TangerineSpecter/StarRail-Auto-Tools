use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{
    params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension, Transaction,
};

use super::models::*;
use crate::error::AppError;

mod build_advice;
mod build_plans;
mod export;
mod migration;
mod optimizer;
mod queries;
mod sync;
mod teams;

#[cfg(test)]
mod tests;

#[derive(Debug, Clone)]
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) struct AccountMismatch {
    pub existing_uid: u32,
    pub incoming_uid: u32,
}

pub(crate) type ApplyResult = Result<InventorySummary, AccountMismatch>;

pub(super) const SYNC_LOCAL_UPDATED_AT_KEY: &str = "sync_local_updated_at";
pub(super) const SYNC_LAST_SYNCED_AT_KEY: &str = "sync_last_synced_at";
pub(super) const SYNC_REMOTE_REVISION_KEY: &str = "sync_remote_revision";

pub(super) struct SnapshotApplyOptions<'a> {
    pub clear_first: bool,
    pub reset_sync_state: bool,
    pub build_plans: &'a [CharacterBuildPlan],
    pub build_layouts: &'a [BuildDashboardLayout],
    pub teams: &'a [TeamSyncRecord],
    pub sync_generated_at: Option<i64>,
    pub sync_remote_revision: Option<&'a str>,
    pub expected_local_generated_at: Option<i64>,
}

impl InventoryStore {
    pub fn initialize(path: PathBuf) -> Result<Self, AppError> {
        let store = Self {
            path,
            pool: Arc::new(Mutex::new(Vec::new())),
        };
        let connection = store.connect()?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        store.migrate(&connection)?;
        Ok(store)
    }

    pub(crate) fn connect(&self) -> Result<PooledConnection, AppError> {
        if let Ok(mut guard) = self.pool.lock() {
            if let Some(connection) = guard.pop() {
                return Ok(PooledConnection::new(connection, Arc::clone(&self.pool)));
            }
        }
        let connection = Connection::open(&self.path)?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "synchronous", "NORMAL")?;
        connection.pragma_update(None, "temp_store", "MEMORY")?;
        connection.pragma_update(None, "cache_size", -32_000)?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        Ok(PooledConnection::new(connection, Arc::clone(&self.pool)))
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

pub(super) fn summary_from_connection(
    connection: &Connection,
) -> Result<InventorySummary, AppError> {
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

pub(super) fn clear_all(transaction: &Transaction<'_>) -> Result<(), AppError> {
    transaction.execute("DELETE FROM relics", [])?;
    transaction.execute("DELETE FROM light_cones", [])?;
    transaction.execute("DELETE FROM characters", [])?;
    Ok(())
}

pub(super) fn validate_page(page: &PageQuery) -> Result<(), AppError> {
    if page.page == 0 || page.page_size == 0 || page.page_size > 200 {
        Err(AppError::InvalidPage)
    } else {
        Ok(())
    }
}

pub(super) fn clean_filter(value: &Option<String>) -> Option<String> {
    value
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

pub(super) fn clean_filters(value: &Option<Vec<String>>) -> Option<Vec<String>> {
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
pub(super) fn inventory_path_label(path: &str) -> &str {
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

pub(super) fn character_matches_equipment_search(name: &str, path: &str, search: &str) -> bool {
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

pub(super) fn matching_equipped_character_ids(
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
pub(super) fn push_equipped_owner_search(
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

pub(super) fn push_text_filters(
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

pub(super) fn push_number_filters(
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

pub(super) fn push_number_filter(
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

pub(super) fn push_bool_filter(
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

pub(super) fn make_where(clauses: &[String]) -> String {
    if clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    }
}

pub(super) fn query_count(
    connection: &Connection,
    table: &str,
    where_sql: &str,
    values: &[SqlValue],
) -> Result<u64, AppError> {
    let sql = format!("SELECT COUNT(*) FROM {table} {where_sql}");
    Ok(connection.query_row(&sql, params_from_iter(values.iter()), |row| row.get(0))?)
}

pub(super) fn table_for_kind(kind: InventoryKind) -> &'static str {
    match kind {
        InventoryKind::Relic => "relics",
        InventoryKind::LightCone => "light_cones",
        InventoryKind::Character => "characters",
    }
}

pub(super) fn id_column_for_kind(kind: InventoryKind) -> &'static str {
    match kind {
        InventoryKind::Relic | InventoryKind::LightCone => "item_id",
        InventoryKind::Character => "character_id",
    }
}

pub(super) fn sync_local_updated_at(connection: &Connection) -> Result<i64, AppError> {
    let stored = connection
        .query_row(
            "SELECT value FROM app_state WHERE key = ?1",
            [SYNC_LOCAL_UPDATED_AT_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .and_then(|value| value.parse::<i64>().ok());
    if let Some(stored) = stored {
        return Ok(stored.max(0));
    }

    let mut inferred = connection.query_row(
        "SELECT COALESCE(MAX(finished_at), 0)
         FROM import_runs WHERE status = 'complete'",
        [],
        |row| row.get::<_, i64>(0),
    )?;
    for table in [
        "relics",
        "light_cones",
        "characters",
        "character_build_plans",
        "teams",
    ] {
        let value = connection.query_row(
            &format!("SELECT COALESCE(MAX(updated_at), 0) FROM {table}"),
            [],
            |row| row.get::<_, i64>(0),
        )?;
        inferred = inferred.max(value);
    }
    Ok(inferred)
}

pub(super) fn set_sync_local_updated_at(
    connection: &Connection,
    updated_at: i64,
) -> Result<(), AppError> {
    connection.execute(
        "INSERT INTO app_state(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![SYNC_LOCAL_UPDATED_AT_KEY, updated_at.max(0).to_string()],
    )?;
    Ok(())
}

pub(super) fn app_state_string(
    connection: &Connection,
    key: &str,
) -> Result<Option<String>, AppError> {
    Ok(connection
        .query_row("SELECT value FROM app_state WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .optional()?)
}

pub(super) fn app_state_i64(connection: &Connection, key: &str) -> Result<Option<i64>, AppError> {
    Ok(app_state_string(connection, key)?.and_then(|value| value.parse().ok()))
}

pub(super) fn set_sync_baseline(
    connection: &Connection,
    generated_at: i64,
    remote_revision: &str,
) -> Result<(), AppError> {
    connection.execute(
        "INSERT INTO app_state(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![SYNC_LAST_SYNCED_AT_KEY, generated_at.max(0).to_string()],
    )?;
    connection.execute(
        "INSERT INTO app_state(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![SYNC_REMOTE_REVISION_KEY, remote_revision],
    )?;
    Ok(())
}

pub(super) fn clear_sync_baseline(connection: &Connection) -> Result<(), AppError> {
    connection.execute(
        "DELETE FROM app_state WHERE key IN (?1, ?2)",
        params![SYNC_LAST_SYNCED_AT_KEY, SYNC_REMOTE_REVISION_KEY],
    )?;
    Ok(())
}

pub(super) fn touch_sync_local_updated_at(
    connection: &Connection,
    requested_at: i64,
) -> Result<(), AppError> {
    let current = connection
        .query_row(
            "SELECT value FROM app_state WHERE key = ?1",
            [SYNC_LOCAL_UPDATED_AT_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0);
    set_sync_local_updated_at(connection, requested_at.max(current.saturating_add(1)))
}

pub(super) fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
