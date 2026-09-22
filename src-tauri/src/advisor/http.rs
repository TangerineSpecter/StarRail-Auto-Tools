use std::time::Duration;

use reqwest::{Client, StatusCode};
use serde_json::Value;

use crate::error::AppError;

const USER_AGENT: &str = "StarRail-Auto-Tools/1.0 (character-build-advisor)";

pub trait AdvisorHttp {
    fn get_text(
        &self,
        url: &str,
        headers: &[(&str, &str)],
    ) -> impl std::future::Future<Output = Result<String, AppError>> + Send;

    fn post_json(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        body: &Value,
    ) -> impl std::future::Future<Output = Result<String, AppError>> + Send;
}

#[derive(Clone)]
pub struct ReqwestAdvisorHttp {
    client: Client,
}

impl ReqwestAdvisorHttp {
    pub fn new() -> Result<Self, AppError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(20))
            .connect_timeout(Duration::from_secs(8))
            .redirect(reqwest::redirect::Policy::limited(4))
            .user_agent(USER_AGENT)
            .build()
            .map_err(|error| AppError::Advisor(format!("无法创建网络客户端：{error}")))?;
        Ok(Self { client })
    }
}

impl AdvisorHttp for ReqwestAdvisorHttp {
    async fn get_text(&self, url: &str, headers: &[(&str, &str)]) -> Result<String, AppError> {
        let mut request = self.client.get(url);
        for (key, value) in headers {
            request = request.header(*key, *value);
        }
        let response = request
            .send()
            .await
            .map_err(|error| AppError::Advisor(format!("网络请求失败：{error}")))?;
        read_text(response).await
    }

    async fn post_json(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        body: &Value,
    ) -> Result<String, AppError> {
        let mut request = self.client.post(url).json(body);
        for (key, value) in headers {
            request = request.header(*key, *value);
        }
        let response = request
            .send()
            .await
            .map_err(|error| AppError::Advisor(format!("网络请求失败：{error}")))?;
        read_text(response).await
    }
}

async fn read_text(response: reqwest::Response) -> Result<String, AppError> {
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| AppError::Advisor(format!("读取响应失败：{error}")))?;
    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        return Err(AppError::Advisor(
            "接口拒绝访问，请检查 API Key 或检索服务是否可用。".to_owned(),
        ));
    }
    if !status.is_success() {
        return Err(AppError::Advisor(format!(
            "接口返回 {status}：{}",
            text.chars().take(180).collect::<String>()
        )));
    }
    Ok(text)
}
