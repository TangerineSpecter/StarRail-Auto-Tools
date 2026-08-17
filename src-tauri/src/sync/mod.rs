mod ftp;
mod settings;
mod sftp;
mod snapshot;
mod transport;
mod webdav;

use std::path::Path;

use crate::{error::AppError, inventory::SyncSnapshot};

pub use settings::{SyncProtocol, SyncSettings, SyncStore, WebDavSettings};
pub use transport::RemoteTransport;

pub async fn test(settings: &SyncSettings, known_hosts: &Path) -> Result<(), AppError> {
    dispatch(settings, known_hosts, |transport| async move {
        transport.test().await
    })
    .await
}

pub async fn upload_snapshot(
    settings: &SyncSettings,
    known_hosts: &Path,
    snapshot: SyncSnapshot,
) -> Result<(), AppError> {
    dispatch(settings, known_hosts, move |transport| async move {
        snapshot::upload_snapshot(&transport, snapshot).await
    })
    .await
}

pub async fn download_snapshot(
    settings: &SyncSettings,
    known_hosts: &Path,
) -> Result<SyncSnapshot, AppError> {
    dispatch(settings, known_hosts, |transport| async move {
        snapshot::download_snapshot(&transport).await
    })
    .await
}

pub async fn test_webdav(settings: &WebDavSettings) -> Result<(), AppError> {
    webdav::WebDavTransport::new(settings)?.test().await
}

pub async fn upload_webdav_snapshot(
    settings: &WebDavSettings,
    snapshot: SyncSnapshot,
) -> Result<(), AppError> {
    snapshot::upload_snapshot(&webdav::WebDavTransport::new(settings)?, snapshot).await
}

pub async fn download_webdav_snapshot(settings: &WebDavSettings) -> Result<SyncSnapshot, AppError> {
    snapshot::download_snapshot(&webdav::WebDavTransport::new(settings)?).await
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

    async fn put_many(&self, files: Vec<(String, Vec<u8>)>) -> Result<(), AppError> {
        match self {
            Self::WebDav(transport) => transport.put_many(files).await,
            Self::Ftp(transport) => transport.put_many(files).await,
            Self::Sftp(transport) => transport.put_many(files).await,
        }
    }
}
