mod settings;
#[cfg(windows)]
mod windows;

use std::{
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::{
    direct_read::{self, DirectReadSnapshot},
    error::AppError,
};

#[cfg(windows)]
use crate::direct_read::DirectReadPhase;

pub use settings::{GameLaunchDetection, GameLaunchSettings, GameLaunchStore};

#[cfg(windows)]
const GAME_WINDOW_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(90);
#[cfg(windows)]
const DATA_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(180);
#[cfg(windows)]
const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_secs(2);

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GameCapturePhase {
    PreparingListener,
    LaunchingLauncher,
    StartingGame,
    WaitingForGameWindow,
    EnteringGame,
    WaitingForData,
    Completed,
    Failed,
    Cancelled,
}

impl GameCapturePhase {
    fn terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Failed | Self::Cancelled)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameCaptureTask {
    pub task_id: String,
    pub phase: GameCapturePhase,
    pub message: String,
    pub terminal: bool,
    pub direct_read: DirectReadSnapshot,
}

#[derive(Clone)]
pub struct GameLaunchRuntime {
    store: GameLaunchStore,
    app: AppHandle,
    task: Arc<Mutex<Option<GameCaptureTask>>>,
}

impl GameLaunchRuntime {
    pub fn new(store: GameLaunchStore, app: AppHandle) -> Self {
        Self {
            store,
            app,
            task: Arc::new(Mutex::new(None)),
        }
    }

    pub fn settings(&self) -> Result<GameLaunchSettings, AppError> {
        self.store.load()
    }

    pub fn save_settings(
        &self,
        settings: GameLaunchSettings,
    ) -> Result<GameLaunchSettings, AppError> {
        self.store.save(settings)
    }

    pub fn detect_launcher(&self) -> GameLaunchDetection {
        settings::detect_launcher()
    }

    pub fn start(&self) -> Result<GameCaptureTask, AppError> {
        if !cfg!(windows) {
            return Err(AppError::Mcp(
                "启动游戏并采集仅支持 Windows 10/11".to_owned(),
            ));
        }
        let mut guard = self.task.lock().map_err(|_| AppError::StateUnavailable)?;
        if let Some(task) = guard.as_ref().filter(|task| !task.terminal) {
            return Ok(task.clone());
        }
        let task = GameCaptureTask {
            task_id: new_task_id(),
            phase: GameCapturePhase::PreparingListener,
            message: "正在初始化游戏数据监听…".to_owned(),
            terminal: false,
            direct_read: snapshot(&self.app)?,
        };
        *guard = Some(task.clone());
        drop(guard);
        let runtime = self.clone();
        let task_id = task.task_id.clone();
        tauri::async_runtime::spawn(async move { runtime.run(task_id).await });
        Ok(task)
    }

    pub fn status(&self, task_id: &str) -> Result<GameCaptureTask, AppError> {
        let mut task = self
            .task
            .lock()
            .map_err(|_| AppError::StateUnavailable)?
            .as_ref()
            .filter(|task| task.task_id == task_id)
            .cloned()
            .ok_or_else(|| AppError::Mcp(format!("找不到启动采集任务：{task_id}")))?;
        task.direct_read = snapshot(&self.app)?;
        Ok(task)
    }

    async fn run(&self, task_id: String) {
        #[cfg(windows)]
        self.run_windows(&task_id).await;
        #[cfg(not(windows))]
        self.update(
            &task_id,
            GameCapturePhase::Failed,
            "启动游戏并采集仅支持 Windows 10/11。",
        );
    }

    #[cfg(windows)]
    async fn run_windows(&self, task_id: &str) {
        if windows::game_is_running() {
            self.update(
                task_id,
                GameCapturePhase::Failed,
                "检测到游戏客户端已在运行；为避免误点当前游戏窗口，请关闭游戏后再启动采集。",
            );
            return;
        }
        let baseline = snapshot(&self.app)
            .ok()
            .and_then(|value| value.last_sync_at)
            .unwrap_or(0);
        if let Err(error) = direct_read::start(self.app.clone()) {
            self.update(task_id, GameCapturePhase::Failed, error.to_string());
            return;
        }
        let launcher = match self.configured_launcher_path() {
            Ok(path) => path,
            Err(error) => {
                self.update(task_id, GameCapturePhase::Failed, error.to_string());
                return;
            }
        };
        self.update(
            task_id,
            GameCapturePhase::LaunchingLauncher,
            "正在检查并启动米哈游启动器…",
        );
        let launcher_pid = match windows::start_or_reuse_launcher(&launcher) {
            Ok(pid) => pid,
            Err(error) => {
                self.update(task_id, GameCapturePhase::Failed, error);
                return;
            }
        };
        let game = match self.open_game_from_launcher(task_id, launcher_pid).await {
            Ok(game) => game,
            Err(error) => {
                self.update(task_id, GameCapturePhase::Failed, error);
                return;
            }
        };
        self.wait_for_new_capture(task_id, baseline, game).await;
    }

    #[cfg(windows)]
    fn configured_launcher_path(&self) -> Result<std::path::PathBuf, AppError> {
        let settings = self.settings()?;
        settings::validate_launcher_path(&settings.launcher_path).map_err(|error| {
            AppError::Mcp(format!(
                "{error}。请在软件设置 → 游戏启动与采集配置启动器位置。"
            ))
        })?;
        Ok(settings.launcher_path.into())
    }

    #[cfg(windows)]
    async fn open_game_from_launcher(
        &self,
        task_id: &str,
        launcher_pid: u32,
    ) -> Result<windows::GameWindow, String> {
        self.update(
            task_id,
            GameCapturePhase::StartingGame,
            "正在点击启动器的“开始游戏”…",
        );
        windows::invoke_launcher_start(launcher_pid).await?;
        self.update(
            task_id,
            GameCapturePhase::WaitingForGameWindow,
            "已请求启动游戏，正在等待游戏客户端窗口…",
        );
        let game = windows::wait_for_game_window(GAME_WINDOW_TIMEOUT).await?;
        self.update(
            task_id,
            GameCapturePhase::EnteringGame,
            "游戏客户端已就绪，正在识别“点击进入”界面…",
        );
        if let Err(error) = windows::wait_for_enter_screen_and_click(game).await {
            let close_suffix = match windows::close_game_window(game).await {
                Ok(()) => " 已关闭本次启动的游戏客户端。".to_owned(),
                Err(close_error) => format!(" 游戏客户端关闭失败：{close_error}"),
            };
            return Err(format!("{error}{close_suffix}"));
        }
        Ok(game)
    }

    #[cfg(windows)]
    async fn wait_for_new_capture(&self, task_id: &str, baseline: i64, game: windows::GameWindow) {
        self.update(
            task_id,
            GameCapturePhase::WaitingForData,
            "已向游戏发送“点击进入”指令，正在等待登录与背包数据…",
        );
        let deadline = tokio::time::Instant::now() + DATA_TIMEOUT;
        loop {
            if !windows::game_window_is_open(game) {
                self.finish_and_close_game(
                    task_id,
                    game,
                    GameCapturePhase::Failed,
                    "游戏客户端已关闭，已终止本次数据监听。",
                )
                .await;
                return;
            }
            let current = match snapshot(&self.app) {
                Ok(value) => value,
                Err(error) => {
                    self.finish_and_close_game(
                        task_id,
                        game,
                        GameCapturePhase::Failed,
                        error.to_string(),
                    )
                    .await;
                    return;
                }
            };
            if current.requires_account_switch {
                self.finish_and_close_game(
                    task_id,
                    game,
                    GameCapturePhase::Failed,
                    "检测到不同账号，需要在软件内确认账号切换后再重试。",
                )
                .await;
                return;
            }
            if current.phase == DirectReadPhase::Error {
                self.finish_and_close_game(
                    task_id,
                    game,
                    GameCapturePhase::Failed,
                    current.message,
                )
                .await;
                return;
            }
            if current.phase == DirectReadPhase::Ready
                && current.last_sync_at.unwrap_or(0) > baseline
            {
                self.finish_and_close_game(
                    task_id,
                    game,
                    GameCapturePhase::Completed,
                    "已获取并归档本次游戏数据。",
                )
                .await;
                return;
            }
            if tokio::time::Instant::now() >= deadline {
                self.finish_and_close_game(
                    task_id,
                    game,
                    GameCapturePhase::Failed,
                    "180 秒内未收到新的登录或背包数据；请确认账号已登录、已进入游戏且网络正常。",
                )
                .await;
                return;
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    }

    #[cfg(windows)]
    async fn finish_and_close_game(
        &self,
        task_id: &str,
        game: windows::GameWindow,
        phase: GameCapturePhase,
        message: impl Into<String>,
    ) {
        let message = message.into();
        self.update(
            task_id,
            GameCapturePhase::WaitingForData,
            format!("{message} 正在关闭本次启动的游戏客户端…"),
        );
        let close_result = windows::close_game_window(game).await;
        let suffix = match close_result {
            Ok(()) => " 游戏客户端已关闭。".to_owned(),
            Err(error) => format!(" 游戏客户端关闭失败：{error}"),
        };
        self.update(task_id, phase, format!("{message}{suffix}"));
    }

    fn update(&self, task_id: &str, phase: GameCapturePhase, message: impl Into<String>) {
        let direct = snapshot(&self.app).unwrap_or_default();
        if let Ok(mut guard) = self.task.lock() {
            if let Some(task) = guard.as_mut().filter(|task| task.task_id == task_id) {
                task.phase = phase;
                task.message = message.into();
                task.terminal = phase.terminal();
                task.direct_read = direct;
            }
        }
    }
}

fn snapshot(app: &AppHandle) -> Result<DirectReadSnapshot, AppError> {
    app.state::<direct_read::DirectReadState>().snapshot()
}

fn new_task_id() -> String {
    format!(
        "capture-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn phase_terminal_states_are_correct() {
        assert!(GameCapturePhase::Completed.terminal());
        assert!(GameCapturePhase::Failed.terminal());
        assert!(!GameCapturePhase::WaitingForData.terminal());
    }
}
