use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppError;

const SETTINGS_FILE: &str = "model-provider-settings.json";
const DEEPSEEK_BASE_URL: &str = "https://api.deepseek.com";
const DEEPSEEK_DEFAULT_MODEL: &str = "deepseek-flash";
const DEFAULT_SEARCH_PROVIDER: &str = "duckduckgo";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderSettings {
    #[serde(default = "deepseek_provider")]
    pub provider: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "deepseek_base_url")]
    pub base_url: String,
    #[serde(default = "deepseek_default_model")]
    pub model: String,
    #[serde(default = "default_search_provider")]
    pub search_provider: String,
    #[serde(default)]
    pub search_api_key: String,
}

impl Default for ModelProviderSettings {
    fn default() -> Self {
        Self {
            provider: deepseek_provider(),
            api_key: String::new(),
            base_url: deepseek_base_url(),
            model: deepseek_default_model(),
            search_provider: default_search_provider(),
            search_api_key: String::new(),
        }
    }
}

impl ModelProviderSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.provider != "deepseek" {
            return Err(AppError::ModelProvider("当前仅支持 DeepSeek。".to_owned()));
        }
        let base_url = self.base_url.trim();
        if base_url != DEEPSEEK_BASE_URL {
            return Err(AppError::ModelProvider(
                "DeepSeek 官方接口地址不可修改。".to_owned(),
            ));
        }
        if !matches!(self.model.as_str(), "deepseek-flash" | "deepseek-v4-pro") {
            return Err(AppError::ModelProvider(
                "当前仅支持 Flash 或 Pro 模型。".to_owned(),
            ));
        }
        if !matches!(self.search_provider.as_str(), "duckduckgo" | "bocha") {
            return Err(AppError::ModelProvider(
                "检索后端仅支持 DuckDuckGo 或博查。".to_owned(),
            ));
        }
        Ok(())
    }

    pub fn require_ready(&self) -> Result<(), AppError> {
        self.validate()?;
        if self.api_key.trim().is_empty() {
            return Err(AppError::ModelProvider(
                "请先在设置 → 大模型配置中填写 DeepSeek API Key。".to_owned(),
            ));
        }
        if self.search_provider == "bocha" && self.search_api_key.trim().is_empty() {
            return Err(AppError::ModelProvider(
                "已选择博查搜索，请填写搜索 API Key。".to_owned(),
            ));
        }
        Ok(())
    }
}

#[derive(Clone)]
pub struct ModelProviderStore {
    path: PathBuf,
}

impl ModelProviderStore {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            path: data_dir.join(SETTINGS_FILE),
        }
    }

    pub fn load(&self) -> Result<ModelProviderSettings, AppError> {
        if !self.path.exists() {
            return Ok(ModelProviderSettings::default());
        }
        let mut settings: ModelProviderSettings = serde_json::from_str(
            &fs::read_to_string(&self.path).map_err(model_io("读取大模型配置"))?,
        )
        .map_err(|error| AppError::ModelProvider(format!("本地大模型配置无效：{error}")))?;
        if matches!(
            settings.model.as_str(),
            "deepseek-chat" | "deepseek-reasoner"
        ) {
            settings.model = deepseek_default_model();
        }
        if settings.base_url == "https://api.deepseek.com/v1" {
            settings.base_url = deepseek_base_url();
        }
        settings.validate()?;
        Ok(settings)
    }

    pub fn save(&self, settings: ModelProviderSettings) -> Result<ModelProviderSettings, AppError> {
        settings.validate()?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(model_io("创建大模型配置目录"))?;
        }
        fs::write(
            &self.path,
            serde_json::to_vec_pretty(&settings)
                .map_err(|error| AppError::ModelProvider(error.to_string()))?,
        )
        .map_err(model_io("写入大模型配置"))?;
        Ok(settings)
    }
}

fn deepseek_provider() -> String {
    "deepseek".to_owned()
}

fn deepseek_base_url() -> String {
    DEEPSEEK_BASE_URL.to_owned()
}

fn deepseek_default_model() -> String {
    DEEPSEEK_DEFAULT_MODEL.to_owned()
}

fn default_search_provider() -> String {
    DEFAULT_SEARCH_PROVIDER.to_owned()
}

fn model_io(action: &'static str) -> impl FnOnce(std::io::Error) -> AppError {
    move |error| AppError::ModelProvider(format!("{action}失败：{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_deepseek_flash() {
        assert_eq!(
            ModelProviderSettings::default().model,
            DEEPSEEK_DEFAULT_MODEL
        );
    }

    #[test]
    fn rejects_an_unsupported_provider() {
        let settings = ModelProviderSettings {
            provider: "other".to_owned(),
            ..ModelProviderSettings::default()
        };
        assert!(settings.validate().is_err());
    }

    #[test]
    fn permits_clearing_the_api_key() {
        assert!(ModelProviderSettings::default().validate().is_ok());
    }

    #[test]
    fn defaults_to_duckduckgo_search() {
        assert_eq!(
            ModelProviderSettings::default().search_provider,
            DEFAULT_SEARCH_PROVIDER
        );
    }

    #[test]
    fn rejects_an_unknown_search_provider() {
        let settings = ModelProviderSettings {
            search_provider: "google".to_owned(),
            ..ModelProviderSettings::default()
        };
        assert!(settings.validate().is_err());
    }

    #[test]
    fn require_ready_asks_for_bocha_key() {
        let settings = ModelProviderSettings {
            api_key: "sk-test".to_owned(),
            search_provider: "bocha".to_owned(),
            ..ModelProviderSettings::default()
        };
        let error = settings.require_ready().unwrap_err().to_string();
        assert!(error.contains("博查"));
    }
}
