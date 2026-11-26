use std::collections::{HashMap, HashSet};

use rusqlite::{
    params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension, Row,
    Transaction,
};

use super::super::models::*;
use super::{clean_filter, now_millis, touch_sync_local_updated_at, validate_page};
use crate::error::AppError;

impl InventoryStore {
    pub fn list_teams(&self, filter: &TeamFilter) -> Result<PagedResult<Team>, AppError> {
        validate_page(&filter.page)?;
        let connection = self.connect()?;
        let mut clauses = Vec::new();
        let mut values = Vec::new();
        if let Some(search) = clean_filter(&filter.search) {
            clauses.push("(name LIKE ? OR note LIKE ?)".to_owned());
            let pattern = format!("%{search}%");
            values.push(SqlValue::Text(pattern.clone()));
            values.push(SqlValue::Text(pattern));
        }
        let where_sql = if clauses.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", clauses.join(" AND "))
        };
        let total: u64 = connection.query_row(
            &format!("SELECT COUNT(*) FROM teams {where_sql}"),
            params_from_iter(values.iter()),
            |row| row.get(0),
        )?;
        let offset = ((filter.page.page - 1) * filter.page.page_size) as i64;
        let limit = filter.page.page_size as i64;
        let list_sql = format!(
            "SELECT team_id, name, note, slot0, slot1, slot2, slot3, created_at, updated_at
             FROM teams
             {where_sql}
             ORDER BY updated_at DESC, team_id DESC
             LIMIT {limit} OFFSET {offset}"
        );
        let mut statement = connection.prepare(&list_sql)?;
        let raw_teams = statement
            .query_map(params_from_iter(values.iter()), team_row_from_sqlite)?
            .collect::<Result<Vec<_>, _>>()?;
        let items = hydrate_teams_batch(&connection, raw_teams)?;
        Ok(PagedResult {
            items,
            total,
            page: filter.page.page,
            page_size: filter.page.page_size,
        })
    }

    pub fn get_team(&self, team_id: u32) -> Result<Team, AppError> {
        let connection = self.connect()?;
        let mut statement = connection.prepare(
            "SELECT team_id, name, note, slot0, slot1, slot2, slot3, created_at, updated_at
             FROM teams WHERE team_id = ?1",
        )?;
        let raw = statement
            .query_row([team_id], team_row_from_sqlite)
            .optional()?
            .ok_or_else(|| AppError::Database("配队不存在".to_owned()))?;
        hydrate_team(&connection, raw)
    }

    pub fn save_team(&self, input: &TeamInput) -> Result<Team, AppError> {
        let name = normalize_team_name(&input.name);
        if name.is_empty() {
            return Err(AppError::Database("配队名称不能为空".to_owned()));
        }
        let note = normalize_team_note(&input.note);
        if input.character_ids.len() != TEAM_SLOT_COUNT {
            return Err(AppError::Database("配队必须包含 4 个角色槽位".to_owned()));
        }
        let slots = normalize_team_slots(&input.character_ids)?;
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        // Existing orphan slots may be kept on update; only newly assigned members must exist.
        let previous_slots: HashSet<u32> = if let Some(existing_id) = input.team_id {
            transaction
                .query_row(
                    "SELECT slot0, slot1, slot2, slot3 FROM teams WHERE team_id = ?1",
                    [existing_id],
                    |row| {
                        Ok([
                            row.get::<_, Option<u32>>(0)?,
                            row.get::<_, Option<u32>>(1)?,
                            row.get::<_, Option<u32>>(2)?,
                            row.get::<_, Option<u32>>(3)?,
                        ])
                    },
                )
                .optional()?
                .into_iter()
                .flatten()
                .flatten()
                .collect()
        } else {
            HashSet::new()
        };
        for slot in slots.iter().flatten() {
            if previous_slots.contains(slot) {
                continue;
            }
            let exists: bool = transaction
                .query_row(
                    "SELECT 1 FROM characters WHERE character_id = ?1",
                    [*slot],
                    |_| Ok(true),
                )
                .optional()?
                .unwrap_or(false);
            if !exists {
                return Err(AppError::Database(format!(
                    "角色 {slot} 不在背包档案中，无法加入配队"
                )));
            }
        }
        let now = now_millis();
        let team_id = if let Some(existing_id) = input.team_id {
            let updated = transaction.execute(
                "UPDATE teams
                 SET name = ?1, note = ?2, slot0 = ?3, slot1 = ?4, slot2 = ?5, slot3 = ?6,
                     updated_at = ?7
                 WHERE team_id = ?8",
                params![
                    name,
                    note,
                    slots[0],
                    slots[1],
                    slots[2],
                    slots[3],
                    now,
                    existing_id
                ],
            )?;
            if updated == 0 {
                return Err(AppError::Database("配队不存在".to_owned()));
            }
            existing_id
        } else {
            transaction.execute(
                "INSERT INTO teams(name, note, slot0, slot1, slot2, slot3, created_at, updated_at)
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![name, note, slots[0], slots[1], slots[2], slots[3], now, now],
            )?;
            transaction.last_insert_rowid() as u32
        };
        touch_sync_local_updated_at(&transaction, now)?;
        transaction.commit()?;
        self.get_team(team_id)
    }

    pub fn delete_team(&self, team_id: u32) -> Result<(), AppError> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        let deleted = transaction.execute("DELETE FROM teams WHERE team_id = ?1", [team_id])?;
        if deleted == 0 {
            return Err(AppError::Database("配队不存在".to_owned()));
        }
        touch_sync_local_updated_at(&transaction, now_millis())?;
        transaction.commit()?;
        Ok(())
    }
}

struct TeamRow {
    team_id: u32,
    name: String,
    note: String,
    slots: [Option<u32>; TEAM_SLOT_COUNT],
    created_at: i64,
    updated_at: i64,
}

fn team_row_from_sqlite(row: &Row<'_>) -> rusqlite::Result<TeamRow> {
    Ok(TeamRow {
        team_id: row.get(0)?,
        name: row.get(1)?,
        note: row.get(2)?,
        slots: [row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?],
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn normalize_team_slots(
    character_ids: &[Option<u32>],
) -> Result<[Option<u32>; TEAM_SLOT_COUNT], AppError> {
    let mut slots = [None; TEAM_SLOT_COUNT];
    let mut seen = HashSet::new();
    for (index, id) in character_ids.iter().enumerate().take(TEAM_SLOT_COUNT) {
        if let Some(character_id) = id {
            if !seen.insert(*character_id) {
                return Err(AppError::Database(
                    "同一配队内不能重复选择同一角色".to_owned(),
                ));
            }
            slots[index] = Some(*character_id);
        }
    }
    Ok(slots)
}

fn hydrate_teams_batch(connection: &Connection, rows: Vec<TeamRow>) -> Result<Vec<Team>, AppError> {
    if rows.is_empty() {
        return Ok(Vec::new());
    }
    let unique_ids: Vec<u32> = rows
        .iter()
        .flat_map(|row| row.slots.into_iter().flatten())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let mut scores_by_char = HashMap::<u32, CharacterBuildScore>::new();
    let mut chars_by_id = HashMap::<u32, (String, String, u32)>::new();
    if !unique_ids.is_empty() {
        let placeholders = std::iter::repeat_n("?", unique_ids.len())
            .collect::<Vec<_>>()
            .join(", ");
        let id_values: Vec<SqlValue> = unique_ids
            .iter()
            .map(|id| SqlValue::Integer(*id as i64))
            .collect();
        let mut score_stmt = connection.prepare(&format!(
            "SELECT character_id, letter_grade, potential_pct, completion_pct,
                    relic_count, has_plan, computed_at
             FROM character_build_scores
             WHERE character_id IN ({placeholders})"
        ))?;
        for row in score_stmt.query_map(params_from_iter(id_values.iter()), |row| {
            Ok(CharacterBuildScore {
                character_id: row.get(0)?,
                letter_grade: row.get(1)?,
                potential_pct: row.get(2)?,
                completion_pct: row.get(3)?,
                relic_count: row.get(4)?,
                has_plan: row.get(5)?,
                computed_at: row.get(6)?,
            })
        })? {
            let score = row?;
            scores_by_char.insert(score.character_id, score);
        }

        let mut char_stmt = connection.prepare(&format!(
            "SELECT character_id, name, path, level
             FROM characters
             WHERE character_id IN ({placeholders})"
        ))?;
        for row in char_stmt.query_map(params_from_iter(id_values.iter()), |row| {
            Ok((
                row.get::<_, u32>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, u32>(3)?,
            ))
        })? {
            let (character_id, name, path, level) = row?;
            chars_by_id.insert(character_id, (name, path, level));
        }
    }

    let mut teams = Vec::with_capacity(rows.len());
    for row in rows {
        let mut members = Vec::with_capacity(TEAM_SLOT_COUNT);
        for slot in row.slots {
            members.push(
                slot.map(|character_id| match chars_by_id.get(&character_id) {
                    Some((name, path, level)) => TeamMember {
                        character_id,
                        name: name.clone(),
                        path: path.clone(),
                        level: *level,
                        owned: true,
                        score: scores_by_char.get(&character_id).cloned(),
                    },
                    None => TeamMember {
                        character_id,
                        name: format!("未知角色 #{character_id}"),
                        path: String::new(),
                        level: 0,
                        owned: false,
                        score: None,
                    },
                }),
            );
        }
        teams.push(Team {
            team_id: row.team_id,
            name: row.name,
            note: row.note,
            members,
            created_at: row.created_at,
            updated_at: row.updated_at,
        });
    }
    Ok(teams)
}

fn hydrate_team(connection: &Connection, row: TeamRow) -> Result<Team, AppError> {
    hydrate_teams_batch(connection, vec![row])?
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Database("配队不存在".to_owned()))
}

pub(super) fn list_team_sync_records(
    connection: &Connection,
) -> Result<Vec<TeamSyncRecord>, AppError> {
    let mut statement = connection.prepare(
        "SELECT team_id, name, note, slot0, slot1, slot2, slot3, created_at, updated_at
         FROM teams
         ORDER BY team_id ASC",
    )?;
    let rows = statement.query_map([], team_row_from_sqlite)?;
    let mut teams = Vec::new();
    for row in rows {
        let raw = row?;
        teams.push(TeamSyncRecord {
            team_id: raw.team_id,
            name: raw.name,
            note: raw.note,
            character_ids: raw.slots.into_iter().collect(),
            created_at: raw.created_at,
            updated_at: raw.updated_at,
        });
    }
    Ok(teams)
}

/// Replace all teams from a WebDAV snapshot. Empty input leaves the table empty after wipe.
pub(super) fn replace_teams_in_transaction(
    transaction: &Transaction<'_>,
    teams: &[TeamSyncRecord],
) -> Result<(), AppError> {
    for team in teams {
        let name = normalize_team_name(&team.name);
        if name.is_empty() {
            return Err(AppError::Database("同步配队名称不能为空".to_owned()));
        }
        if team.character_ids.len() != TEAM_SLOT_COUNT {
            return Err(AppError::Database(
                "同步配队必须包含 4 个角色槽位".to_owned(),
            ));
        }
        // Sync restores planning data as-is; missing characters surface as orphan slots in UI.
        let slots = normalize_team_slots(&team.character_ids)?;
        let note = normalize_team_note(&team.note);
        transaction.execute(
            "INSERT INTO teams(
                team_id, name, note, slot0, slot1, slot2, slot3, created_at, updated_at
             ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                team.team_id,
                name,
                note,
                slots[0],
                slots[1],
                slots[2],
                slots[3],
                team.created_at,
                team.updated_at
            ],
        )?;
    }
    Ok(())
}
