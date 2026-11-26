use rusqlite::{Connection, OptionalExtension};

use super::super::models::*;
use crate::error::AppError;

impl InventoryStore {
    pub fn relic_optimizer_context(
        &self,
        character_id: u32,
    ) -> Result<RelicOptimizerContext, AppError> {
        let connection = self.connect()?;
        let character = connection
            .query_row(
                "SELECT character_id, name, path, level, ascension FROM characters WHERE character_id = ?1",
                [character_id],
                |row| {
                    Ok(RelicOptimizerCharacter {
                        character_id: row.get(0)?,
                        name: row.get(1)?,
                        path: row.get(2)?,
                        level: row.get(3)?,
                        ascension: row.get(4)?,
                    })
                },
            )
            .optional()?
            .ok_or_else(|| AppError::Database("角色不存在".to_owned()))?;
        let equipped_light_cone = connection
            .query_row(
                "SELECT item_id, template_id, name, level, ascension, superimposition
                 FROM light_cones WHERE equipped_character_id = ?1 LIMIT 1",
                [character_id],
                |row| {
                    Ok(RelicOptimizerLightCone {
                        item_id: row.get(0)?,
                        template_id: row.get(1)?,
                        name: row.get(2)?,
                        level: row.get(3)?,
                        ascension: row.get(4)?,
                        superimposition: row.get(5)?,
                    })
                },
            )
            .optional()?;
        Ok(RelicOptimizerContext {
            character,
            equipped_light_cone,
            relics: load_optimizer_relics(&connection, character_id)?,
        })
    }
}

fn load_optimizer_relics(
    connection: &Connection,
    character_id: u32,
) -> Result<Vec<RelicOptimizerRelic>, AppError> {
    let mut statement = connection.prepare(
        "SELECT relics.item_id, relics.set_id, relics.name, relics.set_name, relics.slot,
                relics.rarity, relics.level, relics.main_stat, relics.main_stat_value,
                relics.location, relics.equipped_character_id, relics.locked, relics.discard,
                relic_substats.kind, relic_substats.stat_key, relic_substats.value,
                relic_substats.count, relic_substats.step
         FROM relics
         LEFT JOIN relic_substats ON relic_substats.relic_id = relics.item_id
         WHERE relics.rarity = 5 OR relics.equipped_character_id = ?1
         ORDER BY relics.item_id, relic_substats.kind, relic_substats.position",
    )?;
    let mut rows = statement.query([character_id])?;
    let mut relics = Vec::<RelicOptimizerRelic>::new();
    while let Some(row) = rows.next()? {
        let item_id = row.get::<_, u32>(0)?;
        if relics.last().map(|item| item.item_id) != Some(item_id) {
            relics.push(RelicOptimizerRelic {
                item_id,
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
            });
        }
        if let (Some(kind), Some(key), Some(value), Some(count), Some(step)) = (
            row.get::<_, Option<String>>(13)?,
            row.get::<_, Option<String>>(14)?,
            row.get::<_, Option<f64>>(15)?,
            row.get::<_, Option<u32>>(16)?,
            row.get::<_, Option<u32>>(17)?,
        ) {
            if let Some(relic) = relics.last_mut() {
                relic.substats.push(RelicOptimizerSubstat {
                    kind,
                    key,
                    value,
                    count,
                    step,
                });
            }
        }
    }
    Ok(relics)
}

/// Static relic-main-affix growth table. Values are the in-game internal values
/// displayed after rounding; they depend only on rarity, enhancement level and key.
pub(super) fn main_stat_value(rarity: u32, level: u32, stat_key: &str) -> f64 {
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
