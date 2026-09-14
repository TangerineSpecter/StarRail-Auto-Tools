use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{
    error::AppError,
    inventory::{
        supports_sync_format_version, SyncBuildPlansFile, SyncInventoryFile, SyncLocalState,
        SyncManifest, SyncSnapshot, SyncTeamsFile, SYNC_FORMAT_VERSION,
    },
};

use super::{
    transport::{assert_safe_filename, RemoteTransport},
    ConflictConfirmation, DownloadedSnapshot, RemoteSnapshotVersion, SnapshotConflict,
};

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

fn versioned_file(prefix: &str, generated_at: i64, revision: &str) -> String {
    format!("{prefix}{generated_at}-{}.json", &revision[..12])
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

fn manifest_version(payload: &[u8], manifest: &SyncManifest) -> RemoteSnapshotVersion {
    RemoteSnapshotVersion {
        generated_at: manifest.generated_at,
        revision: manifest
            .revision
            .clone()
            .unwrap_or_else(|| format!("{:x}", Sha256::digest(payload))),
    }
}

pub async fn remote_version<T: RemoteTransport>(
    transport: &T,
) -> Result<Option<RemoteSnapshotVersion>, AppError> {
    let Some(payload) = transport.get_optional(MANIFEST_FILE).await? else {
        return Ok(None);
    };
    let manifest: SyncManifest = decode(&payload, MANIFEST_FILE)?;
    if !supports_sync_format_version(manifest.format_version) {
        return Err(AppError::Sync(format!(
            "不支持的同步数据版本：{}",
            manifest.format_version
        )));
    }
    Ok(Some(manifest_version(&payload, &manifest)))
}

pub async fn upload_snapshot_checked<T: RemoteTransport>(
    transport: &T,
    snapshot: SyncSnapshot,
    local_state: SyncLocalState,
    confirmation: Option<ConflictConfirmation>,
) -> Result<Result<RemoteSnapshotVersion, SnapshotConflict>, AppError> {
    if snapshot.generated_at != local_state.generated_at {
        return Err(AppError::Sync(
            "准备上传期间本地数据已变化，请重试".to_owned(),
        ));
    }
    let remote = remote_version(transport).await?;
    let confirmed = confirmation.as_ref().is_some_and(|expected| {
        expected.local_generated_at == snapshot.generated_at
            && remote.as_ref().map(|value| value.revision.as_str())
                == Some(expected.remote_revision.as_str())
    });
    let remote_changed = remote.as_ref().is_some_and(|value| {
        local_state.remote_revision.as_deref() != Some(value.revision.as_str())
    });
    if (confirmation.is_some() && !confirmed) || (confirmation.is_none() && remote_changed) {
        return Ok(Err(SnapshotConflict {
            local_generated_at: snapshot.generated_at,
            remote_generated_at: remote.as_ref().map(|value| value.generated_at).unwrap_or(0),
            remote_revision: remote.map(|value| value.revision),
        }));
    }
    Ok(Ok(upload_snapshot(transport, snapshot).await?))
}

pub async fn download_snapshot_checked<T: RemoteTransport>(
    transport: &T,
    local_state: SyncLocalState,
    confirmation: Option<ConflictConfirmation>,
) -> Result<Result<DownloadedSnapshot, SnapshotConflict>, AppError> {
    let downloaded = download_snapshot(transport).await?;
    let confirmed = confirmation.as_ref().is_some_and(|expected| {
        expected.local_generated_at == local_state.generated_at
            && expected.remote_revision == downloaded.version.revision
    });
    if local_state.is_dirty() && !confirmed {
        return Ok(Err(SnapshotConflict {
            local_generated_at: local_state.generated_at,
            remote_generated_at: downloaded.version.generated_at,
            remote_revision: Some(downloaded.version.revision),
        }));
    }
    Ok(Ok(downloaded))
}

pub async fn upload_snapshot<T: RemoteTransport>(
    transport: &T,
    snapshot: SyncSnapshot,
) -> Result<RemoteSnapshotVersion, AppError> {
    let generated_at = snapshot.generated_at;
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
    let inventory_payload = encode(&inventory)?;
    let build_plans_payload = encode(&build_plans)?;
    let teams_payload = encode(&teams)?;
    let mut revision_hasher = Sha256::new();
    revision_hasher.update(&inventory_payload);
    revision_hasher.update(&build_plans_payload);
    revision_hasher.update(&teams_payload);
    let revision = format!("{:x}", revision_hasher.finalize());
    let inventory_file = versioned_file(INVENTORY_FILE_PREFIX, generated_at, &revision);
    let build_plans_file = versioned_file(BUILD_PLANS_FILE_PREFIX, generated_at, &revision);
    let teams_file = versioned_file(TEAMS_FILE_PREFIX, generated_at, &revision);
    let manifest = SyncManifest {
        format_version: SYNC_FORMAT_VERSION,
        generated_at,
        source: snapshot.source,
        files: vec![
            inventory_file.clone(),
            build_plans_file.clone(),
            teams_file.clone(),
        ],
        revision: Some(revision),
    };
    // Files are immutable per upload. Publishing the manifest last leaves the preceding
    // complete snapshot readable even if this upload only reaches one data file.
    let manifest_payload = encode(&manifest)?;
    let version = manifest_version(&manifest_payload, &manifest);
    transport
        .put_many(vec![
            (inventory_file, inventory_payload),
            (build_plans_file, build_plans_payload),
            (teams_file, teams_payload),
            (MANIFEST_FILE.to_owned(), manifest_payload),
        ])
        .await?;
    Ok(version)
}

pub async fn download_snapshot<T: RemoteTransport>(
    transport: &T,
) -> Result<DownloadedSnapshot, AppError> {
    let manifest_payload = transport.get(MANIFEST_FILE).await?;
    let manifest: SyncManifest = decode(&manifest_payload, MANIFEST_FILE)?;
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
    let inventory_payload = transport.get(&inventory_file).await?;
    let build_plans_payload = transport.get(&build_plans_file).await?;
    let inventory: SyncInventoryFile = decode(&inventory_payload, &inventory_file)?;
    let build_plans: SyncBuildPlansFile = decode(&build_plans_payload, &build_plans_file)?;
    if inventory.format_version != manifest.format_version
        || build_plans.format_version != manifest.format_version
    {
        return Err(AppError::Sync("同步文件版本与清单不一致".to_owned()));
    }

    // v1/v2 backups have no teams file; treat as empty personal settings.
    let (teams, teams_payload) = if manifest.format_version >= SYNC_FORMAT_VERSION {
        let teams_file = find_snapshot_file(&manifest, TEAMS_FILE_PREFIX)?;
        assert_safe_filename(&teams_file)?;
        let payload = transport.get(&teams_file).await?;
        let teams_file_data: SyncTeamsFile = decode(&payload, &teams_file)?;
        if teams_file_data.format_version != manifest.format_version {
            return Err(AppError::Sync("同步文件版本与清单不一致".to_owned()));
        }
        (teams_file_data.teams, Some(payload))
    } else {
        (Vec::new(), None)
    };

    if let Some(expected_revision) = manifest.revision.as_deref() {
        let mut hasher = Sha256::new();
        hasher.update(&inventory_payload);
        hasher.update(&build_plans_payload);
        if let Some(payload) = &teams_payload {
            hasher.update(payload);
        }
        if format!("{:x}", hasher.finalize()) != expected_revision {
            return Err(AppError::Sync(
                "远端同步文件与清单 revision 不一致".to_owned(),
            ));
        }
    }

    let version = manifest_version(&manifest_payload, &manifest);
    Ok(DownloadedSnapshot {
        snapshot: SyncSnapshot {
            format_version: manifest.format_version,
            generated_at: manifest.generated_at,
            source: manifest.source,
            inventory: inventory.inventory,
            build_plans: build_plans.build_plans,
            build_layouts: build_plans.build_layouts,
            teams,
        },
        version,
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

        async fn get_optional(&self, file: &str) -> Result<Option<Vec<u8>>, AppError> {
            Ok(self.files.lock().unwrap().get(file).cloned())
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

    fn local_state(generated_at: i64, remote_revision: Option<String>) -> SyncLocalState {
        SyncLocalState {
            generated_at,
            last_synced_generated_at: remote_revision.as_ref().map(|_| generated_at),
            remote_revision,
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
        let put_order = transport.put_order.lock().unwrap();
        assert_eq!(put_order.len(), 4);
        assert!(put_order[0].starts_with("inventory-1700000000000-"));
        assert!(put_order[1].starts_with("build-plans-1700000000000-"));
        assert!(put_order[2].starts_with("teams-1700000000000-"));
        assert_eq!(put_order[3], MANIFEST_FILE);
        drop(put_order);
        let restored = block_on(download_snapshot(&transport)).unwrap();
        assert_eq!(restored.snapshot.format_version, SYNC_FORMAT_VERSION);
        assert_eq!(restored.snapshot.generated_at, 1_700_000_000_000);
        assert_eq!(restored.snapshot.inventory.metadata.uid, Some(1));
    }

    #[test]
    fn reports_changed_remote_without_relying_on_clock_order() {
        let transport = MemoryTransport::default();
        let mut remote = sample_snapshot();
        remote.generated_at = 500;
        let _remote_version = block_on(upload_snapshot(&transport, remote)).unwrap();
        transport.put_order.lock().unwrap().clear();

        let mut local = sample_snapshot();
        local.generated_at = 1_000;
        let conflict = block_on(upload_snapshot_checked(
            &transport,
            local,
            local_state(1_000, None),
            None,
        ))
        .unwrap()
        .unwrap_err();
        assert_eq!(conflict.local_generated_at, 1_000);
        assert_eq!(conflict.remote_generated_at, 500);
        assert!(transport.put_order.lock().unwrap().is_empty());
    }

    #[test]
    fn rejects_confirmation_after_remote_revision_changes() {
        let transport = MemoryTransport::default();
        let first = block_on(upload_snapshot(&transport, sample_snapshot())).unwrap();
        let mut changed = sample_snapshot();
        changed.inventory.metadata.uid = Some(2);
        let second = block_on(upload_snapshot(&transport, changed)).unwrap();
        assert_ne!(first.revision, second.revision);

        let local = sample_snapshot();
        let conflict = block_on(upload_snapshot_checked(
            &transport,
            local,
            local_state(1_700_000_000_000, Some(first.revision.clone())),
            Some(ConflictConfirmation {
                local_generated_at: 1_700_000_000_000,
                remote_revision: first.revision,
            }),
        ))
        .unwrap()
        .unwrap_err();
        assert_eq!(conflict.remote_revision, Some(second.revision));
    }

    #[test]
    fn reports_newer_local_snapshot_without_download_restore() {
        let transport = MemoryTransport::default();
        let mut remote = sample_snapshot();
        remote.generated_at = 1_000;
        let remote_version = block_on(upload_snapshot(&transport, remote)).unwrap();

        let conflict = block_on(download_snapshot_checked(
            &transport,
            SyncLocalState {
                generated_at: 2_000,
                last_synced_generated_at: Some(1_000),
                remote_revision: Some(remote_version.revision.clone()),
            },
            None,
        ))
        .unwrap()
        .unwrap_err();
        assert_eq!(conflict.local_generated_at, 2_000);
        assert_eq!(conflict.remote_generated_at, 1_000);

        let restored = block_on(download_snapshot_checked(
            &transport,
            SyncLocalState {
                generated_at: 2_000,
                last_synced_generated_at: Some(1_000),
                remote_revision: Some(remote_version.revision.clone()),
            },
            Some(ConflictConfirmation {
                local_generated_at: 2_000,
                remote_revision: remote_version.revision,
            }),
        ))
        .unwrap()
        .unwrap();
        assert_eq!(restored.snapshot.generated_at, 1_000);
    }

    #[test]
    fn rejects_manifest_file_paths_outside_the_sync_directory() {
        let manifest = SyncManifest {
            format_version: SYNC_FORMAT_VERSION,
            generated_at: 1,
            source: "test".to_owned(),
            revision: None,
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

    #[test]
    fn download_rejects_payload_that_does_not_match_manifest_revision() {
        let transport = MemoryTransport::default();
        block_on(upload_snapshot(&transport, sample_snapshot())).unwrap();
        let manifest: SyncManifest =
            serde_json::from_slice(transport.files.lock().unwrap().get(MANIFEST_FILE).unwrap())
                .unwrap();
        let inventory_file = find_snapshot_file(&manifest, INVENTORY_FILE_PREFIX).unwrap();
        let mut inventory: serde_json::Value = serde_json::from_slice(
            transport
                .files
                .lock()
                .unwrap()
                .get(&inventory_file)
                .unwrap(),
        )
        .unwrap();
        inventory["inventory"]["metadata"]["uid"] = serde_json::json!(2);
        transport.files.lock().unwrap().insert(
            inventory_file,
            serde_json::to_vec_pretty(&inventory).unwrap(),
        );

        let error = block_on(download_snapshot(&transport)).unwrap_err();
        assert!(error.to_string().contains("revision 不一致"));
    }
}
