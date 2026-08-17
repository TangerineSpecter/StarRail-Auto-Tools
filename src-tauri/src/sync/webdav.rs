use reqwest::{Client, StatusCode, Url};

use crate::error::AppError;

use super::{
    settings::WebDavSettings,
    transport::{assert_safe_filename, put_files_sequentially, RemoteTransport},
};

pub struct WebDavTransport {
    settings: WebDavSettings,
}

impl WebDavTransport {
    pub fn new(settings: &WebDavSettings) -> Result<Self, AppError> {
        settings.validate()?;
        Ok(Self {
            settings: settings.clone(),
        })
    }

    fn directory_url(&self) -> Result<Url, AppError> {
        Url::parse(&format!(
            "{}/{}/",
            self.settings.server_url.trim_end_matches('/'),
            self.settings.remote_path.trim_matches('/')
        ))
        .map_err(|_| AppError::Sync("无法组合远端同步目录地址".to_owned()))
    }

    fn file_url(&self, file: &str) -> Result<Url, AppError> {
        assert_safe_filename(file)?;
        self.directory_url()?
            .join(file)
            .map_err(|_| AppError::Sync("无法组合远端同步文件地址".to_owned()))
    }
}

fn client() -> Result<Client, AppError> {
    Client::builder()
        .build()
        .map_err(|error| AppError::Sync(error.to_string()))
}

fn describe_status(status: StatusCode) -> AppError {
    let message = match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => "认证失败，请检查用户名和密码",
        StatusCode::NOT_FOUND => "远端同步文件不存在",
        _ => "服务器拒绝了 WebDAV 请求",
    };
    AppError::Sync(format!("{message}（HTTP {}）", status.as_u16()))
}

impl RemoteTransport for WebDavTransport {
    async fn test(&self) -> Result<(), AppError> {
        let response = client()?
            .head(self.directory_url()?)
            .basic_auth(&self.settings.username, Some(&self.settings.password))
            .send()
            .await
            .map_err(|error| AppError::Sync(error.to_string()))?;
        if response.status().is_success() || response.status() == StatusCode::NOT_FOUND {
            Ok(())
        } else {
            Err(describe_status(response.status()))
        }
    }

    async fn put(&self, file: &str, payload: Vec<u8>) -> Result<(), AppError> {
        let response = client()?
            .put(self.file_url(file)?)
            .basic_auth(&self.settings.username, Some(&self.settings.password))
            .header("content-type", "application/json; charset=utf-8")
            .body(payload)
            .send()
            .await
            .map_err(|error| AppError::Sync(error.to_string()))?;
        if response.status().is_success() {
            Ok(())
        } else {
            Err(describe_status(response.status()))
        }
    }

    async fn get(&self, file: &str) -> Result<Vec<u8>, AppError> {
        let response = client()?
            .get(self.file_url(file)?)
            .basic_auth(&self.settings.username, Some(&self.settings.password))
            .send()
            .await
            .map_err(|error| AppError::Sync(error.to_string()))?;
        if !response.status().is_success() {
            return Err(describe_status(response.status()));
        }
        response
            .bytes()
            .await
            .map(|bytes| bytes.to_vec())
            .map_err(|error| AppError::Sync(error.to_string()))
    }

    async fn put_many(&self, files: Vec<(String, Vec<u8>)>) -> Result<(), AppError> {
        put_files_sequentially(self, files).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::snapshot::MANIFEST_FILE;

    #[test]
    fn accepts_a_remote_sync_directory() {
        let transport = WebDavTransport::new(&WebDavSettings {
            server_url: "https://dav.example.com".to_owned(),
            remote_path: "/StarRailTools/".to_owned(),
            username: "user".to_owned(),
            password: "password".to_owned(),
        })
        .unwrap();
        assert_eq!(
            transport.file_url(MANIFEST_FILE).unwrap().path(),
            "/StarRailTools/manifest.json"
        );
    }
}
