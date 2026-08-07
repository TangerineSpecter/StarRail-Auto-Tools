use std::{collections::HashMap, path::PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub(crate) const SCHEMA_VERSION: i64 = 12;
pub const PROTOCOL_VERSION: &str = "reliquary-v22.0.0 / HSR-4.4";

/// Head / Hands have a single game-fixed main stat (not user plan goals).
pub(crate) const FIXED_MAIN_STATS: &[(&str, &str)] = &[("Head", "HP"), ("Hands", "ATK")];

pub(crate) fn fixed_main_stat_for_slot(slot: &str) -> Option<&'static str> {
    FIXED_MAIN_STATS
        .iter()
        .find(|(name, _)| *name == slot)
        .map(|(_, main)| *main)
}

#[derive(Debug, Clone)]
pub struct InventoryStore {
    pub(crate) path: PathBuf,
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
    /// User-authored team compositions (not game inventory).
    #[serde(default)]
    pub teams: u64,
    pub last_sync_at: Option<i64>,
    pub protocol_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryImportResult {
    pub summary: InventorySummary,
    pub warnings: Vec<String>,
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
    pub superimposition: Option<Vec<u32>>,
    pub locked: Option<bool>,
    pub equipped: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CharacterFilter {
    #[serde(flatten)]
    pub page: PageQuery,
    pub search: Option<String>,
    pub names: Option<Vec<String>>,
    pub path: Option<Vec<String>>,
    pub min_level: Option<u32>,
    pub max_level: Option<u32>,
    pub min_ascension: Option<u32>,
    pub eidolon: Option<Vec<u32>>,
    pub has_build_plan: Option<bool>,
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
    pub equipped_character_id: Option<u32>,
    pub locked: bool,
    pub discard: bool,
    pub source: String,
    pub updated_at: i64,
    pub substats: Vec<RelicSubstatItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelicMainStatScanResult {
    pub items: Vec<RelicListItem>,
    pub total: u64,
    pub page: u32,
    pub page_size: u32,
    pub plan_count: u64,
    pub allowed_main_stats: HashMap<String, Vec<String>>,
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
    pub equipped_character_id: Option<u32>,
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
    pub has_build_plan: bool,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryImport {
    pub metadata: ImportMetadata,
    pub relics: Vec<ImportRelic>,
    pub light_cones: Vec<ImportLightCone>,
    pub characters: Vec<ImportCharacter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportMetadata {
    pub uid: Option<u32>,
    pub trailblazer: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    #[serde(skip)]
    pub equipped_character_id: Option<u32>,
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
    #[serde(default)]
    pub effective_substats: Vec<String>,
    /// Optional free-text note shown on the graduation dashboard.
    #[serde(default)]
    pub note: String,
    /// Per-plan substat weights for Stat Score (0–1). Empty → client infers defaults.
    #[serde(default)]
    pub substat_weights: HashMap<String, f64>,
    /// Minimum relic potential % for quality-pass (default 40).
    #[serde(default = "default_min_potential_pct")]
    pub min_potential_pct: f64,
    /// Optional SPD breakpoint target for the SPD helper (0 = unset).
    #[serde(default)]
    pub spd_target: f64,
}

fn default_min_potential_pct() -> f64 {
    40.0
}

/// Maximum character length for a build-plan note (Unicode scalar values).
pub const MAX_BUILD_PLAN_NOTE_LEN: usize = 500;

/// Maximum character length for a team name (Unicode scalar values).
pub const MAX_TEAM_NAME_LEN: usize = 64;

/// Maximum character length for a team note (Unicode scalar values).
pub const MAX_TEAM_NOTE_LEN: usize = 500;

/// Fixed party size for team compositions.
pub const TEAM_SLOT_COUNT: usize = 4;

/// Trim and clamp a build-plan note to the shared frontend/backend limit.
pub fn normalize_build_plan_note(note: &str) -> String {
    let trimmed = note.trim();
    if trimmed.chars().count() <= MAX_BUILD_PLAN_NOTE_LEN {
        trimmed.to_owned()
    } else {
        trimmed.chars().take(MAX_BUILD_PLAN_NOTE_LEN).collect()
    }
}

/// Trim and clamp a team name; empty after trim is invalid (caller must check).
pub fn normalize_team_name(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.chars().count() <= MAX_TEAM_NAME_LEN {
        trimmed.to_owned()
    } else {
        trimmed.chars().take(MAX_TEAM_NAME_LEN).collect()
    }
}

/// Trim and clamp a team note.
pub fn normalize_team_note(note: &str) -> String {
    let trimmed = note.trim();
    if trimmed.chars().count() <= MAX_TEAM_NOTE_LEN {
        trimmed.to_owned()
    } else {
        trimmed.chars().take(MAX_TEAM_NOTE_LEN).collect()
    }
}

/// Cached build-quality summary for a character (derived; recomputed by the client).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterBuildScore {
    pub character_id: u32,
    pub letter_grade: String,
    pub potential_pct: f64,
    pub completion_pct: f64,
    pub relic_count: u32,
    /// True when scored with a saved build plan (false = default weights).
    pub has_plan: bool,
    pub computed_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMember {
    pub character_id: u32,
    pub name: String,
    pub path: String,
    pub level: u32,
    /// False when the character row is missing from inventory.
    pub owned: bool,
    /// Cached score when available; null if never computed or invalidated.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<CharacterBuildScore>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Team {
    pub team_id: u32,
    pub name: String,
    pub note: String,
    /// Always length 4; empty slots are null.
    pub members: Vec<Option<TeamMember>>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamInput {
    pub team_id: Option<u32>,
    pub name: String,
    #[serde(default)]
    pub note: String,
    /// Must be length 4; null slots are empty.
    pub character_ids: Vec<Option<u32>>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TeamFilter {
    #[serde(flatten)]
    pub page: PageQuery,
    pub search: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildPlanExcelImportResult {
    pub imported: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildDashboardEntry {
    pub plan: CharacterBuildPlan,
    pub character: Value,
    pub display_order: i64,
    pub pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildDashboardLayout {
    pub character_id: u32,
    pub display_order: i64,
    pub pinned: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelicSetRecommendedCharacter {
    pub character_id: u32,
    pub name: String,
    pub main_stats: HashMap<String, Vec<String>>,
    pub effective_substats: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelicSetOption {
    pub set_id: u32,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildRecommendationRequest {
    pub character_id: u32,
    #[serde(default)]
    pub include_equipped: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildProgress {
    pub stat_key: String,
    pub current: f64,
    pub target: f64,
    pub gap: f64,
    pub minimum: f64,
    pub priority: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildRelicChoice {
    pub item_id: u32,
    pub name: String,
    pub slot: String,
    pub set_id: u32,
    pub main_stat: String,
    pub location: String,
    pub borrowed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildRecommendation {
    pub current: Vec<BuildProgress>,
    pub recommended: Option<Vec<BuildRelicChoice>>,
    pub recommended_progress: Option<Vec<BuildProgress>>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportLightCone {
    #[serde(deserialize_with = "deserialize_u32_any")]
    pub id: u32,
    pub name: String,
    pub level: u32,
    pub ascension: u32,
    pub superimposition: u32,
    pub location: String,
    #[serde(skip)]
    pub equipped_character_id: Option<u32>,
    pub lock: bool,
    #[serde(deserialize_with = "deserialize_u32_any")]
    pub _uid: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

pub const SYNC_FORMAT_VERSION: u32 = 3;
/// Original inventory + build-plans snapshot without dashboard layouts.
pub const LEGACY_SYNC_FORMAT_VERSION: u32 = 1;
/// Snapshot that added build dashboard layouts but no local teams.
pub const SYNC_FORMAT_VERSION_V2: u32 = 2;

pub fn supports_sync_format_version(version: u32) -> bool {
    matches!(
        version,
        LEGACY_SYNC_FORMAT_VERSION | SYNC_FORMAT_VERSION_V2 | SYNC_FORMAT_VERSION
    )
}

/// Local team composition for WebDAV upload/download (personal settings, not game data).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamSyncRecord {
    pub team_id: u32,
    pub name: String,
    #[serde(default)]
    pub note: String,
    /// Always length 4 when saved by this client.
    pub character_ids: Vec<Option<u32>>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Internal aggregate used by the repository when restoring a complete WebDAV backup.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSnapshot {
    pub format_version: u32,
    pub generated_at: i64,
    pub source: String,
    pub inventory: InventoryImport,
    #[serde(default)]
    pub build_plans: Vec<CharacterBuildPlan>,
    #[serde(default)]
    pub build_layouts: Vec<BuildDashboardLayout>,
    /// Present from format version 3; empty when restoring older backups.
    #[serde(default)]
    pub teams: Vec<TeamSyncRecord>,
}

/// Code-owned index of the files in one WebDAV sync directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncManifest {
    pub format_version: u32,
    pub generated_at: i64,
    pub source: String,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncInventoryFile {
    pub format_version: u32,
    pub inventory: InventoryImport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncBuildPlansFile {
    pub format_version: u32,
    pub build_plans: Vec<CharacterBuildPlan>,
    #[serde(default)]
    pub build_layouts: Vec<BuildDashboardLayout>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncTeamsFile {
    pub format_version: u32,
    #[serde(default)]
    pub teams: Vec<TeamSyncRecord>,
}

pub(crate) fn deserialize_u32_any<'de, D>(deserializer: D) -> Result<u32, D::Error>
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
