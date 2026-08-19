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
    /// start_game_data_capture 返回的 taskId。不传时返回最近一次任务，便于客户端恢复查询。
    #[serde(default)]
    pub task_id: Option<String>,
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
        description = "仅用于远端备份：把当前本地录入、培养方案与配队上传到软件设置里已保存的 WebDAV / FTP / SFTP 同步站。不用于从游戏获取或更新数据。",
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
        description = "仅用于从远端恢复备份：从软件设置里已保存的 WebDAV / FTP / SFTP 同步站下载快照，并完整覆盖本地数据。这不是从游戏获取数据；必须传入 confirm=true。",
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
        description = "用于“更新数据”“获取游戏数据”“启动星铁后采集”等请求：在 Windows 上启动或复用已配置的米哈游启动器，进入游戏并监听数据。立即返回 taskId；请每 2 到 3 秒调用 get_game_data_capture_status 直到 terminal=true。调用前须在软件设置 → 游戏启动与采集配置启动器 .exe。",
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
            Ok(task) => game_capture_task_result(&task, true),
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
        match runtime.status(params.task_id.as_deref()) {
            Ok(task) => game_capture_task_result(&task, false),
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
            "此服务有两条严格隔离的工作流。第一条是游戏数据采集：当用户说“更新数据”“获取游戏数据”“启动星铁”“启动游戏”“进入游戏并采集”或类似意思时，必须调用 start_game_data_capture，而不是上传或下载工具。该工具仅支持 Windows，需先在软件设置 → 游戏启动与采集保存启动器 .exe；它立即返回 taskId，之后每 2 到 3 秒调用 get_game_data_capture_status（传 taskId；遗漏 taskId 时返回最近任务）直到 terminal=true。第二条是远端备份同步：只有用户明确提到上传、下载、备份、恢复、SFTP、FTP、WebDAV、同步站或远端数据时，才使用 upload_local_data / download_local_data；download_local_data 会覆盖本地数据，必须传 confirm=true。不要尝试自动填写账号、密码或验证码；桌面软件必须保持运行。"
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

fn game_capture_task_result(
    task: &crate::game_launch::GameCaptureTask,
    created: bool,
) -> Result<CallToolResult, McpError> {
    let structured = serde_json::to_value(task)
        .map_err(|error| McpError::internal_error(error.to_string(), None))?;
    let action = if created {
        "请保存 taskId，并每 2 到 3 秒调用 get_game_data_capture_status。"
    } else if task.terminal {
        "任务已结束，无需继续轮询。"
    } else {
        "任务仍在进行，请每 2 到 3 秒继续查询。"
    };
    let mut result = CallToolResult::structured(structured);
    result.content = vec![ContentBlock::text(format!(
        "游戏启动采集任务：taskId={}；阶段={:?}；状态：{}。{action}",
        task.task_id, task.phase, task.message
    ))];
    Ok(result)
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

    #[test]
    fn game_capture_result_contains_a_visible_task_id() {
        let task = crate::game_launch::GameCaptureTask {
            task_id: "capture-123".to_owned(),
            phase: crate::game_launch::GameCapturePhase::PreparingListener,
            message: "正在初始化游戏数据监听…".to_owned(),
            terminal: false,
            direct_read: crate::direct_read::DirectReadSnapshot::default(),
        };
        let result = game_capture_task_result(&task, true).unwrap();
        assert_eq!(result.structured_content.unwrap()["taskId"], "capture-123");
        assert!(result.content[0]
            .as_text()
            .unwrap()
            .text
            .contains("capture-123"));
    }
}
