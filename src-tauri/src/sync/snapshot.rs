use serde::{Deserialize, Serialize};

use crate::{
    error::AppError,
    inventory::{
        supports_sync_format_version, SyncBuildPlansFile, SyncInventoryFile, SyncManifest,
        SyncSnapshot, SyncTeamsFile, SYNC_FORMAT_VERSION,
    },
};

use super::transport::{assert_safe_filename, RemoteTransport};

pub const MANIFEST_FILE: &str = "manifest.json";
pub const INVENTORY_FILE_PREFIX: &str = "inventory-";
pub const BUILD_PLANS_FILE_PREFIX: &str = "build-plans-";
pub const TEAMS_FILE_PREFIX: &str = "teams-";

fn encode<T: Serialize>(value: &T) -> Result<Vec<u8>, AppError> {
    serde_json::to_vec_pretty(value)
        .map_err(|error| AppError::Sync(format!("无法生成同步文件：{error}")))
}

fn decode<T: for<'de> Deserialize<'de>>(payload: &[u8], file: &str) -> Result<T, AppError> {
    serde_json::from_slice(payload)
        .map_err(|error| AppError::Sync(format!("远端 {file} 格式无效：{error}")))
}

fn versioned_file(prefix: &str, generated_at: i64) -> String {
    format!("{prefix}{generated_at}.json")
}

pub fn find_snapshot_file(manifest: &SyncManifest, prefix: &str) -> Result<String, AppError> {
    let files = manifest
        .files
        .iter()
        .filter(|file| {
            file.starts_with(prefix)
                && file.ends_with(".json")
                && !file.contains('/')
                && !file.contains('\\')
        })
        .collect::<Vec<_>>();
    if files.len() != 1 {
        return Err(AppError::Sync(format!(
            "同步清单缺少有效的 {prefix} 数据文件"
        )));
    }
    Ok(files[0].to_owned())
}

pub async fn upload_snapshot<T: RemoteTransport>(
    transport: &T,
    snapshot: SyncSnapshot,
) -> Result<(), AppError> {
    let inventory_file = versioned_file(INVENTORY_FILE_PREFIX, snapshot.generated_at);
    let build_plans_file = versioned_file(BUILD_PLANS_FILE_PREFIX, snapshot.generated_at);
    let teams_file = versioned_file(TEAMS_FILE_PREFIX, snapshot.generated_at);
    let inventory = SyncInventoryFile {
        format_version: SYNC_FORMAT_VERSION,
        inventory: snapshot.inventory,
    };
    let build_plans = SyncBuildPlansFile {
        format_version: SYNC_FORMAT_VERSION,
        build_plans: snapshot.build_plans,
        build_layouts: snapshot.build_layouts,
    };
    let teams = SyncTeamsFile {
        format_version: SYNC_FORMAT_VERSION,
        teams: snapshot.teams,
    };
    let manifest = SyncManifest {
        format_version: SYNC_FORMAT_VERSION,
        generated_at: snapshot.generated_at,
        source: snapshot.source,
        files: vec![
            inventory_file.clone(),
            build_plans_file.clone(),
            teams_file.clone(),
        ],
    };
    // Files are immutable per upload. Publishing the manifest last leaves the preceding
    // complete snapshot readable even if this upload only reaches one data file.
    transport
        .put_many(vec![
            (inventory_file, encode(&inventory)?),
            (build_plans_file, encode(&build_plans)?),
            (teams_file, encode(&teams)?),
            (MANIFEST_FILE.to_owned(), encode(&manifest)?),
        ])
        .await
}

pub async fn download_snapshot<T: RemoteTransport>(
    transport: &T,
) -> Result<SyncSnapshot, AppError> {
    let manifest: SyncManifest = decode(&transport.get(MANIFEST_FILE).await?, MANIFEST_FILE)?;
    if !supports_sync_format_version(manifest.format_version) {
        return Err(AppError::Sync(format!(
            "不支持的同步数据版本：{}",
            manifest.format_version
        )));
    }
    let inventory_file = find_snapshot_file(&manifest, INVENTORY_FILE_PREFIX)?;
    let build_plans_file = find_snapshot_file(&manifest, BUILD_PLANS_FILE_PREFIX)?;
    assert_safe_filename(&inventory_file)?;
    assert_safe_filename(&build_plans_file)?;
    let inventory: SyncInventoryFile =
        decode(&transport.get(&inventory_file).await?, &inventory_file)?;
    let build_plans: SyncBuildPlansFile =
        decode(&transport.get(&build_plans_file).await?, &build_plans_file)?;
    if inventory.format_version != manifest.format_version
        || build_plans.format_version != manifest.format_version
    {
        return Err(AppError::Sync("同步文件版本与清单不一致".to_owned()));
    }

    // v1/v2 backups have no teams file; treat as empty personal settings.
    let teams = if manifest.format_version >= SYNC_FORMAT_VERSION {
        let teams_file = find_snapshot_file(&manifest, TEAMS_FILE_PREFIX)?;
        assert_safe_filename(&teams_file)?;
        let teams_payload: SyncTeamsFile = decode(&transport.get(&teams_file).await?, &teams_file)?;
        if teams_payload.format_version != manifest.format_version {
            return Err(AppError::Sync("同步文件版本与清单不一致".to_owned()));
        }
        teams_payload.teams
    } else {
        Vec::new()
    };

    Ok(SyncSnapshot {
        format_version: manifest.format_version,
        generated_at: manifest.generated_at,
        source: manifest.source,
        inventory: inventory.inventory,
        build_plans: build_plans.build_plans,
        build_layouts: build_plans.build_layouts,
        teams,
    })
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use super::*;
    use crate::inventory::{ImportMetadata, InventoryImport};
    use crate::sync::transport::{put_files_sequentially, RemoteTransport};

    #[derive(Default)]
    struct MemoryTransport {
        files: Mutex<HashMap<String, Vec<u8>>>,
        put_order: Mutex<Vec<String>>,
    }

    impl RemoteTransport for MemoryTransport {
        async fn test(&self) -> Result<(), AppError> {
            Ok(())
        }

        async fn put(&self, file: &str, payload: Vec<u8>) -> Result<(), AppError> {
            assert_safe_filename(file)?;
            self.put_order.lock().unwrap().push(file.to_owned());
            self.files.lock().unwrap().insert(file.to_owned(), payload);
            Ok(())
        }

        async fn get(&self, file: &str) -> Result<Vec<u8>, AppError> {
            self.files
                .lock()
                .unwrap()
                .get(file)
                .cloned()
                .ok_or_else(|| AppError::Sync("远端同步文件不存在".to_owned()))
        }

        async fn put_many(&self, files: Vec<(String, Vec<u8>)>) -> Result<(), AppError> {
            put_files_sequentially(self, files).await
        }
    }

    fn sample_snapshot() -> SyncSnapshot {
        SyncSnapshot {
            format_version: SYNC_FORMAT_VERSION,
            generated_at: 1_700_000_000_000,
            source: "test".to_owned(),
            inventory: InventoryImport {
                metadata: ImportMetadata {
                    uid: Some(1),
                    trailblazer: None,
                },
                relics: Vec::new(),
                light_cones: Vec::new(),
                characters: Vec::new(),
            },
            build_plans: Vec::new(),
            build_layouts: Vec::new(),
            teams: Vec::new(),
        }
    }

    fn block_on<F: std::future::Future>(future: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(future)
    }

    #[test]
    fn uploads_versioned_files_and_publishes_manifest_last() {
        let transport = MemoryTransport::default();
        block_on(upload_snapshot(&transport, sample_snapshot())).unwrap();
        assert_eq!(
            transport.put_order.lock().unwrap().as_slice(),
            [
                "inventory-1700000000000.json",
                "build-plans-1700000000000.json",
                "teams-1700000000000.json",
                MANIFEST_FILE
            ]
        );
        let restored = block_on(download_snapshot(&transport)).unwrap();
        assert_eq!(restored.format_version, SYNC_FORMAT_VERSION);
        assert_eq!(restored.generated_at, 1_700_000_000_000);
        assert_eq!(restored.inventory.metadata.uid, Some(1));
    }

    #[test]
    fn rejects_manifest_file_paths_outside_the_sync_directory() {
        let manifest = SyncManifest {
            format_version: SYNC_FORMAT_VERSION,
            generated_at: 1,
            source: "test".to_owned(),
            files: vec![
                "../inventory-1.json".to_owned(),
                "build-plans-1.json".to_owned(),
                "teams-1.json".to_owned(),
            ],
        };
        assert!(find_snapshot_file(&manifest, INVENTORY_FILE_PREFIX).is_err());
    }

    #[test]
    fn download_rejects_version_mismatch_without_using_partial_files() {
        let transport = MemoryTransport::default();
        block_on(upload_snapshot(&transport, sample_snapshot())).unwrap();
        let mut manifest: serde_json::Value = serde_json::from_slice(
            &transport
                .files
                .lock()
                .unwrap()
                .get(MANIFEST_FILE)
                .cloned()
                .unwrap(),
        )
        .unwrap();
        manifest["formatVersion"] = serde_json::json!(99);
        transport.files.lock().unwrap().insert(
            MANIFEST_FILE.to_owned(),
            serde_json::to_vec(&manifest).unwrap(),
        );
        let error = block_on(download_snapshot(&transport)).unwrap_err();
        assert!(error.to_string().contains("不支持的同步数据版本"));
    }
}
