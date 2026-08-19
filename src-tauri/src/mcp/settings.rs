use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppError;

pub const MCP_SETTINGS_FILE: &str = "mcp-settings.json";
pub const DEFAULT_MCP_PORT: u16 = 18765;
pub const MCP_BIND_HOST: &str = "127.0.0.1";
const MIN_PORT: u16 = 1024;
const TOKEN_BYTES: usize = 24;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct McpSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub token: String,
}

impl Default for McpSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            port: DEFAULT_MCP_PORT,
            token: String::new(),
        }
    }
}

fn default_port() -> u16 {
    DEFAULT_MCP_PORT
}

impl McpSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.port < MIN_PORT {
            return Err(AppError::Mcp(format!(
                "端口必须在 {MIN_PORT} 到 65535 之间"
            )));
        }
        Ok(())
    }

    pub fn ensure_token(&mut self) -> Result<(), AppError> {
        if self.token.trim().is_empty() {
            self.token = generate_token()?;
        }
        Ok(())
    }

    pub fn endpoint(&self) -> String {
        format!("http://{MCP_BIND_HOST}:{}/mcp", self.port)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct McpToolInfo {
    pub name: String,
    pub title: String,
    pub description: String,
    pub destructive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub enabled: bool,
    pub running: bool,
    pub bind_address: String,
    pub port: u16,
    pub endpoint: String,
    pub last_error: Option<String>,
    pub tools: Vec<McpToolInfo>,
}

pub fn catalog_tools() -> Vec<McpToolInfo> {
    vec![
        McpToolInfo {
            name: "upload_local_data".to_owned(),
            title: "上传本地数据到同步站".to_owned(),
            description:
                "仅用于远端备份：把当前本地数据上传到已配置的 WebDAV / FTP / SFTP 同步站，不会从游戏采集数据。"
                    .to_owned(),
            destructive: false,
        },
        McpToolInfo {
            name: "restore_remote_backup".to_owned(),
            title: "从同步站恢复远端备份".to_owned(),
            description:
                "仅用于用户明确要求恢复远端备份：从 WebDAV / FTP / SFTP 同步站下载快照并覆盖本地数据。调用时必须传入 confirm=true 和 operation=restore_remote_backup。"
                    .to_owned(),
            destructive: true,
        },
        McpToolInfo {
            name: "start_game_data_capture".to_owned(),
            title: "启动游戏并采集数据".to_owned(),
            description: "用于更新或获取游戏数据：启动或复用已配置的米哈游启动器；游戏加载期间每 5 秒尝试点击一次固定的“点击进入”位置，并监听新数据。completed 时数据已归档到本地，应立即告知用户并停止，不要自动调用任何上传、下载或恢复工具。".to_owned(),
            destructive: false,
        },
        McpToolInfo {
            name: "get_game_data_capture_status".to_owned(),
            title: "查询游戏采集进度".to_owned(),
            description: "必须传入 start_game_data_capture 返回的任务 ID，查询当前提示及已采集的数据数量。未拿到任务 ID 时不得调用。建议每 2 到 3 秒调用一次直到 terminal=true；completed 时立即报告结果并停止轮询，不要自动同步远端数据。".to_owned(),
            destructive: false,
        },
    ]
}

#[derive(Clone)]
pub struct McpStore {
    path: PathBuf,
}

impl McpStore {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            path: data_dir.join(MCP_SETTINGS_FILE),
        }
    }

    pub fn load(&self) -> Result<McpSettings, AppError> {
        if !self.path.exists() {
            return Ok(McpSettings::default());
        }
        let raw = fs::read_to_string(&self.path).map_err(mcp_io("读取 MCP 设置"))?;
        let settings: McpSettings = serde_json::from_str(&raw)
            .map_err(|error| AppError::Mcp(format!("本地 MCP 设置无效：{error}")))?;
        settings.validate()?;
        Ok(settings)
    }

    pub fn save(&self, mut settings: McpSettings) -> Result<McpSettings, AppError> {
        settings.validate()?;
        if settings.enabled {
            settings.ensure_token()?;
        }
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(mcp_io("创建 MCP 设置目录"))?;
        }
        let content = serde_json::to_vec_pretty(&settings)
            .map_err(|error| AppError::Mcp(error.to_string()))?;
        fs::write(&self.path, content).map_err(mcp_io("写入 MCP 设置"))?;
        Ok(settings)
    }
}

pub fn generate_token() -> Result<String, AppError> {
    let mut bytes = [0u8; TOKEN_BYTES];
    getrandom::fill(&mut bytes)
        .map_err(|_| AppError::Mcp("无法生成安全的 MCP 访问令牌".to_owned()))?;
    Ok(hex_encode(&bytes))
}

fn mcp_io(action: &'static str) -> impl FnOnce(std::io::Error) -> AppError {
    move |error| AppError::Mcp(format!("{action}失败：{error}"))
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store() -> (McpStore, PathBuf) {
        let root = std::env::temp_dir().join(format!(
            "starrail-mcp-settings-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        (McpStore::new(root.clone()), root)
    }

    #[test]
    fn default_settings_are_disabled_without_token() {
        let settings = McpSettings::default();
        assert!(!settings.enabled);
        assert_eq!(settings.port, DEFAULT_MCP_PORT);
        assert!(settings.token.is_empty());
        assert_eq!(
            settings.endpoint(),
            format!("http://127.0.0.1:{DEFAULT_MCP_PORT}/mcp")
        );
    }

    #[test]
    fn rejects_privileged_ports() {
        let settings = McpSettings {
            port: 80,
            ..McpSettings::default()
        };
        assert!(settings.validate().is_err());
    }

    #[test]
    fn load_returns_defaults_when_file_is_missing() {
        let (store, _root) = temp_store();
        assert_eq!(store.load().unwrap(), McpSettings::default());
    }

    #[test]
    fn save_generates_token_when_enabled() {
        let (store, root) = temp_store();
        let saved = store
            .save(McpSettings {
                enabled: true,
                port: 19001,
                token: String::new(),
            })
            .unwrap();
        assert!(saved.enabled);
        assert_eq!(saved.port, 19001);
        assert_eq!(saved.token.len(), TOKEN_BYTES * 2);
        assert!(root.join(MCP_SETTINGS_FILE).exists());
        assert_eq!(store.load().unwrap(), saved);
    }

    #[test]
    fn save_does_not_generate_token_when_disabled() {
        let (store, _root) = temp_store();
        let saved = store.save(McpSettings::default()).unwrap();
        assert!(saved.token.is_empty());
    }

    #[test]
    fn generate_token_is_hex() {
        let token = generate_token().unwrap();
        assert_eq!(token.len(), TOKEN_BYTES * 2);
        assert!(token.chars().all(|ch| ch.is_ascii_hexdigit()));
    }

    #[test]
    fn io_failures_use_mcp_error() {
        let error = mcp_io("读取 MCP 设置")(std::io::Error::other("denied"));
        assert!(error
            .to_string()
            .starts_with("MCP 服务失败：读取 MCP 设置失败"));
        assert!(!error.to_string().contains("数据导出失败"));
    }
}
