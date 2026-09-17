use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    error::AppError,
    inventory::{
        normalize_import, InventoryImport, InventoryStore, InventorySummary, PROTOCOL_VERSION,
    },
};

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(windows), allow(dead_code))]
pub enum DirectReadPhase {
    Unsupported,
    Starting,
    WaitingForLogin,
    Connected,
    Syncing,
    Ready,
    Stopped,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectReadSnapshot {
    pub phase: DirectReadPhase,
    pub message: String,
    pub started_at: Option<i64>,
    pub last_sync_at: Option<i64>,
    pub relics: u64,
    pub light_cones: u64,
    pub characters: u64,
    pub protocol_version: String,
    pub current_uid: Option<u32>,
    pub incoming_uid: Option<u32>,
    pub requires_account_switch: bool,
    pub logs: Vec<DirectReadLog>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectReadLog {
    pub at: i64,
    pub level: &'static str,
    pub message: String,
}

const MAX_DIRECT_READ_LOGS: usize = 80;

fn append_log(snapshot: &mut DirectReadSnapshot) -> bool {
    let at = now_millis();
    if snapshot
        .logs
        .iter()
        .rev()
        .take(12)
        .any(|entry| entry.message == snapshot.message && at.saturating_sub(entry.at) < 10_000)
    {
        return false;
    }
    let level = if snapshot.phase == DirectReadPhase::Error {
        "error"
    } else if snapshot.message.contains("未收到")
        || snapshot.message.contains("无法解析")
        || snapshot.message.contains("仅适配")
        || snapshot.message.contains("可能")
    {
        "warn"
    } else {
        "info"
    };
    snapshot.logs.push(DirectReadLog {
        at,
        level,
        message: snapshot.message.clone(),
    });
    if snapshot.logs.len() > MAX_DIRECT_READ_LOGS {
        snapshot
            .logs
            .drain(..snapshot.logs.len() - MAX_DIRECT_READ_LOGS);
    }
    true
}

impl Default for DirectReadSnapshot {
    fn default() -> Self {
        Self {
            phase: if cfg!(windows) {
                DirectReadPhase::Stopped
            } else {
                DirectReadPhase::Unsupported
            },
            message: if cfg!(windows) {
                "游戏数据直读尚未启动".to_owned()
            } else {
                "游戏数据直读仅支持 Windows 10/11".to_owned()
            },
            started_at: None,
            last_sync_at: None,
            relics: 0,
            light_cones: 0,
            characters: 0,
            protocol_version: PROTOCOL_VERSION.to_owned(),
            current_uid: None,
            incoming_uid: None,
            requires_account_switch: false,
            logs: Vec::new(),
        }
    }
}

#[derive(Default)]
#[cfg_attr(not(windows), allow(dead_code))]
struct DirectReadInner {
    snapshot: DirectReadSnapshot,
    cancel: Option<Arc<AtomicBool>>,
    running: bool,
    restart_requested: bool,
    pending_import: Option<InventoryImport>,
}

#[derive(Default)]
pub struct DirectReadState {
    inner: Mutex<DirectReadInner>,
}

impl DirectReadState {
    pub fn snapshot(&self) -> Result<DirectReadSnapshot, AppError> {
        self.inner
            .lock()
            .map(|inner| inner.snapshot.clone())
            .map_err(|_| AppError::StateUnavailable)
    }

    fn update(
        &self,
        app: &AppHandle,
        update: impl FnOnce(&mut DirectReadSnapshot),
    ) -> Result<DirectReadSnapshot, AppError> {
        let (snapshot, changed) = {
            let mut inner = self.inner.lock().map_err(|_| AppError::StateUnavailable)?;
            let previous_message = inner.snapshot.message.clone();
            update(&mut inner.snapshot);
            let changed =
                inner.snapshot.message != previous_message && append_log(&mut inner.snapshot);
            (inner.snapshot.clone(), changed)
        };
        if changed {
            if let Some(entry) = snapshot.logs.last() {
                if let Some(diagnostics) = app.try_state::<crate::diagnostics::BackendDiagnostics>()
                {
                    diagnostics.record(entry.level, "direct_read", &entry.message);
                }
            }
        }
        app.emit("direct-read://status", &snapshot)
            .map_err(|error| AppError::DirectRead(error.to_string()))?;
        Ok(snapshot)
    }
}

pub fn auto_start(app: AppHandle) {
    #[cfg(windows)]
    {
        if let Err(error) = start(app.clone()) {
            if let Some(state) = app.try_state::<DirectReadState>() {
                let _ = state.update(&app, |snapshot| {
                    snapshot.phase = DirectReadPhase::Error;
                    snapshot.message = error.to_string();
                });
            }
        }
    }

    #[cfg(not(windows))]
    {
        if let (Some(state), Some(store)) = (
            app.try_state::<DirectReadState>(),
            app.try_state::<InventoryStore>(),
        ) {
            if let Ok(summary) = store.summary() {
                let _ = state.update(&app, |snapshot| apply_summary(snapshot, &summary));
            }
        }
    }
}

pub fn start(app: AppHandle) -> Result<DirectReadSnapshot, AppError> {
    #[cfg(not(windows))]
    {
        let state = app.state::<DirectReadState>();
        state.update(&app, |snapshot| {
            snapshot.phase = DirectReadPhase::Unsupported;
            snapshot.message = "游戏数据直读仅支持 Windows 10/11".to_owned();
        })
    }

    #[cfg(windows)]
    {
        let state = app.state::<DirectReadState>();
        let cancel = {
            let mut inner = state.inner.lock().map_err(|_| AppError::StateUnavailable)?;
            if inner.running {
                if inner
                    .cancel
                    .as_ref()
                    .is_some_and(|cancel| cancel.load(Ordering::Relaxed))
                {
                    inner.restart_requested = true;
                    inner.snapshot.phase = DirectReadPhase::Starting;
                    inner.snapshot.message = "正在等待旧抓包任务停止后重试…".to_owned();
                    let snapshot = inner.snapshot.clone();
                    drop(inner);
                    app.emit("direct-read://status", &snapshot)
                        .map_err(|error| AppError::DirectRead(error.to_string()))?;
                    return Ok(snapshot);
                }
                return Ok(inner.snapshot.clone());
            }
            let cancel = Arc::new(AtomicBool::new(false));
            inner.cancel = Some(cancel.clone());
            inner.running = true;
            inner.restart_requested = false;
            inner.pending_import = None;
            inner.snapshot.phase = DirectReadPhase::Starting;
            inner.snapshot.message =
                "正在初始化 Windows Packet Monitor…（内置 reliquary v23，适配游戏 4.5）".to_owned();
            inner.snapshot.started_at = Some(now_millis());
            inner.snapshot.requires_account_switch = false;
            inner.snapshot.incoming_uid = None;
            append_log(&mut inner.snapshot);
            cancel
        };
        let initial = state.snapshot()?;
        if let Some(diagnostics) = app.try_state::<crate::diagnostics::BackendDiagnostics>() {
            diagnostics.record("info", "direct_read", &initial.message);
        }
        app.emit("direct-read://status", &initial)
            .map_err(|error| AppError::DirectRead(error.to_string()))?;

        tauri::async_runtime::spawn(async move {
            let result = windows_capture::run(app.clone(), cancel.clone()).await;
            if let Some(state) = app.try_state::<DirectReadState>() {
                let restart_requested = if let Ok(mut inner) = state.inner.lock() {
                    inner.running = false;
                    inner.cancel = None;
                    std::mem::take(&mut inner.restart_requested)
                } else {
                    false
                };
                if let Err(error) = result {
                    if !cancel.load(Ordering::Relaxed) {
                        let _ = state.update(&app, |snapshot| {
                            snapshot.phase = DirectReadPhase::Error;
                            snapshot.message = format!("游戏数据直读失败：{error}");
                        });
                    }
                }
                if restart_requested {
                    if let Err(error) = start(app.clone()) {
                        let _ = state.update(&app, |snapshot| {
                            snapshot.phase = DirectReadPhase::Error;
                            snapshot.message = format!("游戏数据直读重试失败：{error}");
                        });
                    }
                }
            }
        });
        Ok(initial)
    }
}

pub fn stop(app: AppHandle) -> Result<DirectReadSnapshot, AppError> {
    let state = app.state::<DirectReadState>();
    {
        let mut inner = state.inner.lock().map_err(|_| AppError::StateUnavailable)?;
        inner.restart_requested = false;
        if let Some(cancel) = &inner.cancel {
            cancel.store(true, Ordering::Relaxed);
        }
    }
    state.update(&app, |snapshot| {
        snapshot.phase = DirectReadPhase::Stopped;
        snapshot.message = "游戏数据直读已停止".to_owned();
    })
}

pub fn confirm_account_switch(app: AppHandle) -> Result<DirectReadSnapshot, AppError> {
    let state = app.state::<DirectReadState>();
    let pending = {
        let mut inner = state.inner.lock().map_err(|_| AppError::StateUnavailable)?;
        inner.pending_import.take()
    }
    .ok_or(AppError::AccountMismatch)?;
    let store = app.state::<InventoryStore>();
    let summary = store.replace_account_and_apply(&pending)?;
    let uid = pending.metadata.uid;
    let snapshot = state.update(&app, |snapshot| {
        apply_summary(snapshot, &summary);
        snapshot.phase = DirectReadPhase::Ready;
        snapshot.message = "账号已切换，游戏数据同步完成".to_owned();
        snapshot.current_uid = uid;
        snapshot.incoming_uid = None;
        snapshot.requires_account_switch = false;
    })?;
    app.emit("inventory://changed", &summary)
        .map_err(|error| AppError::DirectRead(error.to_string()))?;
    Ok(snapshot)
}

pub fn inventory_changed(
    app: &AppHandle,
    summary: &InventorySummary,
    clear_account: bool,
) -> Result<DirectReadSnapshot, AppError> {
    let state = app.state::<DirectReadState>();
    state.update(app, |snapshot| {
        apply_summary(snapshot, summary);
        if clear_account {
            snapshot.current_uid = None;
            snapshot.incoming_uid = None;
            snapshot.requires_account_switch = false;
        }
    })
}

fn apply_summary(snapshot: &mut DirectReadSnapshot, summary: &InventorySummary) {
    snapshot.relics = summary.relics;
    snapshot.light_cones = summary.light_cones;
    snapshot.characters = summary.characters;
    snapshot.last_sync_at = summary.last_sync_at;
    snapshot
        .protocol_version
        .clone_from(&summary.protocol_version);
}

#[cfg_attr(not(windows), allow(dead_code))]
fn handle_import(app: &AppHandle, mut import: InventoryImport) -> Result<(), AppError> {
    let store = app.state::<InventoryStore>();
    let state = app.state::<DirectReadState>();
    let report = normalize_import(&mut import);
    match store.apply_full_snapshot(&import)? {
        Ok(summary) => {
            let uid = import.metadata.uid;
            {
                let mut inner = state.inner.lock().map_err(|_| AppError::StateUnavailable)?;
                inner.pending_import = None;
            }
            state.update(app, |snapshot| {
                apply_summary(snapshot, &summary);
                snapshot.phase = DirectReadPhase::Ready;
                snapshot.message = format!(
                    "同步完成：{} 件遗器 · {} 件光锥 · {} 名角色",
                    summary.relics, summary.light_cones, summary.characters
                );
                if !report.warnings().is_empty() {
                    snapshot.message.push_str("（存在待更新图鉴项）");
                }
                snapshot.current_uid = uid;
                snapshot.incoming_uid = None;
                snapshot.requires_account_switch = false;
            })?;
            app.emit("inventory://changed", &summary)
                .map_err(|error| AppError::DirectRead(error.to_string()))?;
        }
        Err(mismatch) => {
            {
                let mut inner = state.inner.lock().map_err(|_| AppError::StateUnavailable)?;
                inner.pending_import = Some(import);
            }
            state.update(app, |snapshot| {
                snapshot.phase = DirectReadPhase::Error;
                snapshot.message = "检测到不同账号；确认后将清空当前本地数据并切换".to_owned();
                snapshot.current_uid = Some(mismatch.existing_uid);
                snapshot.incoming_uid = Some(mismatch.incoming_uid);
                snapshot.requires_account_switch = true;
            })?;
        }
    }
    Ok(())
}

#[cfg_attr(not(windows), allow(dead_code))]
fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_log_is_bounded_and_ignores_duplicate_messages() {
        let mut snapshot = DirectReadSnapshot::default();
        snapshot.message = "监听已就绪".to_owned();
        append_log(&mut snapshot);
        append_log(&mut snapshot);
        assert_eq!(snapshot.logs.len(), 1);

        for index in 0..100 {
            snapshot.message = format!("进度 {index}");
            append_log(&mut snapshot);
        }
        assert_eq!(snapshot.logs.len(), MAX_DIRECT_READ_LOGS);
        assert_eq!(snapshot.logs.first().unwrap().message, "进度 20");
        assert_eq!(snapshot.logs.last().unwrap().message, "进度 99");
    }
}

#[cfg(windows)]
mod windows_capture {
    use std::collections::HashMap;
    use std::time::{Duration, Instant};

    use futures::StreamExt;
    use pktmon::{
        filter::{PktMonFilter, TransportProtocol},
        Capture, PacketPayload,
    };
    use reliquary::network::{
        command::command_id, ConnectionPacket, GameCommandError, GamePacket, GameSniffer,
        NetworkError,
    };
    use reliquary_archiver::export::{fribbels::OptimizerExporter, Exporter};

    use super::*;

    const PORTS: [u16; 2] = [23301, 23302];

    #[derive(Default)]
    struct CaptureCounts {
        packets: u64,
        commands: u64,
        parse_errors: u64,
        relevant: u64,
        imports: u64,
        handshake: bool,
    }

    fn progress_message(counts: &CaptureCounts, elapsed_secs: u64) -> String {
        if counts.packets == 0 {
            format!("监听运行 {elapsed_secs} 秒，尚未收到游戏 UDP 包；若已进入游戏，请检查端口或抓包权限。")
        } else if !counts.handshake {
            format!(
                "已收到 {} 个候选 UDP 包，尚未识别到游戏握手；请检查游戏端口。",
                counts.packets
            )
        } else if counts.commands == 0 {
            format!(
                "已识别游戏握手，收到 {} 个包，但尚未解析出命令；游戏更新后可能需要更新协议。",
                counts.packets
            )
        } else if counts.relevant == 0 {
            format!(
                "已解析 {} 条游戏命令，但没有识别到背包/角色命令；可能是游戏协议已变化。",
                counts.commands
            )
        } else {
            format!("收到 {} 包，解析 {} 条命令（失败 {}），背包相关 {} 条，成功入库 {} 次；等待后续数据。", counts.packets, counts.commands, counts.parse_errors, counts.relevant, counts.imports)
        }
    }

    pub async fn run(app: AppHandle, cancel: Arc<AtomicBool>) -> Result<(), String> {
        let state = app.state::<DirectReadState>();
        let store = app.state::<InventoryStore>();
        if let Ok(summary) = store.summary() {
            let _ = state.update(&app, |snapshot| apply_summary(snapshot, &summary));
        }

        let mut capture = Capture::new().map_err(|error| error.to_string())?;
        for port in PORTS {
            capture
                .add_filter(PktMonFilter {
                    name: format!("StarRail UDP {port}"),
                    transport_protocol: Some(TransportProtocol::UDP),
                    port: port.into(),
                    ..PktMonFilter::default()
                })
                .map_err(|error| error.to_string())?;
        }
        capture.start().map_err(|error| error.to_string())?;
        let stream = capture.stream().map_err(|error| error.to_string())?;
        futures::pin_mut!(stream);
        state
            .update(&app, |snapshot| {
                snapshot.phase = DirectReadPhase::WaitingForLogin;
                snapshot.message = "监听已就绪，请从“点击进入游戏”界面重新登录".to_owned();
            })
            .map_err(|error| error.to_string())?;

        let mut sniffer = GameSniffer::new();
        let mut exporters: HashMap<u32, OptimizerExporter> = HashMap::new();
        let mut counts = CaptureCounts::default();
        let capture_started = Instant::now();
        let mut last_progress = Instant::now();

        loop {
            let packet = tokio::select! {
                packet = stream.next() => packet,
                _ = tokio::time::sleep(std::time::Duration::from_millis(250)) => {
                    if cancel.load(Ordering::Relaxed) {
                        return Ok(());
                    }
                    if last_progress.elapsed() >= Duration::from_secs(10) {
                        let message = progress_message(&counts, capture_started.elapsed().as_secs());
                        let _ = state.update(&app, |snapshot| {
                            if matches!(snapshot.phase, DirectReadPhase::WaitingForLogin | DirectReadPhase::Connected | DirectReadPhase::Syncing) {
                                snapshot.message = message;
                            }
                        });
                        last_progress = Instant::now();
                    }
                    continue;
                }
            };
            if cancel.load(Ordering::Relaxed) {
                return Ok(());
            }
            let packet = packet.ok_or_else(|| "Packet Monitor 数据流意外结束".to_owned())?;
            let PacketPayload::Ethernet(payload) = packet.payload else {
                continue;
            };
            counts.packets += 1;
            if counts.packets == 1 {
                let _ = state.update(&app, |snapshot| {
                    snapshot.message = "已收到首个候选 UDP 包，正在识别游戏连接…".to_owned();
                });
            }

            let game_packets = match sniffer.receive_packet(payload) {
                Ok(packets) => packets,
                Err(error) => {
                    counts.parse_errors += 1;
                    if matches!(
                        error,
                        NetworkError::GameCommand(GameCommandError::DecryptionKeyMissing)
                    ) {
                        return Err("无法解析游戏加密密钥；当前协议可能不支持更新后的游戏版本。请导出“关于”中的分析日志。".to_owned());
                    }
                    continue;
                }
            };
            for game_packet in game_packets {
                if cancel.load(Ordering::Relaxed) {
                    return Ok(());
                }
                match game_packet {
                    GamePacket::Connection(ConnectionPacket::HandshakeEstablished { .. }) => {
                        counts.handshake = true;
                        let _ = state.update(&app, |snapshot| {
                            snapshot.phase = DirectReadPhase::Connected;
                            snapshot.message = "已连接游戏服务器，正在等待背包数据…".to_owned();
                        });
                    }
                    GamePacket::Connection(ConnectionPacket::Disconnected) => {
                        let _ = state.update(&app, |snapshot| {
                            snapshot.phase = DirectReadPhase::WaitingForLogin;
                            snapshot.message = "连接已断开，继续等待重新登录".to_owned();
                        });
                    }
                    GamePacket::Commands { conv_id, result } => {
                        let command = match result {
                            Ok(command) => command,
                            Err(GameCommandError::DecryptionKeyMissing) => {
                                return Err("无法解析游戏加密密钥；当前协议可能不支持更新后的游戏版本。请导出“关于”中的分析日志。".to_owned());
                            }
                            Err(_) => {
                                counts.parse_errors += 1;
                                continue;
                            }
                        };
                        counts.commands += 1;
                        let command_id_value = command.command_id;
                        let relevant = matches!(
                            command_id_value,
                            command_id::PlayerGetTokenScRsp
                                | command_id::PlayerLoginScRsp
                                | command_id::GetBagScRsp
                                | command_id::GetAvatarDataScRsp
                                | command_id::PlayerSyncScNotify
                                | command_id::SetAvatarEnhancedIdScRsp
                        );
                        if relevant {
                            counts.relevant += 1;
                            let _ = state.update(&app, |snapshot| {
                                snapshot.phase = DirectReadPhase::Syncing;
                                snapshot.message = "正在解析游戏背包与角色数据…".to_owned();
                            });
                        }
                        let exporter = exporters.entry(conv_id).or_default();
                        exporter.read_command(command);
                        if relevant && exporter.is_initialized() {
                            if let Some(export) = exporter.export() {
                                let value = serde_json::to_value(export)
                                    .map_err(|error| error.to_string())?;
                                let import: InventoryImport = serde_json::from_value(value)
                                    .map_err(|error| error.to_string())?;
                                handle_import(&app, import).map_err(|error| error.to_string())?;
                                counts.imports += 1;
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}
