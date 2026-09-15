use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::{
    error::AppError,
    inventory::{
        CleanupItemUpdate, CleanupRunDetail, CleanupRunSummary, FrozenCleanupRun, InventoryStore,
    },
    ocr_model::{OcrModelManager, MODEL_REVISION},
};

pub const TEMPLATE_REVISION: &str = "zh-CN-uncalibrated-v1";
const TEMPLATE_MANIFEST: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/assets/relic-cleanup/zh-CN/template-manifest.json"
));

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupProgress {
    pub run_id: u64,
    pub run_code: String,
    pub phase: String,
    pub current: u64,
    pub total: u64,
    pub message: String,
    pub terminal: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupCapabilities {
    pub platform_supported: bool,
    pub templates_calibrated: bool,
    pub preview_available: bool,
    pub execution_available: bool,
    pub message: String,
}

#[derive(Clone)]
pub struct RelicCleanupRuntime {
    root: PathBuf,
    inventory: InventoryStore,
    models: OcrModelManager,
    app: AppHandle,
    cancelled: Arc<AtomicBool>,
    active_run: Arc<Mutex<Option<u64>>>,
    latest_progress: Arc<Mutex<Option<CleanupProgress>>>,
}

impl RelicCleanupRuntime {
    pub fn new(
        app_data: &Path,
        inventory: InventoryStore,
        models: OcrModelManager,
        app: AppHandle,
    ) -> Self {
        Self {
            root: app_data.join("relic-cleanup"),
            inventory,
            models,
            app,
            cancelled: Arc::new(AtomicBool::new(false)),
            active_run: Arc::new(Mutex::new(None)),
            latest_progress: Arc::new(Mutex::new(None)),
        }
    }

    pub fn task_status(&self) -> Result<Option<CleanupProgress>, AppError> {
        self.latest_progress
            .lock()
            .map(|progress| progress.clone())
            .map_err(|_| AppError::StateUnavailable)
    }

    pub fn capabilities(&self) -> CleanupCapabilities {
        let platform_supported = cfg!(windows);
        let templates_calibrated = templates_calibrated();
        CleanupCapabilities {
            platform_supported,
            templates_calibrated,
            preview_available: false,
            execution_available: false,
            message: if !platform_supported {
                "遗器清理首版仅支持 Windows 10/11".to_owned()
            } else if !templates_calibrated {
                "视觉模板尚未校准，预览和执行暂不可用".to_owned()
            } else {
                "视觉扫描与执行状态机尚未完成验收，功能保持安全关闭".to_owned()
            },
        }
    }

    pub fn start_preview(&self) -> Result<CleanupRunSummary, AppError> {
        let capabilities = self.capabilities();
        if !capabilities.preview_available {
            return Err(AppError::RelicCleanup(capabilities.message));
        }
        let mut active = self
            .active_run
            .lock()
            .map_err(|_| AppError::StateUnavailable)?;
        if let Some(run_id) = *active {
            return Err(AppError::RelicCleanup(format!(
                "已有 run-{run_id:06} 正在执行，请先停止或等待完成"
            )));
        }
        self.models.paths()?;
        let frozen = self
            .inventory
            .freeze_cleanup_run(MODEL_REVISION, TEMPLATE_REVISION)?;
        let directory = self.root.join(format!("run-{:06}", frozen.run_id));
        for child in ["matched", "exceptions", "execution"] {
            fs::create_dir_all(directory.join(child))?;
        }
        self.inventory
            .set_cleanup_run_directory(frozen.run_id, &directory.display().to_string())?;
        self.write_manifest(
            &directory,
            &frozen,
            "preparingPreview",
            "预览已冻结，等待页面校验",
        )?;
        self.append_event(&directory, "preparingPreview", "已冻结候选、UID 与库存哈希")?;
        let run_id = frozen.run_id;
        *active = Some(run_id);
        drop(active);
        self.cancelled.store(false, Ordering::SeqCst);
        self.emit(
            run_id,
            "preparingPreview",
            0,
            frozen.items.len() as u64,
            "预览已冻结，等待页面校验",
            false,
        );
        let runtime = self.clone();
        tauri::async_runtime::spawn(async move { runtime.run_preview(frozen, directory).await });
        self.inventory
            .list_cleanup_runs()?
            .into_iter()
            .find(|run| run.run_id == run_id)
            .ok_or_else(|| AppError::RelicCleanup("预览记录创建失败".to_owned()))
    }

    pub fn start_execution(&self, run_id: u64) -> Result<CleanupRunDetail, AppError> {
        let capabilities = self.capabilities();
        if !capabilities.execution_available {
            return Err(AppError::RelicCleanup(capabilities.message));
        }
        let detail = self.inventory.cleanup_run_detail(run_id)?;
        if !detail.currently_valid {
            self.inventory.update_cleanup_run(
                run_id,
                "previewInvalidated",
                "UID 或遗器库存已变化，本次预览已作废",
                true,
            )?;
            return Err(AppError::RelicCleanup(
                "UID 或遗器库存已变化，请重新运行预览".to_owned(),
            ));
        }
        if detail.run.status != "previewCompleted" {
            return Err(AppError::RelicCleanup(
                "只能执行已完成且仍然有效的预览".to_owned(),
            ));
        }
        let matched = detail
            .items
            .iter()
            .filter(|item| item.preview_status == "uniqueMatch")
            .count();
        if matched == 0 {
            return Err(AppError::RelicCleanup(
                "该预览没有可安全执行的唯一匹配项".to_owned(),
            ));
        }
        if !templates_calibrated() {
            return Err(AppError::RelicCleanup(
                "识别模板尚未校准，执行输入已被安全锁阻止".to_owned(),
            ));
        }
        // Selection is deliberately unreachable until a reviewed template set exists.
        // This guard prevents a release with empty/placeholder assets from ever sending input.
        Err(AppError::RelicCleanup(
            "当前模板版本尚未实现执行坐标映射，请先完成视觉素材校准".to_owned(),
        ))
    }

    pub fn cancel(&self) -> Result<(), AppError> {
        self.cancelled.store(true, Ordering::SeqCst);
        Ok(())
    }

    pub fn open_run_directory(&self, run_id: u64) -> Result<(), AppError> {
        let detail = self.inventory.cleanup_run_detail(run_id)?;
        let directory = detail
            .run
            .directory
            .ok_or_else(|| AppError::RelicCleanup("该运行尚未创建目录".to_owned()))?;
        #[cfg(windows)]
        Command::new("explorer")
            .arg(&directory)
            .spawn()
            .map_err(|error| AppError::RelicCleanup(error.to_string()))?;
        #[cfg(target_os = "macos")]
        Command::new("open")
            .arg(&directory)
            .spawn()
            .map_err(|error| AppError::RelicCleanup(error.to_string()))?;
        #[cfg(all(not(windows), not(target_os = "macos")))]
        Command::new("xdg-open")
            .arg(&directory)
            .spawn()
            .map_err(|error| AppError::RelicCleanup(error.to_string()))?;
        Ok(())
    }

    pub fn delete_run(&self, run_id: u64) -> Result<(), AppError> {
        let directory = self.inventory.delete_cleanup_run(run_id)?;
        if let Some(directory) = directory {
            let path = PathBuf::from(directory);
            if path.starts_with(&self.root) && path.exists() {
                fs::remove_dir_all(path)?;
            }
        }
        Ok(())
    }

    async fn run_preview(&self, frozen: FrozenCleanupRun, directory: PathBuf) {
        let result = self.run_preview_inner(&frozen, &directory).await;
        if let Err(error) = result {
            let status = if self.cancelled.load(Ordering::SeqCst) {
                "cancelled"
            } else {
                "previewFailed"
            };
            let mut message = error.to_string();
            let _ = self
                .inventory
                .update_cleanup_run(frozen.run_id, status, &message, true);
            if let Err(manifest_error) = self.write_database_manifest(&directory, frozen.run_id) {
                message = format!("{message}；审计清单写入失败：{manifest_error}");
                let _ = self
                    .inventory
                    .update_cleanup_run(frozen.run_id, status, &message, true);
            }
            let _ = self.append_event(&directory, status, &message);
            self.emit(
                frozen.run_id,
                status,
                0,
                frozen.items.len() as u64,
                message,
                true,
            );
        }
        if let Ok(mut active) = self.active_run.lock() {
            if *active == Some(frozen.run_id) {
                *active = None;
            }
        }
    }

    async fn run_preview_inner(
        &self,
        frozen: &FrozenCleanupRun,
        directory: &Path,
    ) -> Result<(), AppError> {
        self.inventory.update_cleanup_run(
            frozen.run_id,
            "validatingPage",
            "正在校验游戏窗口和分解页面",
            false,
        )?;
        self.append_event(directory, "validatingPage", "正在校验游戏窗口和分解页面")?;
        self.emit(
            frozen.run_id,
            "validatingPage",
            0,
            frozen.items.len() as u64,
            "正在校验游戏窗口和分解页面",
            false,
        );
        if self.cancelled.load(Ordering::SeqCst) {
            return Err(AppError::RelicCleanup("任务已取消".to_owned()));
        }

        #[cfg(windows)]
        let screenshot = crate::game_launch::windows::capture_foreground_game_client()
            .map_err(AppError::RelicCleanup)?;
        #[cfg(not(windows))]
        let screenshot: Vec<u8> = Vec::new();

        if !cfg!(windows) {
            return Err(AppError::RelicCleanup(
                "遗器清理首版仅支持 Windows 10/11".to_owned(),
            ));
        }
        if !templates_calibrated() {
            let relative = "exceptions/0000-page-template-unavailable.png";
            atomic_write(&directory.join(relative), &screenshot)?;
            for (index, item) in frozen.items.iter().enumerate() {
                if frozen.ambiguous_item_ids.contains(&item.item_id) {
                    continue;
                }
                self.inventory.update_cleanup_run_item(
                    frozen.run_id,
                    item.item_id,
                    CleanupItemUpdate {
                        preview_status: "recognitionUnavailable",
                        execution_status: "notStarted",
                        confidence: None,
                        image_path: Some(relative),
                        reason: Some("尚未提供并校准分解页视觉素材；未发送任何游戏输入"),
                    },
                )?;
                self.emit(
                    frozen.run_id,
                    "scanning",
                    (index + 1) as u64,
                    frozen.items.len() as u64,
                    format!("已安全跳过 {}", item.display_name),
                    false,
                );
            }
            return Err(AppError::RelicCleanup(
                "模板未校准：异常截图已保存，请按素材采集文档补充样本".to_owned(),
            ));
        }
        Err(AppError::RelicCleanup(
            "模板清单声明已校准，但扫描实现版本不兼容；已停止".to_owned(),
        ))
    }

    fn write_manifest(
        &self,
        directory: &Path,
        frozen: &FrozenCleanupRun,
        status: &str,
        message: &str,
    ) -> Result<(), AppError> {
        let manifest = json!({
            "schemaVersion": 1,
            "runId": frozen.run_id,
            "runCode": format!("run-{:06}", frozen.run_id),
            "status": status,
            "message": message,
            "uid": frozen.uid,
            "inventoryHash": frozen.inventory_hash,
            "modelRevision": MODEL_REVISION,
            "templateRevision": TEMPLATE_REVISION,
            "protocolVersion": crate::inventory::PROTOCOL_VERSION,
            "items": frozen.items,
        });
        let bytes = serde_json::to_vec_pretty(&manifest)
            .map_err(|error| AppError::RelicCleanup(error.to_string()))?;
        atomic_write(&directory.join("manifest.json"), &bytes)
    }

    fn append_event(&self, directory: &Path, phase: &str, message: &str) -> Result<(), AppError> {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(directory.join("events.jsonl"))?;
        let event = json!({
            "timestamp": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis(),
            "phase": phase,
            "message": message
        });
        writeln!(file, "{event}")?;
        file.flush()?;
        Ok(())
    }

    fn write_database_manifest(&self, directory: &Path, run_id: u64) -> Result<(), AppError> {
        let detail = self.inventory.cleanup_run_detail(run_id)?;
        let mut manifest = serde_json::to_value(detail)
            .map_err(|error| AppError::RelicCleanup(error.to_string()))?;
        manifest["schemaVersion"] = json!(1);
        let bytes = serde_json::to_vec_pretty(&manifest)
            .map_err(|error| AppError::RelicCleanup(error.to_string()))?;
        atomic_write(&directory.join("manifest.json"), &bytes)
    }

    fn emit(
        &self,
        run_id: u64,
        phase: &str,
        current: u64,
        total: u64,
        message: impl Into<String>,
        terminal: bool,
    ) {
        let progress = CleanupProgress {
            run_id,
            run_code: format!("run-{run_id:06}"),
            phase: phase.to_owned(),
            current,
            total,
            message: message.into(),
            terminal,
        };
        if let Ok(mut latest) = self.latest_progress.lock() {
            *latest = Some(progress.clone());
        }
        let _ = self.app.emit("relic-cleanup://progress", progress);
    }
}

fn templates_calibrated() -> bool {
    serde_json::from_str::<serde_json::Value>(TEMPLATE_MANIFEST)
        .ok()
        .and_then(|value| value.get("calibrated").and_then(serde_json::Value::as_bool))
        .unwrap_or(false)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    let temporary = path.with_extension(format!(
        "{}part",
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
    ));
    fs::write(&temporary, bytes)?;
    atomic_replace(&temporary, path)?;
    Ok(())
}

#[cfg(not(windows))]
fn atomic_replace(source: &Path, destination: &Path) -> Result<(), AppError> {
    fs::rename(source, destination)?;
    Ok(())
}

#[cfg(windows)]
fn atomic_replace(source: &Path, destination: &Path) -> Result<(), AppError> {
    use std::{iter::once, os::windows::ffi::OsStrExt};
    use windows::{
        core::PCWSTR,
        Win32::Storage::FileSystem::{
            MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        },
    };

    let source = source
        .as_os_str()
        .encode_wide()
        .chain(once(0))
        .collect::<Vec<_>>();
    let destination = destination
        .as_os_str()
        .encode_wide()
        .chain(once(0))
        .collect::<Vec<_>>();
    unsafe {
        MoveFileExW(
            PCWSTR(source.as_ptr()),
            PCWSTR(destination.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
        .map_err(|error| AppError::RelicCleanup(error.to_string()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placeholder_templates_are_fail_closed() {
        assert!(!templates_calibrated());
        assert!(TEMPLATE_REVISION.contains("uncalibrated"));
    }

    #[test]
    fn atomic_write_replaces_an_existing_manifest() {
        let directory = std::env::temp_dir().join(format!(
            "starrail-cleanup-atomic-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("manifest.json");
        atomic_write(&path, b"old").unwrap();
        atomic_write(&path, b"new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        let _ = fs::remove_dir_all(directory);
    }
}
