use std::error::Error as StdError;
use std::time::Duration;

use reqwest::{header::CONTENT_TYPE, Client, Request, StatusCode};
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

    fn build_post_json_request(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        body: &Value,
    ) -> Result<Request, AppError> {
        let mut request = self.client.post(url);
        let mut has_content_type = false;
        for (key, value) in headers {
            if key.eq_ignore_ascii_case(CONTENT_TYPE.as_str()) {
                if has_content_type {
                    continue;
                }
                has_content_type = true;
            }
            request = request.header(*key, *value);
        }
        request
            .json(body)
            .build()
            .map_err(|error| AppError::Advisor(format!("构造网络请求失败：{error}")))
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
            .map_err(|error| AppError::Advisor(format_request_error(&error)))?;
        read_text(response).await
    }

    async fn post_json(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        body: &Value,
    ) -> Result<String, AppError> {
        let request = self.build_post_json_request(url, headers, body)?;
        let response = self
            .client
            .execute(request)
            .await
            .map_err(|error| AppError::Advisor(format_request_error(&error)))?;
        read_text(response).await
    }
}

fn format_request_error(error: &reqwest::Error) -> String {
    if error.is_timeout() {
        return format!("网络请求超时：{error}");
    }
    let mut detail = error.to_string();
    let mut current = error.source();
    while let Some(source) = current {
        let text = source.to_string();
        if !text.is_empty() && !detail.contains(&text) {
            detail.push_str(" -> ");
            detail.push_str(&text);
        }
        current = source.source();
    }
    format!("网络请求失败：{detail}")
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn post_json_sets_single_json_content_type_by_default() {
        let http = ReqwestAdvisorHttp::new().expect("client");
        let request = http
            .build_post_json_request(
                "https://api.deepseek.com/chat/completions",
                &[("Authorization", "Bearer sk-test")],
                &json!({ "model": "deepseek-flash" }),
            )
            .expect("request");

        let content_types: Vec<&str> = request
            .headers()
            .get_all(CONTENT_TYPE)
            .iter()
            .map(|value| value.to_str().expect("ascii header"))
            .collect();
        assert_eq!(content_types, vec!["application/json"]);
    }

    #[test]
    fn post_json_does_not_duplicate_explicit_content_type() {
        let http = ReqwestAdvisorHttp::new().expect("client");
        let request = http
            .build_post_json_request(
                "https://api.deepseek.com/chat/completions",
                &[
                    ("Authorization", "Bearer sk-test"),
                    ("Content-Type", "application/json"),
                ],
                &json!({ "model": "deepseek-flash" }),
            )
            .expect("request");

        let content_types: Vec<&str> = request
            .headers()
            .get_all(CONTENT_TYPE)
            .iter()
            .map(|value| value.to_str().expect("ascii header"))
            .collect();
        assert_eq!(content_types, vec!["application/json"]);
    }
}
