use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use russh::keys::{HashAlg, PrivateKeyWithHashAlg};
use russh::{client, ChannelId};
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::OpenFlags;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::error::AppError;

use super::{
    settings::SftpSettings,
    transport::{
        assert_safe_filename, join_remote_path, normalize_remote_directory, parse_port,
        RemoteTransport,
    },
};

pub struct SftpTransport {
    settings: SftpSettings,
    known_hosts_path: PathBuf,
}

impl SftpTransport {
    pub fn new(settings: &SftpSettings, known_hosts: &Path) -> Result<Self, AppError> {
        settings.validate()?;
        Ok(Self {
            settings: settings.clone(),
            known_hosts_path: known_hosts.to_path_buf(),
        })
    }

    async fn with_session<T, F, Fut>(&self, action: F) -> Result<T, AppError>
    where
        F: FnOnce(SftpSession) -> Fut,
        Fut: std::future::Future<Output = Result<T, AppError>>,
    {
        let directory = normalize_remote_directory(&self.settings.remote_path)?;
        let (session, _handle) = connect(&self.settings, &self.known_hosts_path).await?;
        let channel = session
            .channel_open_session()
            .await
            .map_err(|error| AppError::Sync(format!("无法打开 SFTP 通道：{error}")))?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|error| AppError::Sync(format!("服务器不支持 SFTP：{error}")))?;
        let sftp = SftpSession::new(channel.into_stream())
            .await
            .map_err(|error| AppError::Sync(format!("无法初始化 SFTP：{error}")))?;
        sftp.canonicalize(&directory)
            .await
            .map_err(|error| AppError::Sync(format!("远端同步目录不存在或无权访问：{error}")))?;
        action(sftp).await
    }
}

impl RemoteTransport for SftpTransport {
    async fn test(&self) -> Result<(), AppError> {
        self.with_session(|_| async { Ok(()) }).await
    }

    async fn put(&self, file: &str, payload: Vec<u8>) -> Result<(), AppError> {
        let path = join_remote_path(&self.settings.remote_path, file)?;
        self.with_session(move |sftp| async move { write_file(&sftp, &path, payload).await })
            .await
    }

    async fn get(&self, file: &str) -> Result<Vec<u8>, AppError> {
        let path = join_remote_path(&self.settings.remote_path, file)?;
        self.with_session(move |sftp| async move { read_file(&sftp, &path).await })
            .await
    }

    async fn put_many(&self, files: Vec<(String, Vec<u8>)>) -> Result<(), AppError> {
        let directory = self.settings.remote_path.clone();
        self.with_session(move |sftp| async move {
            for (file, payload) in files {
                let path = join_remote_path(&directory, &file)?;
                write_file(&sftp, &path, payload).await?;
            }
            Ok(())
        })
        .await
    }
}

async fn write_file(sftp: &SftpSession, path: &str, payload: Vec<u8>) -> Result<(), AppError> {
    assert_safe_filename(path.rsplit('/').next().unwrap_or(path))?;
    let mut file = sftp
        .open_with_flags(
            path,
            OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
        )
        .await
        .map_err(|error| AppError::Sync(format!("无法上传同步文件：{error}")))?;
    file.write_all(&payload)
        .await
        .map_err(|error| AppError::Sync(format!("无法写入同步文件：{error}")))?;
    file.shutdown()
        .await
        .map_err(|error| AppError::Sync(format!("无法关闭同步文件：{error}")))
}

async fn read_file(sftp: &SftpSession, path: &str) -> Result<Vec<u8>, AppError> {
    assert_safe_filename(path.rsplit('/').next().unwrap_or(path))?;
    let mut file = sftp
        .open(path)
        .await
        .map_err(|error| AppError::Sync(format!("远端同步文件不存在：{error}")))?;
    let mut payload = Vec::new();
    file.read_to_end(&mut payload)
        .await
        .map_err(|error| AppError::Sync(format!("无法读取同步文件：{error}")))?;
    Ok(payload)
}

async fn connect(
    settings: &SftpSettings,
    known_hosts: &Path,
) -> Result<(client::Handle<TofuHandler>, Arc<Mutex<TofuState>>), AppError> {
    let host = settings.host.trim().to_owned();
    let port = parse_port(settings.port)?;
    let username = settings.username.trim().to_owned();
    let known = load_known_fingerprint(known_hosts, &host, port)?;
    let state = Arc::new(Mutex::new(TofuState {
        known,
        seen: None,
        mismatch: false,
    }));
    let config = client::Config::default();
    let handler = TofuHandler {
        state: Arc::clone(&state),
    };
    let mut session = client::connect(Arc::new(config), (host.as_str(), port), handler)
        .await
        .map_err(|error| {
            let mismatch = state.lock().map(|guard| guard.mismatch).unwrap_or(false);
            if mismatch {
                AppError::Sync(
                    "SFTP 服务器主机密钥已变化，若确认是同一台服务器，请删除本机 sftp-known-hosts.json 后再试"
                        .to_owned(),
                )
            } else {
                AppError::Sync(format!("无法连接 SFTP 服务器：{error}"))
            }
        })?;

    authenticate(&mut session, settings, &username).await?;

    if let Ok(mut guard) = state.lock() {
        if guard.known.is_none() {
            if let Some(fingerprint) = guard.seen.clone() {
                remember_fingerprint(known_hosts, &host, port, &fingerprint)?;
                guard.known = Some(fingerprint);
            }
        }
    }
    Ok((session, state))
}

async fn authenticate(
    session: &mut client::Handle<TofuHandler>,
    settings: &SftpSettings,
    username: &str,
) -> Result<(), AppError> {
    if !settings.private_key_path.trim().is_empty() {
        let passphrase = if settings.password.is_empty() {
            None
        } else {
            Some(settings.password.as_str())
        };
        let key = russh::keys::load_secret_key(settings.private_key_path.trim(), passphrase)
            .map_err(|error| AppError::Sync(format!("无法读取 SFTP 私钥：{error}")))?;
        let hash_key = PrivateKeyWithHashAlg::new(Arc::new(key), None);
        let result = session
            .authenticate_publickey(username, hash_key)
            .await
            .map_err(|error| AppError::Sync(format!("SFTP 私钥认证失败：{error}")))?;
        if result.success() {
            return Ok(());
        }
        return Err(AppError::Sync("SFTP 私钥认证失败".to_owned()));
    }

    let result = session
        .authenticate_password(username, settings.password.clone())
        .await
        .map_err(|error| AppError::Sync(format!("SFTP 密码认证失败：{error}")))?;
    if result.success() {
        Ok(())
    } else {
        Err(AppError::Sync("认证失败，请检查用户名和密码".to_owned()))
    }
}

#[derive(Debug)]
struct TofuState {
    known: Option<String>,
    seen: Option<String>,
    mismatch: bool,
}

struct TofuHandler {
    state: Arc<Mutex<TofuState>>,
}

impl client::Handler for TofuHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        let fingerprint = server_public_key.fingerprint(HashAlg::Sha256).to_string();
        let mut state = self.state.lock().map_err(|_| russh::Error::Disconnect)?;
        state.seen = Some(fingerprint.clone());
        if let Some(known) = &state.known {
            if known != &fingerprint {
                state.mismatch = true;
                return Ok(false);
            }
        }
        Ok(true)
    }

    async fn data(
        &mut self,
        _channel: ChannelId,
        _data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        Ok(())
    }
}

fn host_key(host: &str, port: u16) -> String {
    format!("{host}:{port}")
}

fn load_known_hosts(path: &Path) -> Result<HashMap<String, String>, AppError> {
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let file = fs::File::open(path)?;
    serde_json::from_reader(file)
        .map_err(|error| AppError::Sync(format!("本机 SFTP 主机密钥记录无效：{error}")))
}

fn load_known_fingerprint(path: &Path, host: &str, port: u16) -> Result<Option<String>, AppError> {
    Ok(load_known_hosts(path)?.get(&host_key(host, port)).cloned())
}

fn remember_fingerprint(
    path: &Path,
    host: &str,
    port: u16,
    fingerprint: &str,
) -> Result<(), AppError> {
    let mut known = load_known_hosts(path)?;
    known.insert(host_key(host, port), fingerprint.to_owned());
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let content =
        serde_json::to_vec_pretty(&known).map_err(|error| AppError::Sync(error.to_string()))?;
    fs::write(path, content)?;
    Ok(())
}
