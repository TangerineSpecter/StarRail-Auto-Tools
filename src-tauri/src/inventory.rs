use std::{
    collections::HashMap,
    fs::File,
    io::BufWriter,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{
    params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension, Row,
    Transaction,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::AppError;

const SCHEMA_VERSION: i64 = 4;
pub const PROTOCOL_VERSION: &str = "reliquary-v22.0.0 / HSR-4.4";

#[derive(Debug, Clone)]
pub struct InventoryStore {
    path: PathBuf,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum InventoryKind {
    Relic,
    LightCone,
    Character,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageQuery {
    #[serde(default = "default_page")]
    pub page: u32,
    #[serde(default = "default_page_size")]
    pub page_size: u32,
}

fn default_page() -> u32 {
    1
}

fn default_page_size() -> u32 {
    50
}

impl Default for PageQuery {
    fn default() -> Self {
        Self {
            page: default_page(),
            page_size: default_page_size(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PagedResult<T> {
    pub items: Vec<T>,
    pub total: u64,
    pub page: u32,
    pub page_size: u32,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InventorySummary {
    pub relics: u64,
    pub light_cones: u64,
    pub characters: u64,
    pub last_sync_at: Option<i64>,
    pub protocol_version: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RelicFilter {
    #[serde(flatten)]
    pub page: PageQuery,
    pub search: Option<String>,
    pub slots: Option<Vec<String>>,
    pub rarities: Option<Vec<u32>>,
    pub min_level: Option<u32>,
    pub max_level: Option<u32>,
    pub main_stats: Option<Vec<String>>,
    pub sub_stats: Option<Vec<String>>,
    pub min_substat_count: Option<u32>,
    pub max_substat_count: Option<u32>,
    pub locked: Option<bool>,
    pub discard: Option<bool>,
    pub equipped: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LightConeFilter {
    #[serde(flatten)]
    pub page: PageQuery,
    pub search: Option<String>,
    pub min_level: Option<u32>,
    pub max_level: Option<u32>,
    pub min_ascension: Option<u32>,
    pub superimposition: Option<u32>,
    pub locked: Option<bool>,
    pub equipped: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CharacterFilter {
    #[serde(flatten)]
    pub page: PageQuery,
    pub search: Option<String>,
    pub path: Option<String>,
    pub min_level: Option<u32>,
    pub max_level: Option<u32>,
    pub min_ascension: Option<u32>,
    pub eidolon: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelicSubstatItem {
    pub kind: String,
    pub position: u32,
    pub key: String,
    pub value: f64,
    pub count: u32,
    pub step: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelicListItem {
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
    pub locked: bool,
    pub discard: bool,
    pub source: String,
    pub updated_at: i64,
    pub substats: Vec<RelicSubstatItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LightConeListItem {
    pub item_id: u32,
    pub template_id: u32,
    pub name: String,
    pub level: u32,
    pub ascension: u32,
    pub superimposition: u32,
    pub location: String,
    pub locked: bool,
    pub source: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterListItem {
    pub character_id: u32,
    pub name: String,
    pub path: String,
    pub level: u32,
    pub ascension: u32,
    pub eidolon: u32,
    pub ability_version: u32,
    pub source: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryDetail {
    pub kind: InventoryKind,
    pub data: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteItemsRequest {
    pub kind: InventoryKind,
    pub ids: Vec<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearInventoryRequest {
    pub kind: Option<InventoryKind>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InventoryImport {
    pub metadata: ImportMetadata,
    pub relics: Vec<ImportRelic>,
    pub light_cones: Vec<ImportLightCone>,
    pub characters: Vec<ImportCharacter>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImportMetadata {
    pub uid: Option<u32>,
    pub trailblazer: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImportRelic {
    #[serde(deserialize_with = "deserialize_u32_any")]
    pub set_id: u32,
    pub name: String,
    pub slot: String,
    pub rarity: u32,
    pub level: u32,
    pub mainstat: String,
    pub substats: Vec<ImportSubstat>,
    #[serde(default)]
    pub reroll_substats: Option<Vec<ImportSubstat>>,
    #[serde(default)]
    pub preview_substats: Option<Vec<ImportSubstat>>,
    pub location: String,
    pub lock: bool,
    pub discard: bool,
    #[serde(deserialize_with = "deserialize_u32_any")]
    pub _uid: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ImportSubstat {
    pub key: String,
    pub value: f64,
    pub count: u32,
    pub step: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildTarget {
    pub stat_key: String,
    pub target: f64,
    pub priority: u32,
    pub minimum: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterBuildPlan {
    pub character_id: u32,
    pub cavern_mode: String,
    pub cavern_set_a: u32,
    pub cavern_set_b: Option<u32>,
    pub planar_set_id: u32,
    #[serde(default)]
    pub main_stats: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub targets: Vec<BuildTarget>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelicSetOption { pub set_id: u32, pub name: String }

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildRecommendationRequest { pub character_id: u32, #[serde(default)] pub include_equipped: bool }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildProgress { pub stat_key: String, pub current: f64, pub target: f64, pub gap: f64, pub minimum: f64, pub priority: u32 }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildRelicChoice { pub item_id: u32, pub name: String, pub slot: String, pub set_id: u32, pub main_stat: String, pub location: String, pub borrowed: bool }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildRecommendation { pub current: Vec<BuildProgress>, pub recommended: Option<Vec<BuildRelicChoice>>, pub recommended_progress: Option<Vec<BuildProgress>>, pub message: String }

#[derive(Debug, Clone, Deserialize)]
pub struct ImportLightCone {
    #[serde(deserialize_with = "deserialize_u32_any")]
    pub id: u32,
    pub name: String,
    pub level: u32,
    pub ascension: u32,
    pub superimposition: u32,
    pub location: String,
    pub lock: bool,
    #[serde(deserialize_with = "deserialize_u32_any")]
    pub _uid: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImportCharacter {
    #[serde(deserialize_with = "deserialize_u32_any")]
    pub id: u32,
    pub name: String,
    pub path: String,
    pub level: u32,
    pub ascension: u32,
    pub eidolon: u32,
    pub skills: Value,
    pub traces: Value,
    #[serde(default)]
    pub memosprite: Option<Value>,
    pub ability_version: u32,
}

fn deserialize_u32_any<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Number {
        Integer(u32),
        String(String),
    }

    match Number::deserialize(deserializer)? {
        Number::Integer(value) => Ok(value),
        Number::String(value) => value.parse().map_err(serde::de::Error::custom),
    }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AccountMismatch {
    pub existing_uid: u32,
    pub incoming_uid: u32,
}

pub type ApplyResult = Result<InventorySummary, AccountMismatch>;

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
                updated_at INTEGER NOT NULL
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
        let _ = connection.execute("ALTER TABLE relics ADD COLUMN main_stat_value REAL NOT NULL DEFAULT 0", []);
        let _ = connection.execute("ALTER TABLE character_build_targets ADD COLUMN minimum REAL NOT NULL DEFAULT 0", []);
        connection.execute("UPDATE character_build_targets SET minimum = target - max_gap", [])?;
        backfill_main_stat_values(connection)?;
        connection.execute("UPDATE schema_meta SET version = ?1", [SCHEMA_VERSION])?;
        Ok(())
    }

    pub fn summary(&self) -> Result<InventorySummary, AppError> {
        let connection = self.connect()?;
        summary_from_connection(&connection)
    }

    pub fn list_relic_sets(&self) -> Result<Vec<RelicSetOption>, AppError> {
        let connection = self.connect()?;
        let mut statement = connection.prepare("SELECT set_id, MIN(set_name) FROM relics GROUP BY set_id ORDER BY MIN(set_name)")?;
        let sets = statement.query_map([], |row| Ok(RelicSetOption { set_id: row.get(0)?, name: row.get(1)? }))?.collect::<Result<Vec<_>, _>>()?;
        Ok(sets)
    }

    pub fn build_plan(&self, character_id: u32) -> Result<Option<CharacterBuildPlan>, AppError> {
        let connection = self.connect()?;
        let row = connection.query_row(
            "SELECT cavern_mode, cavern_set_a, cavern_set_b, planar_set_id, main_stats_json FROM character_build_plans WHERE character_id = ?1",
            [character_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?, row.get::<_, Option<u32>>(2)?, row.get::<_, u32>(3)?, row.get::<_, String>(4)?))
        ).optional()?;
        let Some((cavern_mode, cavern_set_a, cavern_set_b, planar_set_id, main_stats_json)) = row else { return Ok(None) };
        let mut statement = connection.prepare("SELECT stat_key, target, priority, minimum FROM character_build_targets WHERE character_id = ?1 ORDER BY priority, stat_key")?;
        let targets = statement.query_map([character_id], |row| Ok(BuildTarget { stat_key: row.get(0)?, target: row.get(1)?, priority: row.get(2)?, minimum: row.get(3)? }))?.collect::<Result<Vec<_>, _>>()?;
        Ok(Some(CharacterBuildPlan { character_id, cavern_mode, cavern_set_a, cavern_set_b, planar_set_id, main_stats: serde_json::from_str(&main_stats_json).unwrap_or_default(), targets }))
    }

    pub fn save_build_plan(&self, plan: &CharacterBuildPlan) -> Result<(), AppError> {
        if !matches!(plan.cavern_mode.as_str(), "fourPiece" | "twoPlusTwo") || plan.targets.is_empty() || plan.targets.len() > 3 || (plan.cavern_mode == "twoPlusTwo" && plan.cavern_set_b.is_none()) {
            return Err(AppError::Database("毕业方案配置无效".to_owned()));
        }
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        transaction.execute("INSERT INTO character_build_plans(character_id,cavern_mode,cavern_set_a,cavern_set_b,planar_set_id,main_stats_json,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(character_id) DO UPDATE SET cavern_mode=excluded.cavern_mode,cavern_set_a=excluded.cavern_set_a,cavern_set_b=excluded.cavern_set_b,planar_set_id=excluded.planar_set_id,main_stats_json=excluded.main_stats_json,updated_at=excluded.updated_at", params![plan.character_id, plan.cavern_mode, plan.cavern_set_a, plan.cavern_set_b, plan.planar_set_id, serde_json::to_string(&plan.main_stats).map_err(|e| AppError::Database(e.to_string()))?, now_millis()])?;
        transaction.execute("DELETE FROM character_build_targets WHERE character_id = ?1", [plan.character_id])?;
        for target in &plan.targets {
            if target.minimum > target.target { return Err(AppError::Database("最低标准不能高于目标值".to_owned())); }
            transaction.execute("INSERT INTO character_build_targets(character_id,stat_key,target,priority,max_gap,minimum) VALUES(?1,?2,?3,?4,?5,?6)", params![plan.character_id, target.stat_key, target.target, target.priority, target.target - target.minimum, target.minimum])?;
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn delete_build_plan(&self, character_id: u32) -> Result<(), AppError> {
        self.connect()?.execute("DELETE FROM character_build_plans WHERE character_id = ?1", [character_id])?;
        Ok(())
    }

    pub fn recommend_build(&self, request: &BuildRecommendationRequest) -> Result<BuildRecommendation, AppError> {
        let Some(plan) = self.build_plan(request.character_id)? else { return Err(AppError::Database("请先保存该角色的毕业方案".to_owned())) };
        let connection = self.connect()?;
        let character_name: String = connection.query_row("SELECT name FROM characters WHERE character_id = ?1", [request.character_id], |row| row.get(0)).optional()?.ok_or_else(|| AppError::Database("角色不存在".to_owned()))?;
        let current = load_build_relics(&connection, Some(&character_name))?;
        let current_progress = progress_for(&plan.targets, &current);
        let candidates = build_candidates(&connection, &plan, request.include_equipped)?;
        let recommended = choose_build(&plan, candidates, &character_name);
        let recommended_progress = recommended.as_ref().map(|items| progress_for(&plan.targets, items));
        let message = if recommended.is_some() { "已按套装结构与属性优先级找到推荐组合。".to_owned() } else { "当前候选无法同时满足套装、主词条与属性缺口限制。".to_owned() };
        Ok(BuildRecommendation { current: current_progress, recommended: recommended.map(|items| items.into_iter().map(|item| item.into_choice(&character_name)).collect()), recommended_progress, message })
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

        self.apply_snapshot(import, false).map(Ok)
    }

    pub fn replace_account_and_apply(
        &self,
        import: &InventoryImport,
    ) -> Result<InventorySummary, AppError> {
        self.apply_snapshot(import, true)
    }

    fn apply_snapshot(
        &self,
        import: &InventoryImport,
        clear_first: bool,
    ) -> Result<InventorySummary, AppError> {
        let now = now_millis();
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;

        if clear_first {
            clear_all(&transaction)?;
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
                    location, locked, source, updated_at, last_seen_run
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'network', ?9, ?10)
                ON CONFLICT(item_id) DO UPDATE SET
                    template_id = excluded.template_id,
                    name = excluded.name,
                    level = excluded.level,
                    ascension = excluded.ascension,
                    superimposition = excluded.superimposition,
                    location = excluded.location,
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
                    character_id, name, path, level, ascension, eidolon,
                    skills_json, traces_json, memosprite_json, ability_version,
                    source, updated_at, last_seen_run
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'network', ?11, ?12)
                ON CONFLICT(character_id) DO UPDATE SET
                    name = excluded.name,
                    path = excluded.path,
                    level = excluded.level,
                    ascension = excluded.ascension,
                    eidolon = excluded.eidolon,
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
                let placeholders = std::iter::repeat("?")
                    .take(sub_stats.len())
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
                "location <> ''".to_owned()
            } else {
                "location = ''".to_owned()
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
                    location, locked, discard, source, updated_at
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
        push_number_filter(
            &mut clauses,
            &mut values,
            "superimposition",
            "=",
            filter.superimposition,
        );
        push_bool_filter(&mut clauses, &mut values, "locked", filter.locked);
        if let Some(equipped) = filter.equipped {
            clauses.push(if equipped {
                "location <> ''".to_owned()
            } else {
                "location = ''".to_owned()
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
                    location, locked, source, updated_at
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
        push_text_filter(&mut clauses, &mut values, "path", &filter.path);
        push_number_filter(&mut clauses, &mut values, "level", ">=", filter.min_level);
        push_number_filter(&mut clauses, &mut values, "level", "<=", filter.max_level);
        push_number_filter(
            &mut clauses,
            &mut values,
            "ascension",
            ">=",
            filter.min_ascension,
        );
        push_number_filter(&mut clauses, &mut values, "eidolon", "=", filter.eidolon);
        let where_sql = make_where(&clauses);
        let total = query_count(&connection, "characters", &where_sql, &values)?;
        let mut paged_values = values.clone();
        paged_values.push(SqlValue::Integer(filter.page.page_size as i64));
        paged_values.push(SqlValue::Integer(
            ((filter.page.page - 1) * filter.page.page_size) as i64,
        ));
        let sql = format!(
            "SELECT character_id, name, path, level, ascension, eidolon,
                    ability_version, source, updated_at
             FROM characters {where_sql}
             ORDER BY level DESC, eidolon DESC, character_id LIMIT ? OFFSET ?"
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

#[derive(Debug, Clone)]
struct BuildCandidate {
    item_id: u32, name: String, slot: String, set_id: u32, main_stat: String, main_stat_value: f64, location: String, stats: HashMap<String, f64>,
}

impl BuildCandidate {
    fn into_choice(self, character_name: &str) -> BuildRelicChoice {
        BuildRelicChoice { item_id: self.item_id, name: self.name, slot: self.slot, set_id: self.set_id, main_stat: self.main_stat, borrowed: !self.location.is_empty() && self.location != character_name, location: self.location }
    }
}

const BUILD_SLOTS: [&str; 6] = ["Head", "Hands", "Body", "Feet", "PlanarSphere", "LinkRope"];

fn load_build_relics(connection: &Connection, location: Option<&str>) -> Result<Vec<BuildCandidate>, AppError> {
    let mut statement = connection.prepare("SELECT item_id, name, slot, set_id, main_stat, main_stat_value, location FROM relics")?;
    let mut items = statement.query_map([], |row| Ok(BuildCandidate { item_id: row.get(0)?, name: row.get(1)?, slot: row.get(2)?, set_id: row.get(3)?, main_stat: row.get(4)?, main_stat_value: row.get(5)?, location: row.get(6)?, stats: HashMap::new() }))?.collect::<Result<Vec<_>, _>>()?;
    if let Some(name) = location { items.retain(|item| item.location == name); }
    let mut stat_statement = connection.prepare("SELECT stat_key, value FROM relic_substats WHERE relic_id = ?1 AND kind = 'normal'")?;
    for item in &mut items {
        *item.stats.entry(item.main_stat.clone()).or_default() += item.main_stat_value;
        for entry in stat_statement.query_map([item.item_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)))? { let (key, value) = entry?; *item.stats.entry(key).or_default() += value; }
    }
    Ok(items)
}

fn build_candidates(connection: &Connection, plan: &CharacterBuildPlan, include_equipped: bool) -> Result<Vec<BuildCandidate>, AppError> {
    let mut items = load_build_relics(connection, None)?;
    items.retain(|item| {
        let is_planar = matches!(item.slot.as_str(), "PlanarSphere" | "LinkRope");
        let allowed_set = if is_planar { item.set_id == plan.planar_set_id } else if plan.cavern_mode == "fourPiece" { item.set_id == plan.cavern_set_a } else { item.set_id == plan.cavern_set_a || Some(item.set_id) == plan.cavern_set_b };
        let allowed_main = plan.main_stats.get(&item.slot).map(|values| values.is_empty() || values.contains(&item.main_stat)).unwrap_or(false);
        let allowed_location = include_equipped || item.location.is_empty();
        allowed_set && allowed_main && allowed_location
    });
    Ok(items)
}

fn progress_for(targets: &[BuildTarget], relics: &[BuildCandidate]) -> Vec<BuildProgress> {
    let mut totals = HashMap::<String, f64>::new();
    for relic in relics { for (key, value) in &relic.stats { *totals.entry(key.clone()).or_default() += value; } }
    let mut output = targets.iter().map(|target| { let current = *totals.get(&target.stat_key).unwrap_or(&0.0); BuildProgress { stat_key: target.stat_key.clone(), current, target: target.target, gap: (target.target - current).max(0.0), minimum: target.minimum, priority: target.priority } }).collect::<Vec<_>>();
    output.sort_by_key(|item| item.priority);
    output
}

fn choose_build(plan: &CharacterBuildPlan, candidates: Vec<BuildCandidate>, character_name: &str) -> Option<Vec<BuildCandidate>> {
    let mut per_slot = BUILD_SLOTS.iter().map(|slot| candidates.iter().filter(|item| item.slot == *slot).cloned().collect::<Vec<_>>()).collect::<Vec<_>>();
    for (index, items) in per_slot.iter_mut().enumerate() {
        let sort_items = |items: &mut Vec<BuildCandidate>| {
            items.sort_by(|a, b| individual_key(&plan.targets, a).partial_cmp(&individual_key(&plan.targets, b)).unwrap_or(std::cmp::Ordering::Equal));
        };
        if plan.cavern_mode == "twoPlusTwo" && index < 4 {
            let slot_candidates = std::mem::take(items);
            let mut set_a = slot_candidates.iter().filter(|item| item.set_id == plan.cavern_set_a).cloned().collect::<Vec<_>>();
            let mut set_b = slot_candidates.iter().filter(|item| Some(item.set_id) == plan.cavern_set_b).cloned().collect::<Vec<_>>();
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
    if per_slot.iter().any(Vec::is_empty) { return None; }
    let mut best: Option<(Vec<f64>, Vec<BuildCandidate>)> = None;
    fn visit(index: usize, pools: &[Vec<BuildCandidate>], selected: &mut Vec<BuildCandidate>, plan: &CharacterBuildPlan, best: &mut Option<(Vec<f64>, Vec<BuildCandidate>)>) {
        if index == pools.len() {
            if plan.cavern_mode == "twoPlusTwo" {
                let a = selected[..4].iter().filter(|item| item.set_id == plan.cavern_set_a).count();
                let b = selected[..4].iter().filter(|item| Some(item.set_id) == plan.cavern_set_b).count();
                if a != 2 || b != 2 { return; }
            }
            let progress = progress_for(&plan.targets, selected);
            if progress.iter().any(|item| item.current < item.minimum) { return; }
            let key = progress.iter().map(|item| item.gap).collect::<Vec<_>>();
            if best.as_ref().map(|(old, _)| key.as_slice() < old.as_slice()).unwrap_or(true) { *best = Some((key, selected.clone())); }
            return;
        }
        for item in &pools[index] { selected.push(item.clone()); visit(index + 1, pools, selected, plan, best); selected.pop(); }
    }
    visit(0, &per_slot, &mut Vec::new(), plan, &mut best);
    let _ = character_name;
    best.map(|(_, items)| items)
}

fn individual_key(targets: &[BuildTarget], item: &BuildCandidate) -> f64 {
    targets.iter().map(|target| (target.target - item.stats.get(&target.stat_key).copied().unwrap_or(0.0)).max(0.0) * (1000.0 / (target.priority.max(1) as f64))).sum()
}

/// Static relic-main-affix growth table. Values are the in-game internal values
/// displayed after rounding; they depend only on rarity, enhancement level and key.
fn main_stat_value(rarity: u32, level: u32, stat_key: &str) -> f64 {
    let (base, per_level) = match stat_key {
        "HP" => (112.896, 39.5136),
        "ATK" => (56.448, 19.7568),
        "HP%" | "ATK%" | "Effect Hit Rate" => (6.912, 2.4192),
        "DEF%" => (8.64, 3.024),
        "SPD" => return match rarity { 5 => 4.032 + level as f64 * 1.4, 4 => 3.2256 + level as f64 * 1.1, 3 => 2.4192 + level as f64, 2 => 1.6128 + level as f64, _ => 0.0 },
        "CRIT Rate" => (5.184, 1.8144),
        "CRIT DMG" | "Break Effect" => (10.368, 3.6288),
        "Outgoing Healing Boost" => (5.5296, 1.93536),
        "Energy Regeneration Rate" => (3.1104, 1.08864),
        "Physical DMG Boost" | "Fire DMG Boost" | "Ice DMG Boost" | "Lightning DMG Boost" | "Wind DMG Boost" | "Quantum DMG Boost" | "Imaginary DMG Boost" => (6.2208, 2.17728),
        _ => return 0.0,
    };
    let scale = match rarity { 5 => 1.0, 4 => 0.8, 3 => 0.6, 2 => 0.4, _ => return 0.0 };
    (base + per_level * level as f64) * scale
}

fn backfill_main_stat_values(connection: &Connection) -> Result<(), AppError> {
    let mut statement = connection.prepare("SELECT item_id, rarity, level, main_stat FROM relics")?;
    let rows = statement.query_map([], |row| Ok((row.get::<_, u32>(0)?, row.get::<_, u32>(1)?, row.get::<_, u32>(2)?, row.get::<_, String>(3)?)))?.collect::<Result<Vec<_>, _>>()?;
    for (item_id, rarity, level, stat_key) in rows { connection.execute("UPDATE relics SET main_stat_value = ?1 WHERE item_id = ?2", params![main_stat_value(rarity, level, &stat_key), item_id])?; }
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
            location, locked, discard, source, updated_at, last_seen_run
        ) VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'network', ?12, ?13)
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

fn push_text_filter(
    clauses: &mut Vec<String>,
    values: &mut Vec<SqlValue>,
    column: &str,
    value: &Option<String>,
) {
    if let Some(value) = clean_filter(value) {
        clauses.push(format!("{column} = ?"));
        values.push(SqlValue::Text(value));
    }
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
        let placeholders = std::iter::repeat("?")
            .take(values_to_match.len())
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
        let placeholders = std::iter::repeat("?")
            .take(values_to_match.len())
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
        locked: row.get(10)?,
        discard: row.get(11)?,
        source: row.get(12)?,
        updated_at: row.get(13)?,
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
        locked: row.get(7)?,
        source: row.get(8)?,
        updated_at: row.get(9)?,
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
        ability_version: row.get(6)?,
        source: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn relic_detail(connection: &Connection, id: u32) -> Result<Option<Value>, AppError> {
    let relic = connection
        .query_row(
            "SELECT item_id, set_id, name, set_name, slot, rarity, level, main_stat, main_stat_value,
                    location, locked, discard, source, updated_at
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
                    location, locked, source, updated_at
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
    connection
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
        .map_err(AppError::from)
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
    fn build_plan_survives_inventory_clear() {
        let store = InventoryStore::test_store();
        let plan = CharacterBuildPlan {
            character_id: 1001, cavern_mode: "fourPiece".to_owned(), cavern_set_a: 101,
            cavern_set_b: None, planar_set_id: 201, main_stats: HashMap::new(),
            targets: vec![BuildTarget { stat_key: "SPD".to_owned(), target: 180.0, priority: 1, minimum: 170.0 }],
        };
        store.save_build_plan(&plan).unwrap();
        store.clear(None).unwrap();
        assert_eq!(store.build_plan(1001).unwrap().unwrap().targets[0].target, 180.0);
    }

    #[test]
    fn two_plus_two_optimizer_never_returns_four_plus_zero() {
        let plan = CharacterBuildPlan {
            character_id: 1, cavern_mode: "twoPlusTwo".to_owned(), cavern_set_a: 10,
            cavern_set_b: Some(11), planar_set_id: 20, main_stats: HashMap::new(),
            targets: vec![BuildTarget { stat_key: "SPD".to_owned(), target: 0.0, priority: 1, minimum: 0.0 }],
        };
        let mut candidates = Vec::new();
        for (index, slot) in BUILD_SLOTS.iter().enumerate() {
            let sets: Vec<u32> = if index < 4 { vec![10, 11] } else { vec![20] };
            for set_id in sets { candidates.push(BuildCandidate { item_id: candidates.len() as u32 + 1, name: "测试遗器".to_owned(), slot: (*slot).to_owned(), set_id, main_stat: "SPD".to_owned(), main_stat_value: 0.0, location: String::new(), stats: HashMap::new() }); }
        }
        let selected = choose_build(&plan, candidates, "测试角色").unwrap();
        assert_eq!(selected[..4].iter().filter(|item| item.set_id == 10).count(), 2);
        assert_eq!(selected[..4].iter().filter(|item| item.set_id == 11).count(), 2);
        assert!(selected[4..].iter().all(|item| item.set_id == 20));
    }

    #[test]
    fn calculates_fixed_main_stat_growth_from_rarity_and_level() {
        assert!((main_stat_value(5, 15, "SPD") - 25.032).abs() < 0.001);
        assert!((main_stat_value(5, 15, "HP") - 705.6).abs() < 0.001);
        assert!((main_stat_value(5, 15, "CRIT Rate") - 32.4).abs() < 0.001);
        assert!((main_stat_value(4, 12, "SPD") - 16.4256).abs() < 0.001);
    }
}
