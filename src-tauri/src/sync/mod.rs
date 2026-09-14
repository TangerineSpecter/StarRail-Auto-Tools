mod ftp;
mod settings;
mod sftp;
mod snapshot;
mod transport;
mod webdav;

use std::path::Path;

use serde::Serialize;

use crate::{
    error::AppError,
    inventory::{InventorySummary, SyncLocalState, SyncSnapshot},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotConflict {
    pub local_generated_at: i64,
    pub remote_generated_at: i64,
    pub remote_revision: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConflictConfirmation {
    pub local_generated_at: i64,
    pub remote_revision: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteSnapshotVersion {
    pub generated_at: i64,
    pub revision: String,
}

#[derive(Debug, Clone)]
pub struct DownloadedSnapshot {
    pub snapshot: SyncSnapshot,
    pub version: RemoteSnapshotVersion,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum SyncUploadResult {
    Completed,
    Conflict {
        local_generated_at: i64,
        remote_generated_at: i64,
        remote_revision: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum SyncDownloadResult {
    Completed {
        summary: InventorySummary,
    },
    Conflict {
        local_generated_at: i64,
        remote_generated_at: i64,
        remote_revision: Option<String>,
    },
}

pub use settings::{SyncProtocol, SyncSettings, SyncStore, WebDavSettings};
pub use transport::RemoteTransport;

pub async fn test(settings: &SyncSettings, known_hosts: &Path) -> Result<(), AppError> {
    dispatch(settings, known_hosts, |transport| async move {
        transport.test().await
    })
    .await
}

pub async fn upload_snapshot_checked(
    settings: &SyncSettings,
    known_hosts: &Path,
    snapshot: SyncSnapshot,
    local_state: SyncLocalState,
    confirmation: Option<ConflictConfirmation>,
) -> Result<Result<RemoteSnapshotVersion, SnapshotConflict>, AppError> {
    dispatch(settings, known_hosts, move |transport| async move {
        snapshot::upload_snapshot_checked(&transport, snapshot, local_state, confirmation).await
    })
    .await
}

pub async fn download_snapshot_checked(
    settings: &SyncSettings,
    known_hosts: &Path,
    local_state: SyncLocalState,
    confirmation: Option<ConflictConfirmation>,
) -> Result<Result<DownloadedSnapshot, SnapshotConflict>, AppError> {
    dispatch(settings, known_hosts, move |transport| async move {
        snapshot::download_snapshot_checked(&transport, local_state, confirmation).await
    })
    .await
}

pub async fn test_webdav(settings: &WebDavSettings) -> Result<(), AppError> {
    webdav::WebDavTransport::new(settings)?.test().await
}

async fn dispatch<F, Fut, T>(
    settings: &SyncSettings,
    known_hosts: &Path,
    action: F,
) -> Result<T, AppError>
where
    F: FnOnce(SyncTransport) -> Fut,
    Fut: std::future::Future<Output = Result<T, AppError>>,
{
    settings.validate_active()?;
    let transport = match settings.protocol {
        SyncProtocol::WebDav => {
            SyncTransport::WebDav(webdav::WebDavTransport::new(&settings.webdav)?)
        }
        SyncProtocol::Ftp => SyncTransport::Ftp(ftp::FtpTransport::new(&settings.ftp)?),
        SyncProtocol::Sftp => {
            SyncTransport::Sftp(sftp::SftpTransport::new(&settings.sftp, known_hosts)?)
        }
    };
    action(transport).await
}

enum SyncTransport {
    WebDav(webdav::WebDavTransport),
    Ftp(ftp::FtpTransport),
    Sftp(sftp::SftpTransport),
}

impl RemoteTransport for SyncTransport {
    async fn test(&self) -> Result<(), AppError> {
        match self {
            Self::WebDav(transport) => transport.test().await,
            Self::Ftp(transport) => transport.test().await,
            Self::Sftp(transport) => transport.test().await,
        }
    }

    async fn put(&self, file: &str, payload: Vec<u8>) -> Result<(), AppError> {
        match self {
            Self::WebDav(transport) => transport.put(file, payload).await,
            Self::Ftp(transport) => transport.put(file, payload).await,
            Self::Sftp(transport) => transport.put(file, payload).await,
        }
    }

    async fn get(&self, file: &str) -> Result<Vec<u8>, AppError> {
        match self {
            Self::WebDav(transport) => transport.get(file).await,
            Self::Ftp(transport) => transport.get(file).await,
            Self::Sftp(transport) => transport.get(file).await,
        }
    }

    async fn get_optional(&self, file: &str) -> Result<Option<Vec<u8>>, AppError> {
        match self {
            Self::WebDav(transport) => transport.get_optional(file).await,
            Self::Ftp(transport) => transport.get_optional(file).await,
            Self::Sftp(transport) => transport.get_optional(file).await,
        }
    }

    async fn put_many(&self, files: Vec<(String, Vec<u8>)>) -> Result<(), AppError> {
        match self {
            Self::WebDav(transport) => transport.put_many(files).await,
            Self::Ftp(transport) => transport.put_many(files).await,
            Self::Sftp(transport) => transport.put_many(files).await,
        }
    }
}
