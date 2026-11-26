use std::{collections::HashMap, fs::File, io::BufWriter, path::Path};

use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Value};

use super::super::models::*;
use crate::error::AppError;

impl InventoryStore {
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

pub(super) fn export_relics(connection: &Connection) -> Result<Vec<Value>, AppError> {
    let mut substat_stmt = connection.prepare(
        "SELECT relic_id, kind, stat_key, value, count, step
         FROM relic_substats
         ORDER BY relic_id, kind, position",
    )?;
    let mut substats_by_relic = HashMap::<u32, (Vec<Value>, Vec<Value>, Vec<Value>)>::new();
    let substat_rows = substat_stmt.query_map([], |row| {
        Ok((
            row.get::<_, u32>(0)?,
            row.get::<_, String>(1)?,
            json!({
                "key": row.get::<_, String>(2)?,
                "value": row.get::<_, f64>(3)?,
                "count": row.get::<_, u32>(4)?,
                "step": row.get::<_, u32>(5)?,
            }),
        ))
    })?;
    for row in substat_rows {
        let (relic_id, kind, entry) = row?;
        let buckets = substats_by_relic.entry(relic_id).or_default();
        match kind.as_str() {
            "normal" => buckets.0.push(entry),
            "reroll" => buckets.1.push(entry),
            "preview" => buckets.2.push(entry),
            _ => {}
        }
    }

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
        let (substats, reroll_substats, preview_substats) =
            substats_by_relic.remove(&id).unwrap_or_default();
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

pub(super) fn export_light_cones(connection: &Connection) -> Result<Vec<Value>, AppError> {
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

pub(super) fn export_characters(connection: &Connection) -> Result<Vec<Value>, AppError> {
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
