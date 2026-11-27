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
        return "网络请求超时，请检查网络连接或代理设置。".to_owned();
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
    if status == StatusCode::TOO_MANY_REQUESTS {
        return Err(AppError::Advisor(
            "接口触发限流（HTTP 429），请稍后重试或检查配额。".to_owned(),
        ));
    }
    if !status.is_success() {
        return Err(AppError::Advisor(summarize_http_error(status, &text)));
    }
    Ok(text)
}

pub(crate) fn summarize_http_error(status: StatusCode, body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return format!("接口返回 HTTP {}", status.as_u16());
    }
    if let Ok(json) = serde_json::from_str::<Value>(trimmed) {
        let message = json
            .pointer("/error/message")
            .or_else(|| json.pointer("/detail/error"))
            .or_else(|| json.get("detail"))
            .or_else(|| json.get("message"))
            .or_else(|| json.get("error"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty());
        if let Some(msg) = message {
            let short: String = msg.chars().take(120).collect();
            return format!("接口返回 HTTP {}：{short}", status.as_u16());
        }
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("<!doctype") || lower.starts_with("<html") || lower.contains("<body") {
        if let Some(title) = extract_html_title(trimmed) {
            return format!("接口返回 HTTP {}（{title}）", status.as_u16());
        }
        return format!("接口返回 HTTP {}（目标服务暂时不可用）", status.as_u16());
    }
    let compact: String = trimmed
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(120)
        .collect();
    format!("接口返回 HTTP {}：{compact}", status.as_u16())
}

fn extract_html_title(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let start = lower.find("<title")?;
    let tag_end = lower[start..].find('>')? + start + 1;
    let end = lower[tag_end..].find("</title>")? + tag_end;
    let title = html[tag_end..end]
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if title.is_empty() {
        None
    } else {
        Some(title.chars().take(60).collect())
    }
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

    #[test]
    fn strips_raw_html_from_http_error_messages() {
        let html = r#"<html><head><meta http-equiv="content-type" content="text/html;charset=utf-8"><title>500 Server Error</title></head><body text=#000000><h1>Error: Server Error</h1></body></html>"#;
        let msg = summarize_http_error(StatusCode::INTERNAL_SERVER_ERROR, html);
        assert!(!msg.contains("<html"));
        assert!(!msg.contains("<body"));
        assert!(msg.contains("500"));
        assert!(msg.contains("500 Server Error"));
    }

    #[test]
    fn extracts_json_error_detail_cleanly() {
        let json_body = r#"{"detail":{"error":"Invalid API key"}}"#;
        let msg = summarize_http_error(StatusCode::BAD_REQUEST, json_body);
        assert_eq!(msg, "接口返回 HTTP 400：Invalid API key");
    }
}
