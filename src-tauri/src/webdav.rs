use std::{fs, path::PathBuf};

use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};

use crate::{
    error::AppError,
    inventory::{
        supports_sync_format_version, SyncBuildPlansFile, SyncInventoryFile, SyncManifest,
        SyncSnapshot, SyncTeamsFile, SYNC_FORMAT_VERSION,
    },
};

const MANIFEST_FILE: &str = "manifest.json";
const INVENTORY_FILE_PREFIX: &str = "inventory-";
const BUILD_PLANS_FILE_PREFIX: &str = "build-plans-";
const TEAMS_FILE_PREFIX: &str = "teams-";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavSettings {
    pub server_url: String,
    pub remote_path: String,
    pub username: String,
    pub password: String,
}

impl WebDavSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.server_url.trim().is_empty()
            || self.remote_path.trim().is_empty()
            || self.username.trim().is_empty()
            || self.password.is_empty()
        {
            return Err(AppError::WebDav(
                "请完整填写服务器地址、远端同步目录、用户名和密码".to_owned(),
            ));
        }
        Url::parse(&self.server_url)
            .map_err(|_| AppError::WebDav("服务器地址不是有效的 URL".to_owned()))?;
        let remote_path = self.remote_path.trim();
        if !remote_path.starts_with('/') {
            return Err(AppError::WebDav("远端同步目录必须以 / 开头".to_owned()));
        }
        Ok(())
    }

    fn directory_url(&self) -> Result<Url, AppError> {
        self.validate()?;
        Url::parse(&format!(
            "{}/{}/",
            self.server_url.trim_end_matches('/'),
            self.remote_path.trim_matches('/')
        ))
        .map_err(|_| AppError::WebDav("无法组合远端同步目录地址".to_owned()))
    }

    fn file_url(&self, file: &str) -> Result<Url, AppError> {
        self.directory_url()?
            .join(file)
            .map_err(|_| AppError::WebDav("无法组合远端同步文件地址".to_owned()))
    }
}

pub struct WebDavStore {
    path: PathBuf,
}

impl WebDavStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn load(&self) -> Result<WebDavSettings, AppError> {
        if !self.path.exists() {
            return Ok(WebDavSettings::default());
        }
        let file = fs::File::open(&self.path)?;
        serde_json::from_reader(file)
            .map_err(|error| AppError::WebDav(format!("本地 WebDAV 设置无效：{error}")))
    }

    pub fn save(&self, settings: &WebDavSettings) -> Result<(), AppError> {
        settings.validate()?;
        let content = serde_json::to_vec_pretty(settings)
            .map_err(|error| AppError::WebDav(error.to_string()))?;
        fs::write(&self.path, content)?;
        Ok(())
    }
}

fn client() -> Result<Client, AppError> {
    Client::builder()
        .build()
        .map_err(|error| AppError::WebDav(error.to_string()))
}

fn describe_status(status: StatusCode) -> AppError {
    let message = match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => "认证失败，请检查用户名和密码",
        StatusCode::NOT_FOUND => "远端同步文件不存在",
        _ => "服务器拒绝了 WebDAV 请求",
    };
    AppError::WebDav(format!("{message}（HTTP {}）", status.as_u16()))
}

pub async fn test(settings: &WebDavSettings) -> Result<(), AppError> {
    let response = client()?
        .head(settings.directory_url()?)
        .basic_auth(&settings.username, Some(&settings.password))
        .send()
        .await
        .map_err(|error| AppError::WebDav(error.to_string()))?;
    if response.status().is_success() || response.status() == StatusCode::NOT_FOUND {
        Ok(())
    } else {
        Err(describe_status(response.status()))
    }
}

async fn upload_file(
    settings: &WebDavSettings,
    file: &str,
    payload: Vec<u8>,
) -> Result<(), AppError> {
    let response = client()?
        .put(settings.file_url(file)?)
        .basic_auth(&settings.username, Some(&settings.password))
        .header("content-type", "application/json; charset=utf-8")
        .body(payload)
        .send()
        .await
        .map_err(|error| AppError::WebDav(error.to_string()))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(describe_status(response.status()))
    }
}

async fn download_file(settings: &WebDavSettings, file: &str) -> Result<Vec<u8>, AppError> {
    let response = client()?
        .get(settings.file_url(file)?)
        .basic_auth(&settings.username, Some(&settings.password))
        .send()
        .await
        .map_err(|error| AppError::WebDav(error.to_string()))?;
    if !response.status().is_success() {
        return Err(describe_status(response.status()));
    }
    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|error| AppError::WebDav(error.to_string()))
}

fn encode<T: Serialize>(value: &T) -> Result<Vec<u8>, AppError> {
    serde_json::to_vec_pretty(value)
        .map_err(|error| AppError::WebDav(format!("无法生成同步文件：{error}")))
}

fn decode<T: for<'de> Deserialize<'de>>(payload: &[u8], file: &str) -> Result<T, AppError> {
    serde_json::from_slice(payload)
        .map_err(|error| AppError::WebDav(format!("远端 {file} 格式无效：{error}")))
}

pub async fn upload_snapshot(
    settings: &WebDavSettings,
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
    upload_file(settings, &inventory_file, encode(&inventory)?).await?;
    upload_file(settings, &build_plans_file, encode(&build_plans)?).await?;
    upload_file(settings, &teams_file, encode(&teams)?).await?;
    upload_file(settings, MANIFEST_FILE, encode(&manifest)?).await
}

pub async fn download_snapshot(settings: &WebDavSettings) -> Result<SyncSnapshot, AppError> {
    let manifest: SyncManifest = decode(
        &download_file(settings, MANIFEST_FILE).await?,
        MANIFEST_FILE,
    )?;
    if !supports_sync_format_version(manifest.format_version) {
        return Err(AppError::WebDav(format!(
            "不支持的同步数据版本：{}",
            manifest.format_version
        )));
    }
    let inventory_file = find_snapshot_file(&manifest, INVENTORY_FILE_PREFIX)?;
    let build_plans_file = find_snapshot_file(&manifest, BUILD_PLANS_FILE_PREFIX)?;
    let inventory: SyncInventoryFile = decode(
        &download_file(settings, &inventory_file).await?,
        &inventory_file,
    )?;
    let build_plans: SyncBuildPlansFile = decode(
        &download_file(settings, &build_plans_file).await?,
        &build_plans_file,
    )?;
    if inventory.format_version != manifest.format_version
        || build_plans.format_version != manifest.format_version
    {
        return Err(AppError::WebDav("同步文件版本与清单不一致".to_owned()));
    }

    // v1/v2 backups have no teams file; treat as empty personal settings.
    let teams = if manifest.format_version >= SYNC_FORMAT_VERSION {
        let teams_file = find_snapshot_file(&manifest, TEAMS_FILE_PREFIX)?;
        let teams_payload: SyncTeamsFile =
            decode(&download_file(settings, &teams_file).await?, &teams_file)?;
        if teams_payload.format_version != manifest.format_version {
            return Err(AppError::WebDav("同步文件版本与清单不一致".to_owned()));
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

fn versioned_file(prefix: &str, generated_at: i64) -> String {
    format!("{prefix}{generated_at}.json")
}

fn find_snapshot_file(manifest: &SyncManifest, prefix: &str) -> Result<String, AppError> {
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
        return Err(AppError::WebDav(format!(
            "同步清单缺少有效的 {prefix} 数据文件"
        )));
    }
    Ok(files[0].to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_remote_sync_directory() {
        let settings = WebDavSettings {
            server_url: "https://dav.example.com".to_owned(),
            remote_path: "/StarRailTools/".to_owned(),
            username: "user".to_owned(),
            password: "password".to_owned(),
        };
        assert!(settings.validate().is_ok());
        assert_eq!(
            settings.file_url(MANIFEST_FILE).unwrap().path(),
            "/StarRailTools/manifest.json"
        );
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
}
