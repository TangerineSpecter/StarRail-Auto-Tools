use std::{
    collections::{HashMap, HashSet},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{InventoryStore, RelicSubstatItem, PROTOCOL_VERSION};
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RelicFingerprint {
    pub item_id: u32,
    pub set_id: u32,
    pub name: String,
    pub set_name: String,
    pub slot: String,
    pub rarity: u32,
    pub level: u32,
    pub main_stat: String,
    pub main_stat_value: f64,
    pub location: String,
    pub equipped_character_id: Option<u32>,
    pub locked: bool,
    pub discard: bool,
    pub substats: Vec<RelicSubstatItem>,
}

impl RelicFingerprint {
    /// Game detail pages do not expose the internal item id. This stable key is
    /// therefore the identity used by OCR and duplicate-group safety checks.
    pub fn visual_key(&self) -> Result<String, AppError> {
        let value = serde_json::json!({
            "setId": self.set_id,
            "name": self.name,
            "setName": self.set_name,
            "slot": self.slot,
            "rarity": self.rarity,
            "level": self.level,
            "mainStat": self.main_stat,
            "mainStatValue": self.main_stat_value,
            "substats": self.substats,
        });
        hash_serializable(&value)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupCandidateRequest {
    pub item_ids: Vec<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupQueueItem {
    pub item_id: u32,
    pub display_name: String,
    pub status: String,
    pub last_run_id: Option<u64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub fingerprint: RelicFingerprint,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupRunSummary {
    pub run_id: u64,
    pub run_code: String,
    pub status: String,
    pub uid: u32,
    pub inventory_hash: String,
    pub model_revision: String,
    pub template_revision: String,
    pub protocol_version: String,
    pub directory: Option<String>,
    pub message: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub completed_at: Option<i64>,
    pub item_count: u64,
    pub matched_count: u64,
    pub exception_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupRunItem {
    pub item_id: u32,
    pub expected_fingerprint: RelicFingerprint,
    pub recognized_fingerprint: Option<RelicFingerprint>,
    pub preview_status: String,
    pub execution_status: String,
    pub confidence: Option<f64>,
    pub image_path: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupRunDetail {
    #[serde(flatten)]
    pub run: CleanupRunSummary,
    pub items: Vec<CleanupRunItem>,
    pub currently_valid: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct FrozenCleanupRun {
    pub run_id: u64,
    pub uid: u32,
    pub inventory_hash: String,
    pub items: Vec<CleanupQueueItem>,
    pub ambiguous_item_ids: HashSet<u32>,
}

pub(crate) struct CleanupItemUpdate<'a> {
    pub preview_status: &'a str,
    pub execution_status: &'a str,
    pub confidence: Option<f64>,
    pub image_path: Option<&'a str>,
    pub reason: Option<&'a str>,
}

impl InventoryStore {
    fn cleanup_connection(&self) -> Result<Connection, AppError> {
        let connection = Connection::open(&self.path)?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        Ok(connection)
    }

    pub fn add_cleanup_candidates(
        &self,
        request: &CleanupCandidateRequest,
    ) -> Result<Vec<CleanupQueueItem>, AppError> {
        if request.item_ids.is_empty() {
            return Err(AppError::RelicCleanup("请至少选择一件遗器".to_owned()));
        }
        let mut connection = self.cleanup_connection()?;
        let transaction = connection.transaction()?;
        let uid = cleanup_uid(&transaction)?;
        let now = cleanup_now_millis();
        let mut frozen = Vec::with_capacity(request.item_ids.len());
        for item_id in &request.item_ids {
            let fingerprint = load_fingerprint(&transaction, *item_id)?.ok_or_else(|| {
                AppError::RelicCleanup(format!("遗器 {item_id} 已不存在，请刷新背包后重试"))
            })?;
            if fingerprint.locked {
                return Err(AppError::RelicCleanup(format!(
                    "遗器 {} 已锁定，未加入清理管理",
                    fingerprint.name
                )));
            }
            if fingerprint.equipped_character_id.is_some() || fingerprint.location != "inventory" {
                return Err(AppError::RelicCleanup(format!(
                    "遗器 {} 已装备，未加入清理管理",
                    fingerprint.name
                )));
            }
            let display_name = format!(
                "{} · {} +{}",
                fingerprint.set_name, fingerprint.slot, fingerprint.level
            );
            let fingerprint_json = serde_json::to_string(&fingerprint)
                .map_err(|error| AppError::RelicCleanup(error.to_string()))?;
            transaction.execute(
                "INSERT INTO cleanup_queue(item_id, uid, fingerprint_json, display_name, status, created_at, updated_at)
                 VALUES(?1, ?2, ?3, ?4, 'pendingPreview', ?5, ?5)
                 ON CONFLICT(item_id) DO UPDATE SET
                   uid = excluded.uid,
                   fingerprint_json = excluded.fingerprint_json,
                   display_name = excluded.display_name,
                   status = 'pendingPreview',
                   updated_at = excluded.updated_at",
                params![item_id, uid, fingerprint_json, display_name, now],
            )?;
            frozen.push(*item_id);
        }
        transaction.commit()?;
        self.list_cleanup_queue().map(|items| {
            items
                .into_iter()
                .filter(|item| frozen.contains(&item.item_id))
                .collect()
        })
    }

    pub fn remove_cleanup_candidates(&self, item_ids: &[u32]) -> Result<u64, AppError> {
        if item_ids.is_empty() {
            return Ok(0);
        }
        let connection = self.cleanup_connection()?;
        let uid = cleanup_uid(&connection)?;
        let placeholders = std::iter::repeat_n("?", item_ids.len())
            .collect::<Vec<_>>()
            .join(",");
        let values = item_ids
            .iter()
            .map(|id| rusqlite::types::Value::Integer(*id as i64))
            .collect::<Vec<_>>();
        let deleted = connection.execute(
            &format!("DELETE FROM cleanup_queue WHERE uid = ? AND item_id IN ({placeholders})"),
            rusqlite::params_from_iter(
                std::iter::once(rusqlite::types::Value::Integer(uid as i64)).chain(values),
            ),
        )?;
        Ok(deleted as u64)
    }

    pub fn list_cleanup_queue(&self) -> Result<Vec<CleanupQueueItem>, AppError> {
        let Some(uid) = self.current_uid()? else {
            return Ok(Vec::new());
        };
        let connection = self.cleanup_connection()?;
        let mut statement = connection.prepare(
            "SELECT item_id, display_name, status, last_run_id, created_at, updated_at, fingerprint_json
             FROM cleanup_queue WHERE uid = ?1 ORDER BY created_at, item_id",
        )?;
        let items = statement
            .query_map([uid], map_queue_item)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(AppError::from)?;
        Ok(items)
    }

    pub(crate) fn freeze_cleanup_run(
        &self,
        model_revision: &str,
        template_revision: &str,
    ) -> Result<FrozenCleanupRun, AppError> {
        let mut connection = self.cleanup_connection()?;
        let transaction = connection.transaction()?;
        let uid = cleanup_uid(&transaction)?;
        let mut queue_statement = transaction.prepare(
            "SELECT item_id, display_name, status, last_run_id, created_at, updated_at, fingerprint_json
             FROM cleanup_queue WHERE uid = ?1 ORDER BY created_at, item_id",
        )?;
        let items = queue_statement
            .query_map([uid], map_queue_item)?
            .collect::<Result<Vec<_>, _>>()?;
        drop(queue_statement);
        if items.is_empty() {
            return Err(AppError::RelicCleanup("清理管理中没有候选遗器".to_owned()));
        }
        for item in &items {
            let current = load_fingerprint(&transaction, item.item_id)?.ok_or_else(|| {
                AppError::RelicCleanup(format!(
                    "候选遗器 {} 已不在当前背包，请移出后重新选择",
                    item.display_name
                ))
            })?;
            if current.locked
                || current.equipped_character_id.is_some()
                || current.location != "inventory"
            {
                return Err(AppError::RelicCleanup(format!(
                    "候选遗器 {} 当前已锁定或装备，请重新检查清理名单",
                    item.display_name
                )));
            }
            if current != item.fingerprint {
                return Err(AppError::RelicCleanup(format!(
                    "候选遗器 {} 的数据已变化，请移出并重新加入",
                    item.display_name
                )));
            }
        }
        let inventory_hash = cleanup_inventory_hash_from_connection(&transaction, uid)?;
        let mut all_visual_counts = HashMap::<String, usize>::new();
        let mut ids_statement =
            transaction.prepare("SELECT item_id FROM relics ORDER BY item_id")?;
        let inventory_ids = ids_statement
            .query_map([], |row| row.get::<_, u32>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        drop(ids_statement);
        for item_id in inventory_ids {
            if let Some(fingerprint) = load_fingerprint(&transaction, item_id)? {
                *all_visual_counts
                    .entry(fingerprint.visual_key()?)
                    .or_default() += 1;
            }
        }
        let mut selected_visual_counts = HashMap::<String, usize>::new();
        for item in &items {
            *selected_visual_counts
                .entry(item.fingerprint.visual_key()?)
                .or_default() += 1;
        }
        let ambiguous_item_ids = items
            .iter()
            .filter_map(|item| {
                let key = item.fingerprint.visual_key().ok()?;
                (all_visual_counts.get(&key) != selected_visual_counts.get(&key))
                    .then_some(item.item_id)
            })
            .collect::<HashSet<_>>();
        let now = cleanup_now_millis();
        transaction.execute(
            "INSERT INTO cleanup_runs(status, uid, inventory_hash, model_revision, template_revision,
                                      protocol_version, message, created_at, updated_at)
             VALUES('preparingPreview', ?1, ?2, ?3, ?4, ?5, '', ?6, ?6)",
            params![uid, inventory_hash, model_revision, template_revision, PROTOCOL_VERSION, now],
        )?;
        let run_id = transaction.last_insert_rowid() as u64;
        for item in &items {
            let expected = serde_json::to_string(&item.fingerprint)
                .map_err(|error| AppError::RelicCleanup(error.to_string()))?;
            let ambiguous = ambiguous_item_ids.contains(&item.item_id);
            transaction.execute(
                "INSERT INTO cleanup_run_items(run_id, item_id, expected_fingerprint_json,
                                               preview_status, execution_status, reason)
                 VALUES(?1, ?2, ?3, ?4, 'notStarted', ?5)",
                params![
                    run_id,
                    item.item_id,
                    expected,
                    if ambiguous { "ambiguous" } else { "pending" },
                    if ambiguous {
                        Some("存在视觉指纹相同但未全部加入清理名单的遗器")
                    } else {
                        None
                    }
                ],
            )?;
            transaction.execute(
                "UPDATE cleanup_queue SET status = 'previewing', last_run_id = ?1, updated_at = ?2
                 WHERE item_id = ?3",
                params![run_id, now, item.item_id],
            )?;
        }
        transaction.commit()?;
        Ok(FrozenCleanupRun {
            run_id,
            uid,
            inventory_hash,
            items,
            ambiguous_item_ids,
        })
    }

    pub(crate) fn set_cleanup_run_directory(
        &self,
        run_id: u64,
        directory: &str,
    ) -> Result<(), AppError> {
        self.cleanup_connection()?.execute(
            "UPDATE cleanup_runs SET directory = ?1, updated_at = ?2 WHERE run_id = ?3",
            params![directory, cleanup_now_millis(), run_id],
        )?;
        Ok(())
    }

    pub(crate) fn update_cleanup_run(
        &self,
        run_id: u64,
        status: &str,
        message: &str,
        terminal: bool,
    ) -> Result<(), AppError> {
        let now = cleanup_now_millis();
        self.cleanup_connection()?.execute(
            "UPDATE cleanup_runs SET status = ?1, message = ?2, updated_at = ?3,
                    completed_at = CASE WHEN ?4 THEN ?3 ELSE completed_at END
             WHERE run_id = ?5",
            params![status, message, now, terminal, run_id],
        )?;
        Ok(())
    }

    pub(crate) fn update_cleanup_run_item(
        &self,
        run_id: u64,
        item_id: u32,
        update: CleanupItemUpdate<'_>,
    ) -> Result<(), AppError> {
        let connection = self.cleanup_connection()?;
        connection.execute(
            "UPDATE cleanup_run_items SET preview_status = ?1, execution_status = ?2,
                    confidence = ?3, image_path = ?4, reason = ?5
             WHERE run_id = ?6 AND item_id = ?7",
            params![
                update.preview_status,
                update.execution_status,
                update.confidence,
                update.image_path,
                update.reason,
                run_id,
                item_id
            ],
        )?;
        connection.execute(
            "UPDATE cleanup_queue SET status = ?1, updated_at = ?2
             WHERE item_id = ?3 AND uid = (SELECT uid FROM cleanup_runs WHERE run_id = ?4)",
            params![update.preview_status, cleanup_now_millis(), item_id, run_id],
        )?;
        Ok(())
    }

    pub fn cleanup_inventory_hash(&self) -> Result<String, AppError> {
        let connection = self.cleanup_connection()?;
        let uid = self.current_uid()?.unwrap_or_default();
        cleanup_inventory_hash_from_connection(&connection, uid)
    }

    pub fn list_cleanup_runs(&self) -> Result<Vec<CleanupRunSummary>, AppError> {
        let connection = self.cleanup_connection()?;
        let mut statement =
            connection.prepare(&run_summary_sql("", "ORDER BY r.created_at DESC"))?;
        let mut runs = statement
            .query_map([], map_run_summary)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(AppError::from)?;
        let current_uid = self.current_uid()?.unwrap_or_default();
        let current_hash = self.cleanup_inventory_hash()?;
        for run in &mut runs {
            if run.status == "previewCompleted"
                && (run.uid != current_uid || run.inventory_hash != current_hash)
            {
                run.status = "previewInvalidated".to_owned();
                run.message = "UID 或遗器库存已变化，本次预览已作废".to_owned();
                connection.execute(
                    "UPDATE cleanup_runs SET status = 'previewInvalidated', message = ?1,
                            updated_at = ?2, completed_at = COALESCE(completed_at, ?2)
                     WHERE run_id = ?3",
                    params![run.message, cleanup_now_millis(), run.run_id],
                )?;
            }
        }
        Ok(runs)
    }

    pub fn cleanup_run_detail(&self, run_id: u64) -> Result<CleanupRunDetail, AppError> {
        let connection = self.cleanup_connection()?;
        let run = connection
            .query_row(
                &run_summary_sql("WHERE r.run_id = ?1", ""),
                [run_id],
                map_run_summary,
            )
            .optional()?
            .ok_or_else(|| AppError::RelicCleanup(format!("找不到预览 run-{run_id:06}")))?;
        let mut statement = connection.prepare(
            "SELECT item_id, expected_fingerprint_json, recognized_fingerprint_json,
                    preview_status, execution_status, confidence, image_path, reason
             FROM cleanup_run_items WHERE run_id = ?1 ORDER BY item_id",
        )?;
        let items = statement
            .query_map([run_id], |row| {
                let expected: String = row.get(1)?;
                let recognized: Option<String> = row.get(2)?;
                Ok(CleanupRunItem {
                    item_id: row.get(0)?,
                    expected_fingerprint: serde_json::from_str(&expected)
                        .map_err(json_sql_error)?,
                    recognized_fingerprint: recognized
                        .map(|value| serde_json::from_str(&value).map_err(json_sql_error))
                        .transpose()?,
                    preview_status: row.get(3)?,
                    execution_status: row.get(4)?,
                    confidence: row.get(5)?,
                    image_path: row.get(6)?,
                    reason: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let currently_valid = run.uid == self.current_uid()?.unwrap_or_default()
            && run.inventory_hash == self.cleanup_inventory_hash()?;
        Ok(CleanupRunDetail {
            run,
            items,
            currently_valid,
        })
    }

    pub fn delete_cleanup_run(&self, run_id: u64) -> Result<Option<String>, AppError> {
        let connection = self.cleanup_connection()?;
        let directory = connection
            .query_row(
                "SELECT directory FROM cleanup_runs WHERE run_id = ?1",
                [run_id],
                |row| row.get(0),
            )
            .optional()?;
        connection.execute("DELETE FROM cleanup_runs WHERE run_id = ?1", [run_id])?;
        Ok(directory.flatten())
    }
}

fn cleanup_uid(connection: &Connection) -> Result<u32, AppError> {
    let value: Option<String> = connection
        .query_row(
            "SELECT value FROM app_state WHERE key = 'current_uid'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    value
        .and_then(|value| value.parse().ok())
        .filter(|uid| *uid != 0)
        .ok_or_else(|| {
            AppError::RelicCleanup("尚未读取到游戏 UID，请先完成一次直读同步".to_owned())
        })
}

fn cleanup_inventory_hash_from_connection(
    connection: &Connection,
    uid: u32,
) -> Result<String, AppError> {
    let mut ids_statement = connection.prepare("SELECT item_id FROM relics ORDER BY item_id")?;
    let ids = ids_statement
        .query_map([], |row| row.get::<_, u32>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    drop(ids_statement);
    let mut fingerprints = Vec::with_capacity(ids.len());
    for id in ids {
        if let Some(fingerprint) = load_fingerprint(connection, id)? {
            fingerprints.push(fingerprint);
        }
    }
    hash_serializable(&serde_json::json!({ "uid": uid, "relics": fingerprints }))
}

fn load_fingerprint(
    connection: &Connection,
    item_id: u32,
) -> Result<Option<RelicFingerprint>, AppError> {
    let relic = connection
        .query_row(
            "SELECT item_id, set_id, name, set_name, slot, rarity, level, main_stat,
                    main_stat_value, location, equipped_character_id, locked, discard
             FROM relics WHERE item_id = ?1",
            [item_id],
            |row| {
                Ok(RelicFingerprint {
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
                    substats: Vec::new(),
                })
            },
        )
        .optional()?;
    let Some(mut relic) = relic else {
        return Ok(None);
    };
    let mut statement = connection.prepare(
        "SELECT kind, position, stat_key, value, count, step
         FROM relic_substats WHERE relic_id = ?1 ORDER BY kind, position",
    )?;
    relic.substats = statement
        .query_map([item_id], |row| {
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
    Ok(Some(relic))
}

fn map_queue_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<CleanupQueueItem> {
    let fingerprint: String = row.get(6)?;
    Ok(CleanupQueueItem {
        item_id: row.get(0)?,
        display_name: row.get(1)?,
        status: row.get(2)?,
        last_run_id: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        fingerprint: serde_json::from_str(&fingerprint).map_err(json_sql_error)?,
    })
}

fn run_summary_sql(filter: &str, order: &str) -> String {
    format!(
        "SELECT r.run_id, r.status, r.uid, r.inventory_hash, r.model_revision, r.template_revision,
                r.protocol_version, r.directory, r.message, r.created_at, r.updated_at, r.completed_at,
                COUNT(i.item_id),
                SUM(CASE WHEN i.preview_status = 'uniqueMatch' THEN 1 ELSE 0 END),
                SUM(CASE WHEN i.preview_status NOT IN ('pending', 'uniqueMatch') THEN 1 ELSE 0 END)
         FROM cleanup_runs r LEFT JOIN cleanup_run_items i ON i.run_id = r.run_id
         {filter} GROUP BY r.run_id {order}"
    )
}

fn map_run_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<CleanupRunSummary> {
    let run_id: u64 = row.get(0)?;
    Ok(CleanupRunSummary {
        run_id,
        run_code: format!("run-{run_id:06}"),
        status: row.get(1)?,
        uid: row.get(2)?,
        inventory_hash: row.get(3)?,
        model_revision: row.get(4)?,
        template_revision: row.get(5)?,
        protocol_version: row.get(6)?,
        directory: row.get(7)?,
        message: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        completed_at: row.get(11)?,
        item_count: row.get(12)?,
        matched_count: row.get::<_, Option<u64>>(13)?.unwrap_or_default(),
        exception_count: row.get::<_, Option<u64>>(14)?.unwrap_or_default(),
    })
}

fn hash_serializable(value: &impl Serialize) -> Result<String, AppError> {
    let bytes =
        serde_json::to_vec(value).map_err(|error| AppError::RelicCleanup(error.to_string()))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn json_sql_error(error: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
}

fn cleanup_now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_DATABASE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    fn test_store() -> (InventoryStore, std::path::PathBuf) {
        let path = std::env::temp_dir().join(format!(
            "starrail-cleanup-test-{}-{}-{}.sqlite3",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            TEST_DATABASE_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        (InventoryStore::initialize(path.clone()).unwrap(), path)
    }

    fn insert_relic(store: &InventoryStore, item_id: u32, locked: bool) {
        let connection = Connection::open(&store.path).unwrap();
        connection
            .execute(
                "INSERT INTO relics(item_id, set_id, name, set_name, slot, rarity, level,
                                    main_stat, main_stat_value, location, locked, discard,
                                    source, updated_at)
                 VALUES(?1, 101, '测试遗器', '测试套装', 'Head', 5, 0,
                        'HP', 112, 'inventory', ?2, 0, 'test', 1)",
                params![item_id, locked],
            )
            .unwrap();
        connection
            .execute(
                "INSERT OR REPLACE INTO app_state(key, value) VALUES('current_uid', '123456789')",
                [],
            )
            .unwrap();
    }

    #[test]
    fn visual_key_ignores_internal_id_and_safety_flags() {
        let mut a = RelicFingerprint {
            item_id: 1,
            set_id: 101,
            name: "测试遗器".into(),
            set_name: "测试套装".into(),
            slot: "Head".into(),
            rarity: 5,
            level: 0,
            main_stat: "HP".into(),
            main_stat_value: 112.0,
            location: "inventory".into(),
            equipped_character_id: None,
            locked: false,
            discard: false,
            substats: Vec::new(),
        };
        let mut b = a.clone();
        b.item_id = 2;
        b.locked = true;
        b.discard = true;
        b.location = "equipped".into();
        assert_eq!(a.visual_key().unwrap(), b.visual_key().unwrap());
        a.level = 1;
        assert_ne!(a.visual_key().unwrap(), b.visual_key().unwrap());
    }

    #[test]
    fn queue_rejects_locked_relics_without_partial_insert() {
        let (store, path) = test_store();
        insert_relic(&store, 1, false);
        insert_relic(&store, 2, true);
        let result = store.add_cleanup_candidates(&CleanupCandidateRequest {
            item_ids: vec![1, 2],
        });
        assert!(matches!(result, Err(AppError::RelicCleanup(_))));
        assert!(store.list_cleanup_queue().unwrap().is_empty());
        drop(store);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn partial_visual_duplicate_is_frozen_as_ambiguous_and_history_survives_queue_removal() {
        let (store, path) = test_store();
        insert_relic(&store, 1, false);
        insert_relic(&store, 2, false);
        store
            .add_cleanup_candidates(&CleanupCandidateRequest { item_ids: vec![1] })
            .unwrap();
        let run = store.freeze_cleanup_run("model", "templates").unwrap();
        assert!(run.ambiguous_item_ids.contains(&1));
        store.remove_cleanup_candidates(&[1]).unwrap();
        let detail = store.cleanup_run_detail(run.run_id).unwrap();
        assert_eq!(detail.items.len(), 1);
        assert_eq!(detail.items[0].preview_status, "ambiguous");
        drop(store);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn queue_is_scoped_to_the_current_uid() {
        let (store, path) = test_store();
        insert_relic(&store, 1, false);
        store
            .add_cleanup_candidates(&CleanupCandidateRequest { item_ids: vec![1] })
            .unwrap();
        let connection = Connection::open(&store.path).unwrap();
        connection
            .execute(
                "UPDATE app_state SET value = '987654321' WHERE key = 'current_uid'",
                [],
            )
            .unwrap();
        assert!(store.list_cleanup_queue().unwrap().is_empty());
        assert!(store.freeze_cleanup_run("model", "templates").is_err());
        drop(store);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn freeze_rechecks_locked_state_after_queueing() {
        let (store, path) = test_store();
        insert_relic(&store, 1, false);
        store
            .add_cleanup_candidates(&CleanupCandidateRequest { item_ids: vec![1] })
            .unwrap();
        let connection = Connection::open(&store.path).unwrap();
        connection
            .execute("UPDATE relics SET locked = 1 WHERE item_id = 1", [])
            .unwrap();
        let error = store
            .freeze_cleanup_run("model", "templates")
            .unwrap_err()
            .to_string();
        assert!(error.contains("锁定或装备"));
        drop(store);
        let _ = std::fs::remove_file(path);
    }
}
