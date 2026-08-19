use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{
        CallToolResult, ContentBlock, Implementation, ProtocolVersion, ServerCapabilities,
        ServerInfo,
    },
    schemars, tool, tool_handler, tool_router, ErrorData as McpError, ServerHandler,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    direct_read,
    error::AppError,
    game_launch::GameLaunchRuntime,
    inventory::{InventoryStore, InventorySummary},
    sync::{self, SyncProtocol, SyncStore},
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadToolResult {
    pub protocol: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadToolResult {
    pub protocol: String,
    pub message: String,
    pub summary: InventorySummary,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct DownloadLocalDataParams {
    /// 必须为 true。下载会用远端快照完整覆盖本地录入、培养方案与配队，不会合并两端数据。
    pub confirm: bool,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GameCaptureStatusParams {
    /// start_game_data_capture 返回的 taskId。
    pub task_id: String,
}

#[derive(Clone)]
pub struct StarRailMcp {
    inventory: InventoryStore,
    sync: SyncStore,
    app: AppHandle,
    tool_router: ToolRouter<Self>,
}

impl StarRailMcp {
    pub fn new(inventory: InventoryStore, sync: SyncStore, app: AppHandle) -> Self {
        Self {
            inventory,
            sync,
            app,
            tool_router: Self::tool_router(),
        }
    }
}

#[tool_router]
impl StarRailMcp {
    #[tool(
        name = "upload_local_data",
        description = "把当前本地录入、培养方案与配队上传到软件设置里已保存的 WebDAV / FTP / SFTP 同步站。不接收远端地址或密码，调用前须先在软件设置中配置并保存同步站。",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn upload_local_data(&self) -> Result<CallToolResult, McpError> {
        match upload_local_snapshot(&self.inventory, &self.sync).await {
            Ok(result) => tool_json_result(&result),
            Err(error) => Ok(tool_error(error)),
        }
    }

    #[tool(
        name = "download_local_data",
        description = "从软件设置里已保存的同步站下载远端快照，并完整覆盖本地同步范围内的录入、培养方案与配队。这不是合并操作。必须传入 confirm=true 才会执行。",
        annotations(
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn download_local_data(
        &self,
        Parameters(params): Parameters<DownloadLocalDataParams>,
    ) -> Result<CallToolResult, McpError> {
        match download_local_snapshot(&self.inventory, &self.sync, params.confirm).await {
            Ok(result) => {
                publish_inventory_change(&self.app, &result.summary);
                tool_json_result(&result)
            }
            Err(error) => Ok(tool_error(error)),
        }
    }

    #[tool(
        name = "start_game_data_capture",
        description = "在 Windows 上启动或复用软件设置中已保存的米哈游启动器，自动点击启动器的“开始游戏”，等待游戏窗口后点击窗体中心进入游戏并监听数据。立即返回 taskId；请每 2 到 3 秒调用 get_game_data_capture_status 直到 terminal=true。调用前须在软件设置 → 游戏启动与采集配置启动器 .exe。",
        annotations(
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn start_game_data_capture(&self) -> Result<CallToolResult, McpError> {
        let runtime = self.app.state::<GameLaunchRuntime>();
        match runtime.start() {
            Ok(task) => tool_json_result(&task),
            Err(error) => Ok(tool_error(error)),
        }
    }

    #[tool(
        name = "get_game_data_capture_status",
        description = "查询游戏启动与数据采集任务的最新状态。传入 start_game_data_capture 返回的 taskId；terminal=true 表示任务已成功、失败或取消。",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn get_game_data_capture_status(
        &self,
        Parameters(params): Parameters<GameCaptureStatusParams>,
    ) -> Result<CallToolResult, McpError> {
        let runtime = self.app.state::<GameLaunchRuntime>();
        match runtime.status(&params.task_id) {
            Ok(task) => tool_json_result(&task),
            Err(error) => Ok(tool_error(error)),
        }
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for StarRailMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(
            ServerCapabilities::builder()
                .enable_tools()
                .build(),
        )
        .with_server_info(Implementation::new("starrail-auto-tools", env!("CARGO_PKG_VERSION")))
        .with_protocol_version(ProtocolVersion::default())
        .with_instructions(
            "此服务把星穹铁道本地工具的数据同步站暴露给 MCP 客户端。upload_local_data 上传当前本地快照；download_local_data 用远端快照覆盖本地，必须带 confirm=true。请先在软件设置中配置同步站，并保持本软件运行。"
                .to_owned(),
        )
    }
}

pub async fn upload_local_snapshot(
    inventory: &InventoryStore,
    sync: &SyncStore,
) -> Result<UploadToolResult, AppError> {
    let settings = sync.load()?;
    settings.validate_active().map_err(sync_config_error)?;
    let protocol = protocol_label(settings.protocol);
    sync::upload_snapshot(
        &settings,
        sync.known_hosts_path(),
        inventory.sync_snapshot()?,
    )
    .await?;
    Ok(UploadToolResult {
        protocol: protocol.to_owned(),
        message: format!("已上传当前本地数据与培养方案到{protocol}同步站"),
    })
}

pub async fn download_local_snapshot(
    inventory: &InventoryStore,
    sync: &SyncStore,
    confirm: bool,
) -> Result<DownloadToolResult, AppError> {
    if !confirm {
        return Err(AppError::Mcp(
            "下载会覆盖本地录入、培养方案与配队。请再次调用 download_local_data 并传入 confirm=true。"
                .to_owned(),
        ));
    }
    let settings = sync.load()?;
    settings.validate_active().map_err(sync_config_error)?;
    let protocol = protocol_label(settings.protocol);
    let snapshot = sync::download_snapshot(&settings, sync.known_hosts_path()).await?;
    let summary = inventory.replace_with_sync_snapshot(snapshot)?;
    Ok(DownloadToolResult {
        protocol: protocol.to_owned(),
        message: format!("已从{protocol}同步站下载并覆盖本地同步数据"),
        summary,
    })
}

pub fn publish_inventory_change(app: &AppHandle, summary: &InventorySummary) {
    let _ = direct_read::inventory_changed(app, summary, false);
    let _ = app.emit("inventory://changed", summary);
}

fn protocol_label(protocol: SyncProtocol) -> &'static str {
    match protocol {
        SyncProtocol::WebDav => "WebDAV",
        SyncProtocol::Ftp => "FTP",
        SyncProtocol::Sftp => "SFTP",
    }
}

fn sync_config_error(error: AppError) -> AppError {
    AppError::Mcp(format!(
        "{error}。请先在软件设置 → 数据同步站填写并保存连接信息。"
    ))
}

fn tool_json_result<T: Serialize>(value: &T) -> Result<CallToolResult, McpError> {
    let structured = serde_json::to_value(value)
        .map_err(|error| McpError::internal_error(error.to_string(), None))?;
    Ok(CallToolResult::structured(structured))
}

fn tool_error(error: AppError) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(error.to_string())])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::{SyncSettings, WebDavSettings};

    fn temp_sync_store() -> SyncStore {
        let root = std::env::temp_dir().join(format!(
            "starrail-mcp-tools-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        SyncStore::new(root)
    }

    fn temp_inventory() -> InventoryStore {
        static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let sequence = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "starrail-mcp-inventory-{}-{}-{sequence}.sqlite3",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        InventoryStore::initialize(path).unwrap()
    }

    #[tokio::test]
    async fn download_requires_confirm() {
        let inventory = temp_inventory();
        let sync = temp_sync_store();
        let error = download_local_snapshot(&inventory, &sync, false)
            .await
            .unwrap_err();
        assert!(error.to_string().contains("confirm=true"));
    }

    #[tokio::test]
    async fn upload_requires_saved_sync_settings() {
        let inventory = temp_inventory();
        let sync = temp_sync_store();
        let error = upload_local_snapshot(&inventory, &sync).await.unwrap_err();
        assert!(error.to_string().contains("数据同步站"));
    }

    #[tokio::test]
    async fn download_requires_saved_sync_settings_when_confirmed() {
        let inventory = temp_inventory();
        let sync = temp_sync_store();
        let error = download_local_snapshot(&inventory, &sync, true)
            .await
            .unwrap_err();
        assert!(error.to_string().contains("数据同步站"));
    }

    #[test]
    fn incomplete_webdav_settings_are_rejected_by_sync_store() {
        let sync = temp_sync_store();
        let result = sync.save(&SyncSettings {
            protocol: SyncProtocol::WebDav,
            webdav: WebDavSettings::default(),
            ..SyncSettings::default()
        });
        assert!(result.is_err());
    }
}
