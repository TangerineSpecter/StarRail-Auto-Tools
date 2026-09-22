use serde_json::Value;

use super::http::AdvisorHttp;
use crate::error::AppError;
use crate::model_provider::ModelProviderSettings;

pub async fn complete_json<C: AdvisorHttp>(
    client: &C,
    settings: &ModelProviderSettings,
    system: &str,
    user: &str,
) -> Result<String, AppError> {
    let body = serde_json::json!({
        "model": settings.model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ],
        "response_format": { "type": "json_object" },
        "thinking": { "type": "disabled" },
        "temperature": 0.3,
    });
    let url = format!(
        "{}/chat/completions",
        settings.base_url.trim_end_matches('/')
    );
    let raw = client
        .post_json(
            &url,
            &[
                (
                    "Authorization",
                    &format!("Bearer {}", settings.api_key.trim()),
                ),
                ("Content-Type", "application/json"),
            ],
            &body,
        )
        .await?;
    extract_message_content(&raw)
}

pub fn extract_message_content(raw: &str) -> Result<String, AppError> {
    let value: Value = serde_json::from_str(raw)
        .map_err(|error| AppError::Advisor(format!("DeepSeek 返回了无法解析的内容：{error}")))?;
    if let Some(message) = value
        .pointer("/error/message")
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
    {
        return Err(AppError::Advisor(format!("DeepSeek 请求失败：{message}")));
    }
    let content = value
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| AppError::Advisor("DeepSeek 没有返回配装建议。".to_owned()))?;
    Ok(content.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_chat_completion_content() {
        let raw = r#"{"choices":[{"message":{"content":"{\"summary\":\"ok\"}"}}]}"#;
        assert_eq!(
            extract_message_content(raw).unwrap(),
            "{\"summary\":\"ok\"}"
        );
    }

    #[test]
    fn surfaces_provider_error_messages() {
        let raw = r#"{"error":{"message":"Insufficient Balance"}}"#;
        let error = extract_message_content(raw).unwrap_err().to_string();
        assert!(error.contains("Insufficient Balance"));
    }
}
