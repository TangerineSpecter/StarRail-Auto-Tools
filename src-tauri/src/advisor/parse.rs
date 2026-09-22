use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::sanitize::sanitize_plan;
use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AdviceTarget {
    #[serde(default)]
    pub stat_key: String,
    #[serde(default)]
    pub target: f64,
    #[serde(default)]
    pub minimum: f64,
    #[serde(default)]
    pub priority: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AdvicePlanDraft {
    #[serde(default = "four_piece")]
    pub cavern_mode: String,
    #[serde(default)]
    pub cavern_set_a: u32,
    #[serde(default)]
    pub cavern_set_b: Option<u32>,
    #[serde(default)]
    pub planar_set_id: u32,
    #[serde(default)]
    pub main_stats: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub targets: Vec<AdviceTarget>,
    #[serde(default)]
    pub effective_substats: Vec<String>,
    #[serde(default)]
    pub substat_weights: HashMap<String, f64>,
    #[serde(default = "default_min_potential")]
    pub min_potential_pct: f64,
    #[serde(default)]
    pub spd_target: f64,
    #[serde(default)]
    pub note: String,
}

fn four_piece() -> String {
    "fourPiece".to_owned()
}

fn default_min_potential() -> f64 {
    40.0
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AdviceSource {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct CharacterBuildAdvice {
    #[serde(default)]
    pub character_id: u32,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub plan: AdvicePlanDraft,
    #[serde(default)]
    pub sources: Vec<AdviceSource>,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub searched_at: i64,
}

pub fn parse_model_advice(content: &str) -> Result<CharacterBuildAdvice, AppError> {
    let value = extract_json_object(content)?;
    let mut advice: CharacterBuildAdvice =
        serde_json::from_value(value.clone()).unwrap_or_default();
    let plan_value = value.get("plan").cloned().unwrap_or(value);
    advice.plan = sanitize_plan(&plan_value);
    advice
        .sources
        .retain(|item| !item.url.trim().is_empty() || !item.title.trim().is_empty());
    Ok(advice)
}

pub fn extract_json_object(content: &str) -> Result<Value, AppError> {
    let trimmed = content.trim();
    let trimmed = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```JSON"))
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed);
    let trimmed = trimmed.strip_suffix("```").unwrap_or(trimmed).trim();
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        if value.is_object() {
            return Ok(value);
        }
    }
    let start = trimmed
        .find('{')
        .ok_or_else(|| AppError::Advisor("模型没有返回 JSON 配装建议。".to_owned()))?;
    let end = trimmed
        .rfind('}')
        .ok_or_else(|| AppError::Advisor("模型没有返回完整 JSON。".to_owned()))?;
    serde_json::from_str(&trimmed[start..=end])
        .map_err(|error| AppError::Advisor(format!("模型返回的 JSON 无效：{error}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_and_sanitizes_plan_json() {
        let advice = parse_model_advice(
            r#"```json
{"summary":"穿过客","plan":{"cavernMode":"fourPiece","cavern":"云无留迹的过客","substatWeights":{"暴击率":0.3}}}
```"#,
        )
        .unwrap();
        assert_eq!(advice.summary, "穿过客");
        assert_eq!(advice.plan.cavern_set_a, 101);
        assert_eq!(advice.plan.substat_weights.get("CRIT Rate"), Some(&0.25));
    }
}
