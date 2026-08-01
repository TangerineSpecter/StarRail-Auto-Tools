use std::{collections::HashMap, path::PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub(crate) const SCHEMA_VERSION: i64 = 5;
pub const PROTOCOL_VERSION: &str = "reliquary-v22.0.0 / HSR-4.4";

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

#[derive(Debug, Clone, Deserialize)]
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
