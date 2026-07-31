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
        let snapshot = {
            let mut inner = self.inner.lock().map_err(|_| AppError::StateUnavailable)?;
            update(&mut inner.snapshot);
            inner.snapshot.clone()
        };
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
            inner.snapshot.message = "正在初始化 Windows Packet Monitor…".to_owned();
            inner.snapshot.started_at = Some(now_millis());
            inner.snapshot.requires_account_switch = false;
            inner.snapshot.incoming_uid = None;
            cancel
        };
        let initial = state.snapshot()?;
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

#[cfg(windows)]
mod windows_capture {
    use std::collections::HashMap;

    use futures::StreamExt;
    use pktmon::{
        filter::{PktMonFilter, TransportProtocol},
        Capture, PacketPayload,
    };
    use reliquary::network::{command::command_id, ConnectionPacket, GamePacket, GameSniffer};
    use reliquary_archiver::export::{fribbels::OptimizerExporter, Exporter};

    use super::*;

    const PORTS: [u16; 2] = [23301, 23302];

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

        loop {
            let packet = tokio::select! {
                packet = stream.next() => packet,
                _ = tokio::time::sleep(std::time::Duration::from_millis(250)) => {
                    if cancel.load(Ordering::Relaxed) {
                        return Ok(());
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

            let game_packets = match sniffer.receive_packet(payload) {
                Ok(packets) => packets,
                Err(_) => continue,
            };
            for game_packet in game_packets {
                if cancel.load(Ordering::Relaxed) {
                    return Ok(());
                }
                match game_packet {
                    GamePacket::Connection(ConnectionPacket::HandshakeEstablished { .. }) => {
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
                        let Ok(command) = result else {
                            continue;
                        };
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
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}
