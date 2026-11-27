use std::collections::HashMap;

use rusqlite::{params_from_iter, types::Value as SqlValue, Connection, OptionalExtension, Row};
use serde_json::{json, Value};

use super::super::models::*;
use super::build_plans::clear_character_build_scores;
use super::{
    clean_filter, clean_filters, clear_all, id_column_for_kind, make_where, now_millis,
    push_bool_filter, push_equipped_owner_search, push_number_filter, push_number_filters,
    push_text_filters, query_count, summary_from_connection, table_for_kind,
    touch_sync_local_updated_at, validate_page,
};
use crate::error::AppError;

impl InventoryStore {
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

    pub fn equipment_counts(&self) -> Result<InventoryEquipmentCounts, AppError> {
        let connection = self.connect()?;
        let mut relic_statement = connection
            .prepare("SELECT set_id, COUNT(*) FROM relics GROUP BY set_id ORDER BY set_id")?;
        let relics = relic_statement
            .query_map([], |row| {
                Ok(RelicSetOwnedCount {
                    set_id: row.get(0)?,
                    count: row.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let mut light_cone_statement = connection.prepare(
            "SELECT template_id, COUNT(*) FROM light_cones GROUP BY template_id ORDER BY template_id",
        )?;
        let light_cones = light_cone_statement
            .query_map([], |row| {
                Ok(LightConeOwnedCount {
                    template_id: row.get(0)?,
                    count: row.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(InventoryEquipmentCounts {
            relics,
            light_cones,
        })
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
            push_equipped_owner_search(
                &connection,
                &mut clauses,
                &mut values,
                &search,
                "(name LIKE ? OR set_name LIKE ? OR location LIKE ?)",
                3,
            )?;
        }
        push_number_filters(&mut clauses, &mut values, "set_id", &filter.set_ids);
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

        if !items.is_empty() {
            let placeholders = std::iter::repeat_n("?", items.len())
                .collect::<Vec<_>>()
                .join(", ");
            let id_values: Vec<SqlValue> = items
                .iter()
                .map(|item| SqlValue::Integer(item.item_id as i64))
                .collect();
            let mut substat_stmt = connection.prepare(&format!(
                "SELECT relic_id, kind, position, stat_key, value, count, step
                 FROM relic_substats
                 WHERE kind = 'normal' AND relic_id IN ({placeholders})
                 ORDER BY relic_id, position"
            ))?;
            let mut by_relic = HashMap::<u32, Vec<RelicSubstatItem>>::with_capacity(items.len());
            let substat_rows =
                substat_stmt.query_map(params_from_iter(id_values.iter()), |row| {
                    Ok((
                        row.get::<_, u32>(0)?,
                        RelicSubstatItem {
                            kind: row.get(1)?,
                            position: row.get(2)?,
                            key: row.get(3)?,
                            value: row.get(4)?,
                            count: row.get(5)?,
                            step: row.get(6)?,
                        },
                    ))
                })?;
            for row in substat_rows {
                let (relic_id, substat) = row?;
                by_relic.entry(relic_id).or_default().push(substat);
            }
            for item in &mut items {
                if let Some(substats) = by_relic.remove(&item.item_id) {
                    item.substats = substats;
                }
            }
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
        // Head/Hands always have a single fixed main stat; treat as configured even when
        // plans omit them so unequipped pieces are not flagged as "no target main stat".
        if plan_count > 0 {
            for &(slot, main) in FIXED_MAIN_STATS {
                allowed_main_stats.insert(slot.to_owned(), vec![main.to_owned()]);
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

    /// Returns relic main-stat scan results grouped by set → slot → main stat.
    /// No pagination needed — the GROUP BY query produces a compact summary.
    pub fn scan_relics_by_main_stat_grouped(&self) -> Result<RelicMainStatGroupedResult, AppError> {
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
        if plan_count > 0 {
            for &(slot, main) in FIXED_MAIN_STATS {
                allowed_main_stats.insert(slot.to_owned(), vec![main.to_owned()]);
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

        let sql = format!(
            "SELECT set_id, set_name, slot, main_stat, COUNT(*) AS cnt
             FROM relics {where_sql}
             GROUP BY set_id, set_name, slot, main_stat
             ORDER BY set_name ASC, set_id ASC, slot ASC, cnt DESC"
        );
        let mut statement = connection.prepare(&sql)?;

        // Slot display ordering.
        let slot_order: HashMap<&str, usize> = [
            ("Head", 0),
            ("Hands", 1),
            ("Body", 2),
            ("Feet", 3),
            ("PlanarSphere", 4),
            ("LinkRope", 5),
        ]
        .into_iter()
        .collect();

        let mut groups: Vec<RelicMainStatSetGroup> = Vec::new();
        let mut total: u64 = 0;

        let rows = statement.query_map(params_from_iter(values.iter()), |row| {
            Ok((
                row.get::<_, u32>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, u64>(4)?,
            ))
        })?;

        for row in rows {
            let (set_id, set_name, slot, main_stat, count) = row?;
            total += count;
            let group_index = match groups.iter().position(|g| g.set_id == set_id) {
                Some(index) => index,
                None => {
                    groups.push(RelicMainStatSetGroup {
                        set_id,
                        set_name: set_name.clone(),
                        parts: Vec::new(),
                    });
                    groups.len() - 1
                }
            };
            let set_group = &mut groups[group_index];
            match set_group.parts.iter_mut().find(|p| p.slot == slot) {
                Some(p) => {
                    p.stats.push(RelicMainStatEntry { main_stat, count });
                }
                None => {
                    set_group.parts.push(RelicMainStatPartGroup {
                        slot,
                        stats: vec![RelicMainStatEntry { main_stat, count }],
                    });
                }
            }
        }

        // Sort parts within each set by slot order.
        for set_group in &mut groups {
            set_group
                .parts
                .sort_by_key(|p| *slot_order.get(p.slot.as_str()).unwrap_or(&99));
        }

        Ok(RelicMainStatGroupedResult {
            groups,
            total,
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
            push_equipped_owner_search(
                &connection,
                &mut clauses,
                &mut values,
                &search,
                "(name LIKE ? OR location LIKE ?)",
                2,
            )?;
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
            "SELECT characters.character_id, characters.name, characters.path, characters.level,
                    characters.ascension, characters.eidolon,
                    character_build_plans.character_id IS NOT NULL,
                    NULLIF(character_build_plans.updated_at, 0),
                    NULLIF(character_build_plans.game_version, ''),
                    characters.ability_version, characters.source, characters.updated_at
             FROM characters
             LEFT JOIN character_build_plans
               ON character_build_plans.character_id = characters.character_id
             {where_sql}
             ORDER BY characters.rarity DESC, characters.level DESC, characters.eidolon DESC, characters.character_id
             LIMIT ? OFFSET ?"
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
        // Relic/character/light-cone deletes change equipped gear; drop derived scores.
        clear_character_build_scores(&transaction)?;
        if deleted > 0 {
            touch_sync_local_updated_at(&transaction, now_millis())?;
        }
        transaction.commit()?;
        Ok(deleted as u64)
    }

    pub fn clear(&self, kind: Option<InventoryKind>) -> Result<(), AppError> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        if let Some(kind) = kind {
            transaction.execute(&format!("DELETE FROM {}", table_for_kind(kind)), [])?;
            // Any inventory-table clear can desync equipped gear vs cached scores.
            clear_character_build_scores(&transaction)?;
        } else {
            clear_all(&transaction)?;
            clear_character_build_scores(&transaction)?;
            transaction.execute("DELETE FROM app_state", [])?;
        }
        touch_sync_local_updated_at(&transaction, now_millis())?;
        transaction.commit()?;
        Ok(())
    }
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

pub(super) fn map_light_cone(row: &Row<'_>) -> rusqlite::Result<LightConeListItem> {
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

pub(super) fn map_character(row: &Row<'_>) -> rusqlite::Result<CharacterListItem> {
    Ok(CharacterListItem {
        character_id: row.get(0)?,
        name: row.get(1)?,
        path: row.get(2)?,
        level: row.get(3)?,
        ascension: row.get(4)?,
        eidolon: row.get(5)?,
        has_build_plan: row.get(6)?,
        build_plan_updated_at: row.get(7)?,
        build_plan_game_version: row.get(8)?,
        ability_version: row.get(9)?,
        source: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

pub(super) fn relic_detail(connection: &Connection, id: u32) -> Result<Option<Value>, AppError> {
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

pub(super) fn light_cone_detail(
    connection: &Connection,
    id: u32,
) -> Result<Option<Value>, AppError> {
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

pub(super) fn load_character_details_batch(
    connection: &Connection,
    character_ids: &[u32],
) -> Result<HashMap<u32, Value>, AppError> {
    if character_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let placeholders = std::iter::repeat_n("?", character_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let id_values: Vec<SqlValue> = character_ids
        .iter()
        .map(|id| SqlValue::Integer(*id as i64))
        .collect();

    let mut char_stmt = connection.prepare(&format!(
        "SELECT character_id, name, path, level, ascension, eidolon,
                skills_json, traces_json, memosprite_json, ability_version,
                source, updated_at
         FROM characters
         WHERE character_id IN ({placeholders})"
    ))?;
    let mut details = HashMap::<u32, Value>::with_capacity(character_ids.len());
    let char_rows = char_stmt.query_map(params_from_iter(id_values.iter()), |row| {
        let character_id: u32 = row.get(0)?;
        let skills: String = row.get(6)?;
        let traces: String = row.get(7)?;
        let memosprite: Option<String> = row.get(8)?;
        Ok((
            character_id,
            json!({
                "characterId": character_id,
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
                "equippedRelics": [],
                "equippedLightCone": Value::Null,
            }),
        ))
    })?;
    for row in char_rows {
        let (character_id, detail) = row?;
        details.insert(character_id, detail);
    }
    if details.is_empty() {
        return Ok(details);
    }

    let mut relic_stmt = connection.prepare(&format!(
        "SELECT item_id, set_id, name, set_name, slot, rarity, level, main_stat, main_stat_value,
                location, equipped_character_id, locked, discard, source, updated_at
         FROM relics
         WHERE equipped_character_id IN ({placeholders})
         ORDER BY equipped_character_id, slot"
    ))?;
    let relics = relic_stmt
        .query_map(params_from_iter(id_values.iter()), map_relic)?
        .collect::<Result<Vec<_>, _>>()?;

    let mut substats_by_relic = HashMap::<u32, Vec<Value>>::with_capacity(relics.len());
    if !relics.is_empty() {
        let relic_placeholders = std::iter::repeat_n("?", relics.len())
            .collect::<Vec<_>>()
            .join(", ");
        let relic_id_values: Vec<SqlValue> = relics
            .iter()
            .map(|r| SqlValue::Integer(r.item_id as i64))
            .collect();
        let mut sub_stmt = connection.prepare(&format!(
            "SELECT relic_id, kind, position, stat_key, value, count, step
             FROM relic_substats
             WHERE relic_id IN ({relic_placeholders})
             ORDER BY relic_id, kind, position"
        ))?;
        let sub_rows = sub_stmt.query_map(params_from_iter(relic_id_values.iter()), |row| {
            Ok((
                row.get::<_, u32>(0)?,
                json!({
                    "kind": row.get::<_, String>(1)?,
                    "position": row.get::<_, u32>(2)?,
                    "key": row.get::<_, String>(3)?,
                    "value": row.get::<_, f64>(4)?,
                    "count": row.get::<_, u32>(5)?,
                    "step": row.get::<_, u32>(6)?,
                }),
            ))
        })?;
        for row in sub_rows {
            let (relic_id, substat) = row?;
            substats_by_relic.entry(relic_id).or_default().push(substat);
        }
    }

    let mut relics_by_char = HashMap::<u32, Vec<Value>>::new();
    for relic in relics {
        let Some(owner_id) = relic.equipped_character_id else {
            continue;
        };
        let item_id = relic.item_id;
        let mut value =
            serde_json::to_value(relic).map_err(|error| AppError::Database(error.to_string()))?;
        value["substats"] = Value::Array(substats_by_relic.remove(&item_id).unwrap_or_default());
        relics_by_char.entry(owner_id).or_default().push(value);
    }

    let mut lc_stmt = connection.prepare(&format!(
        "SELECT item_id, template_id, name, level, ascension, superimposition,
                location, equipped_character_id, locked, source, updated_at
         FROM light_cones
         WHERE equipped_character_id IN ({placeholders})"
    ))?;
    let mut lc_by_char = HashMap::<u32, Value>::new();
    let lc_rows = lc_stmt.query_map(params_from_iter(id_values.iter()), map_light_cone)?;
    for row in lc_rows {
        let lc = row?;
        if let Some(owner_id) = lc.equipped_character_id {
            if let std::collections::hash_map::Entry::Vacant(entry) = lc_by_char.entry(owner_id) {
                let value = serde_json::to_value(lc)
                    .map_err(|error| AppError::Database(error.to_string()))?;
                entry.insert(value);
            }
        }
    }

    for (character_id, detail) in &mut details {
        if let Some(equipped_relics) = relics_by_char.remove(character_id) {
            detail["equippedRelics"] = Value::Array(equipped_relics);
        }
        if let Some(equipped_lc) = lc_by_char.remove(character_id) {
            detail["equippedLightCone"] = equipped_lc;
        }
    }
    Ok(details)
}

pub(super) fn character_detail(
    connection: &Connection,
    id: u32,
) -> Result<Option<Value>, AppError> {
    Ok(load_character_details_batch(connection, &[id])?.remove(&id))
}
