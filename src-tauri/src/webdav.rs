use std::{fs, path::PathBuf};

use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

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
                "请完整填写服务器地址、远端文件、用户名和密码".to_owned(),
            ));
        }
        Url::parse(&self.server_url)
            .map_err(|_| AppError::WebDav("服务器地址不是有效的 URL".to_owned()))?;
        if !self.remote_path.starts_with('/') {
            return Err(AppError::WebDav("远端文件路径必须以 / 开头".to_owned()));
        }
        Ok(())
    }

    fn remote_url(&self) -> Result<Url, AppError> {
        self.validate()?;
        Url::parse(&format!(
            "{}/{}",
            self.server_url.trim_end_matches('/'),
            self.remote_path.trim_start_matches('/')
        ))
        .map_err(|_| AppError::WebDav("无法组合远端文件地址".to_owned()))
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
        .head(settings.remote_url()?)
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

pub async fn upload(settings: &WebDavSettings, payload: Vec<u8>) -> Result<(), AppError> {
    let response = client()?
        .put(settings.remote_url()?)
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

pub async fn download(settings: &WebDavSettings) -> Result<Vec<u8>, AppError> {
    let response = client()?
        .get(settings.remote_url()?)
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
