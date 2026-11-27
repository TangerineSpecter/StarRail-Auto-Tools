use rusqlite::{params, OptionalExtension};

use super::super::models::{current_game_version, InventoryStore};
use crate::{advisor::CharacterBuildAdvice, error::AppError};

fn key_prefix(character_id: u32) -> String {
    format!("build_advice:{}:{character_id}:", current_game_version())
}

impl InventoryStore {
    pub(crate) fn build_advice(
        &self,
        character_id: u32,
    ) -> Result<Option<CharacterBuildAdvice>, AppError> {
        let connection = self.connect()?;
        let stored: Option<String> = connection
            .query_row(
                "SELECT value FROM app_state
                 WHERE key = ?1 || COALESCE((SELECT value FROM app_state WHERE key = 'current_uid'), '')",
                [key_prefix(character_id)],
                |row| row.get(0),
            )
            .optional()?;
        Ok(stored.and_then(|value| serde_json::from_str(&value).ok()))
    }

    pub(crate) fn save_build_advice(
        &self,
        account_uid: Option<u32>,
        advice: &CharacterBuildAdvice,
    ) -> Result<(), AppError> {
        let uid = account_uid
            .map(|value| value.to_string())
            .unwrap_or_default();
        let key = format!("{}{uid}", key_prefix(advice.character_id));
        let value =
            serde_json::to_string(advice).map_err(|error| AppError::Database(error.to_string()))?;
        self.connect()?.execute(
            "INSERT INTO app_state(key, value)
             SELECT ?1, ?2
             WHERE COALESCE((SELECT value FROM app_state WHERE key = 'current_uid'), '') = ?3
             ON CONFLICT(key) DO UPDATE SET value = excluded.value
             WHERE json_extract(excluded.value, '$.searchedAt') >= json_extract(app_state.value, '$.searchedAt')
                OR json_extract(app_state.value, '$.searchedAt') IS NULL",
            params![key, value, uid],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn advice_persists_and_is_scoped_to_character_account_and_version() {
        let store = InventoryStore::test_store();
        let path = store.path.clone();
        let report = CharacterBuildAdvice {
            character_id: 8001,
            summary: "速度优先".to_owned(),
            searched_at: 20,
            ..Default::default()
        };
        assert_eq!(store.build_advice(8001).unwrap(), None);
        store.save_build_advice(None, &report).unwrap();
        drop(store);

        let store = InventoryStore::initialize(path).unwrap();
        assert_eq!(store.build_advice(8001).unwrap(), Some(report.clone()));
        assert_eq!(store.build_advice(8003).unwrap(), None);
        let previous_report = CharacterBuildAdvice {
            summary: "旧结果".to_owned(),
            searched_at: 10,
            ..report.clone()
        };
        store.save_build_advice(None, &previous_report).unwrap();
        assert_eq!(store.build_advice(8001).unwrap(), Some(report.clone()));

        let connection = store.connect().unwrap();
        connection
            .execute(
                "INSERT INTO app_state(key, value) VALUES ('current_uid', '12345')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO app_state(key, value) VALUES ('build_advice:0.0:8001:12345', ?1)",
                [serde_json::to_string(&report).unwrap()],
            )
            .unwrap();
        assert_eq!(store.build_advice(8001).unwrap(), None);
        store
            .save_build_advice(Some(12345), &previous_report)
            .unwrap();
        store.save_build_advice(None, &report).unwrap();
        assert_eq!(store.build_advice(8001).unwrap(), Some(previous_report));
    }
}
