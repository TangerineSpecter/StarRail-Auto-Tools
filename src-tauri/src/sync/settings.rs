use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppError;

use super::transport::{normalize_remote_directory, parse_port};

const SYNC_SETTINGS_FILE: &str = "sync-settings.json";
const LEGACY_WEBDAV_SETTINGS_FILE: &str = "webdav-settings.json";
const KNOWN_HOSTS_FILE: &str = "sftp-known-hosts.json";

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SyncProtocol {
    #[default]
    #[serde(rename = "webdav", alias = "webDav")]
    WebDav,
    Ftp,
    Sftp,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavSettings {
    #[serde(default)]
    pub server_url: String,
    #[serde(default)]
    pub remote_path: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FtpSettings {
    #[serde(default)]
    pub host: String,
    #[serde(default = "default_ftp_port")]
    pub port: u16,
    #[serde(default)]
    pub remote_path: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub secure: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpSettings {
    #[serde(default)]
    pub host: String,
    #[serde(default = "default_sftp_port")]
    pub port: u16,
    #[serde(default)]
    pub remote_path: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub private_key_path: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSettings {
    #[serde(default)]
    pub protocol: SyncProtocol,
    #[serde(default)]
    pub webdav: WebDavSettings,
    #[serde(default)]
    pub ftp: FtpSettings,
    #[serde(default)]
    pub sftp: SftpSettings,
}

fn default_ftp_port() -> u16 {
    21
}

fn default_sftp_port() -> u16 {
    22
}

impl Default for FtpSettings {
    fn default() -> Self {
        Self {
            host: String::new(),
            port: default_ftp_port(),
            remote_path: String::new(),
            username: String::new(),
            password: String::new(),
            secure: false,
        }
    }
}

impl Default for SftpSettings {
    fn default() -> Self {
        Self {
            host: String::new(),
            port: default_sftp_port(),
            remote_path: String::new(),
            username: String::new(),
            password: String::new(),
            private_key_path: String::new(),
        }
    }
}

impl WebDavSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.server_url.trim().is_empty()
            || self.remote_path.trim().is_empty()
            || self.username.trim().is_empty()
            || self.password.is_empty()
        {
            return Err(AppError::Sync(
                "请完整填写服务器地址、远端同步目录、用户名和密码".to_owned(),
            ));
        }
        reqwest::Url::parse(self.server_url.trim())
            .map_err(|_| AppError::Sync("服务器地址不是有效的 URL".to_owned()))?;
        let remote_path = self.remote_path.trim();
        if !remote_path.starts_with('/') {
            return Err(AppError::Sync("远端同步目录必须以 / 开头".to_owned()));
        }
        normalize_remote_directory(remote_path)?;
        Ok(())
    }
}

impl FtpSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.host.trim().is_empty()
            || self.remote_path.trim().is_empty()
            || self.username.trim().is_empty()
            || self.password.is_empty()
        {
            return Err(AppError::Sync(
                "请完整填写主机、远端同步目录、用户名和密码".to_owned(),
            ));
        }
        parse_port(self.port)?;
        normalize_remote_directory(&self.remote_path)?;
        Ok(())
    }
}

impl SftpSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.host.trim().is_empty()
            || self.remote_path.trim().is_empty()
            || self.username.trim().is_empty()
        {
            return Err(AppError::Sync(
                "请完整填写主机、远端同步目录和用户名".to_owned(),
            ));
        }
        if self.password.is_empty() && self.private_key_path.trim().is_empty() {
            return Err(AppError::Sync(
                "请填写密码，或提供 SFTP 私钥路径".to_owned(),
            ));
        }
        parse_port(self.port)?;
        normalize_remote_directory(&self.remote_path)?;
        Ok(())
    }
}

impl SyncSettings {
    pub fn validate_active(&self) -> Result<(), AppError> {
        match self.protocol {
            SyncProtocol::WebDav => self.webdav.validate(),
            SyncProtocol::Ftp => self.ftp.validate(),
            SyncProtocol::Sftp => self.sftp.validate(),
        }
    }
}

pub struct SyncStore {
    path: PathBuf,
    legacy_path: PathBuf,
    known_hosts_path: PathBuf,
}

impl SyncStore {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            path: data_dir.join(SYNC_SETTINGS_FILE),
            legacy_path: data_dir.join(LEGACY_WEBDAV_SETTINGS_FILE),
            known_hosts_path: data_dir.join(KNOWN_HOSTS_FILE),
        }
    }

    pub fn known_hosts_path(&self) -> &std::path::Path {
        &self.known_hosts_path
    }

    pub fn load(&self) -> Result<SyncSettings, AppError> {
        if self.path.exists() {
            let raw = fs::read_to_string(&self.path)?;
            let value: serde_json::Value = serde_json::from_str(&raw)
                .map_err(|error| AppError::Sync(format!("本地同步设置无效：{error}")))?;
            let needs_rewrite = value
                .get("protocol")
                .and_then(serde_json::Value::as_str)
                .is_some_and(|protocol| protocol == "webDav");
            let settings: SyncSettings = serde_json::from_value(value)
                .map_err(|error| AppError::Sync(format!("本地同步设置无效：{error}")))?;
            if needs_rewrite {
                self.write(&settings)?;
            }
            return Ok(settings);
        }
        if self.legacy_path.exists() {
            let file = fs::File::open(&self.legacy_path)?;
            let webdav: WebDavSettings = serde_json::from_reader(file)
                .map_err(|error| AppError::Sync(format!("本地 WebDAV 设置无效：{error}")))?;
            let settings = SyncSettings {
                protocol: SyncProtocol::WebDav,
                webdav,
                ..SyncSettings::default()
            };
            self.write(&settings)?;
            return Ok(settings);
        }
        Ok(SyncSettings::default())
    }

    pub fn save(&self, settings: &SyncSettings) -> Result<(), AppError> {
        settings.validate_active()?;
        self.write(settings)
    }

    pub fn save_webdav(&self, webdav: &WebDavSettings) -> Result<(), AppError> {
        webdav.validate()?;
        let mut settings = self.load()?;
        settings.webdav = webdav.clone();
        self.write(&settings)
    }

    fn write(&self, settings: &SyncSettings) -> Result<(), AppError> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_vec_pretty(settings)
            .map_err(|error| AppError::Sync(error.to_string()))?;
        fs::write(&self.path, content)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store() -> (SyncStore, PathBuf) {
        let root = std::env::temp_dir().join(format!(
            "starrail-sync-settings-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        (SyncStore::new(root.clone()), root)
    }

    fn valid_webdav() -> WebDavSettings {
        WebDavSettings {
            server_url: "https://dav.example.com".to_owned(),
            remote_path: "/StarRailTools/".to_owned(),
            username: "user".to_owned(),
            password: "password".to_owned(),
        }
    }

    #[test]
    fn rejects_incomplete_and_unsafe_settings() {
        assert!(WebDavSettings::default().validate().is_err());
        assert!(FtpSettings::default().validate().is_err());
        assert!(SftpSettings::default().validate().is_err());
        assert!(FtpSettings {
            host: "ftp.example.com".to_owned(),
            port: 0,
            remote_path: "/backups".to_owned(),
            username: "user".to_owned(),
            password: "secret".to_owned(),
            secure: false,
        }
        .validate()
        .is_err());
        assert!(SftpSettings {
            host: "sftp.example.com".to_owned(),
            port: 22,
            remote_path: "../etc".to_owned(),
            username: "user".to_owned(),
            password: "secret".to_owned(),
            private_key_path: String::new(),
        }
        .validate()
        .is_err());
        assert!(SftpSettings {
            host: "sftp.example.com".to_owned(),
            port: 22,
            remote_path: "/backups".to_owned(),
            username: "user".to_owned(),
            password: String::new(),
            private_key_path: "/tmp/id_ed25519".to_owned(),
        }
        .validate()
        .is_ok());
    }

    #[test]
    fn migrates_legacy_webdav_settings_without_deleting_them() {
        let (store, root) = temp_store();
        fs::write(
            root.join(LEGACY_WEBDAV_SETTINGS_FILE),
            serde_json::to_vec_pretty(&valid_webdav()).unwrap(),
        )
        .unwrap();

        let loaded = store.load().unwrap();
        assert_eq!(loaded.protocol, SyncProtocol::WebDav);
        assert_eq!(serde_json::to_value(&loaded).unwrap()["protocol"], "webdav");
        assert_eq!(loaded.webdav.server_url, "https://dav.example.com");
        assert!(root.join(SYNC_SETTINGS_FILE).exists());
        assert!(root.join(LEGACY_WEBDAV_SETTINGS_FILE).exists());

        store
            .save_webdav(&WebDavSettings {
                password: "updated".to_owned(),
                ..valid_webdav()
            })
            .unwrap();
        assert_eq!(store.load().unwrap().webdav.password, "updated");
        assert_eq!(store.load().unwrap().protocol, SyncProtocol::WebDav);
    }

    #[test]
    fn deserializes_frontend_protocol_tags() {
        for (raw, expected) in [
            ("webdav", SyncProtocol::WebDav),
            ("webDav", SyncProtocol::WebDav),
            ("ftp", SyncProtocol::Ftp),
            ("sftp", SyncProtocol::Sftp),
        ] {
            let settings: SyncSettings = serde_json::from_str(&format!(
                r#"{{"protocol":"{raw}","webdav":{{}},"ftp":{{}},"sftp":{{}}}}"#
            ))
            .unwrap();
            assert_eq!(settings.protocol, expected);
        }
    }

    #[test]
    fn rewrites_legacy_webdav_protocol_tag_without_losing_credentials() {
        let (store, root) = temp_store();
        fs::write(
            root.join(SYNC_SETTINGS_FILE),
            r#"{
  "protocol": "webDav",
  "webdav": {
    "serverUrl": "https://dav.example.com",
    "remotePath": "/StarRailTools/",
    "username": "user",
    "password": "password"
  }
}"#,
        )
        .unwrap();

        let loaded = store.load().unwrap();
        assert_eq!(loaded.protocol, SyncProtocol::WebDav);
        assert_eq!(loaded.webdav.username, "user");
        assert_eq!(loaded.webdav.password, "password");
        let rewritten = fs::read_to_string(root.join(SYNC_SETTINGS_FILE)).unwrap();
        assert!(rewritten.contains("\"webdav\""));
        assert!(!rewritten.contains("\"webDav\""));
        assert_eq!(
            store.load().unwrap().webdav.server_url,
            "https://dav.example.com"
        );
    }
}
