use tauri::{AppHandle, Emitter, State};

use crate::{
    direct_read::{self, DirectReadSnapshot, DirectReadState},
    domain::{OcrImageResult, OcrModelConfig, ScanSnapshot, StartScanRequest, SystemCapabilities},
    error::AppError,
    inventory::{
        BuildRecommendation, BuildRecommendationRequest, CharacterBuildPlan, CharacterFilter,
        ClearInventoryRequest, DeleteItemsRequest, InventoryDetail, InventoryImportResult,
        InventoryKind, InventoryStore, InventorySummary, LightConeFilter, LightConeListItem,
        PagedResult, RelicFilter, RelicListItem,
    },
    scanner::ScannerState,
    screenshot,
};

#[cfg(feature = "ocr")]
use crate::ocr;

#[tauri::command]
pub fn get_system_capabilities() -> SystemCapabilities {
    SystemCapabilities {
        platform: std::env::consts::OS.to_owned(),
        window_capture: cfg!(windows),
        local_ocr: cfg!(feature = "ocr"),
        note: if cfg!(windows) {
            "Windows Packet Monitor 游戏数据直读与本地 OCR 均已启用。".to_owned()
        } else {
            "当前平台可使用数据管理和图片 OCR；游戏数据直读仅支持 Windows。".to_owned()
        },
    }
}

#[tauri::command]
pub fn get_scanner_snapshot(state: State<'_, ScannerState>) -> Result<ScanSnapshot, AppError> {
    state.snapshot()
}

#[tauri::command]
pub fn start_scanner(
    request: StartScanRequest,
    state: State<'_, ScannerState>,
) -> Result<ScanSnapshot, AppError> {
    state.start(request)
}

#[tauri::command]
pub fn stop_scanner(state: State<'_, ScannerState>) -> Result<ScanSnapshot, AppError> {
    state.stop()
}

#[tauri::command]
pub async fn recognize_image(
    image_path: String,
    models: OcrModelConfig,
) -> Result<OcrImageResult, AppError> {
    #[cfg(feature = "ocr")]
    {
        return tauri::async_runtime::spawn_blocking(move || {
            ocr::recognize_image(image_path, models)
        })
        .await
        .map_err(|error| AppError::Ocr(error.to_string()))?;
    }

    #[cfg(not(feature = "ocr"))]
    {
        let _ = (image_path, models);
        Err(AppError::Ocr(
            "OCR 功能未启用。请使用 --features ocr 重新构建。".to_owned(),
        ))
    }
}

#[tauri::command]
pub async fn recognize_screenshot(
    image_bytes: Vec<u8>,
    models: OcrModelConfig,
) -> Result<OcrImageResult, AppError> {
    #[cfg(feature = "ocr")]
    {
        return tauri::async_runtime::spawn_blocking(move || {
            ocr::recognize_screenshot(image_bytes, models)
        })
        .await
        .map_err(|error| AppError::Ocr(error.to_string()))?;
    }

    #[cfg(not(feature = "ocr"))]
    {
        let _ = (image_bytes, models);
        Err(AppError::Ocr(
            "OCR 功能未启用。请使用 --features ocr 重新构建。".to_owned(),
        ))
    }
}

#[tauri::command]
pub async fn capture_desktop() -> Result<Vec<u8>, AppError> {
    tauri::async_runtime::spawn_blocking(screenshot::capture_desktop)
        .await
        .map_err(|error| AppError::Capture(error.to_string()))?
}

#[tauri::command]
pub fn get_direct_read_snapshot(
    state: State<'_, DirectReadState>,
) -> Result<DirectReadSnapshot, AppError> {
    state.snapshot()
}

#[tauri::command]
pub fn start_direct_read(app: AppHandle) -> Result<DirectReadSnapshot, AppError> {
    direct_read::start(app)
}

#[tauri::command]
pub fn stop_direct_read(app: AppHandle) -> Result<DirectReadSnapshot, AppError> {
    direct_read::stop(app)
}

#[tauri::command]
pub fn confirm_account_switch(app: AppHandle) -> Result<DirectReadSnapshot, AppError> {
    direct_read::confirm_account_switch(app)
}

#[tauri::command]
pub fn get_inventory_summary(
    store: State<'_, InventoryStore>,
) -> Result<InventorySummary, AppError> {
    store.summary()
}

#[tauri::command]
pub fn list_relics(
    filter: RelicFilter,
    store: State<'_, InventoryStore>,
) -> Result<PagedResult<RelicListItem>, AppError> {
    store.list_relics(&filter)
}

#[tauri::command]
pub fn list_light_cones(
    filter: LightConeFilter,
    store: State<'_, InventoryStore>,
) -> Result<PagedResult<LightConeListItem>, AppError> {
    store.list_light_cones(&filter)
}

#[tauri::command]
pub fn list_characters(
    filter: CharacterFilter,
    store: State<'_, InventoryStore>,
) -> Result<PagedResult<crate::inventory::CharacterListItem>, AppError> {
    store.list_characters(&filter)
}

#[tauri::command]
pub fn get_inventory_detail(
    kind: InventoryKind,
    id: u32,
    store: State<'_, InventoryStore>,
) -> Result<InventoryDetail, AppError> {
    store.detail(kind, id)
}

#[tauri::command]
pub fn list_relic_sets(
    store: State<'_, InventoryStore>,
) -> Result<Vec<crate::inventory::RelicSetOption>, AppError> {
    store.list_relic_sets()
}

#[tauri::command]
pub fn get_character_build_plan(
    character_id: u32,
    store: State<'_, InventoryStore>,
) -> Result<Option<CharacterBuildPlan>, AppError> {
    store.build_plan(character_id)
}

#[tauri::command]
pub fn save_character_build_plan(
    plan: CharacterBuildPlan,
    store: State<'_, InventoryStore>,
) -> Result<(), AppError> {
    store.save_build_plan(&plan)
}

#[tauri::command]
pub fn delete_character_build_plan(
    character_id: u32,
    store: State<'_, InventoryStore>,
) -> Result<(), AppError> {
    store.delete_build_plan(character_id)
}

#[tauri::command]
pub fn recommend_character_build(
    request: BuildRecommendationRequest,
    store: State<'_, InventoryStore>,
) -> Result<BuildRecommendation, AppError> {
    store.recommend_build(&request)
}

#[tauri::command]
pub fn delete_inventory_items(
    request: DeleteItemsRequest,
    app: AppHandle,
    store: State<'_, InventoryStore>,
) -> Result<u64, AppError> {
    let deleted = store.delete_items(&request)?;
    let summary = store.summary()?;
    direct_read::inventory_changed(&app, &summary, false)?;
    let _ = app.emit("inventory://changed", &summary);
    Ok(deleted)
}

#[tauri::command]
pub fn clear_inventory(
    request: ClearInventoryRequest,
    app: AppHandle,
    store: State<'_, InventoryStore>,
) -> Result<InventorySummary, AppError> {
    let clear_account = request.kind.is_none();
    store.clear(request.kind)?;
    let summary = store.summary()?;
    direct_read::inventory_changed(&app, &summary, clear_account)?;
    let _ = app.emit("inventory://changed", &summary);
    Ok(summary)
}

#[tauri::command]
pub async fn export_inventory(
    store: State<'_, InventoryStore>,
) -> Result<Option<String>, AppError> {
    let Some(file) = rfd::AsyncFileDialog::new()
        .set_title("导出星穹铁道数据")
        .set_file_name("starrail-inventory.json")
        .add_filter("JSON", &["json"])
        .save_file()
        .await
    else {
        return Ok(None);
    };
    let path = file.path();
    store.export_to_path(path)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn import_inventory(
    app: AppHandle,
    store: State<'_, InventoryStore>,
) -> Result<Option<InventoryImportResult>, AppError> {
    let Some(file) = rfd::AsyncFileDialog::new()
        .set_title("导入星穹铁道数据")
        .add_filter("JSON", &["json"])
        .pick_file()
        .await
    else {
        return Ok(None);
    };
    let path = file.path();
    let file = std::fs::File::open(path)?;
    let mut import: crate::inventory::InventoryImport = serde_json::from_reader(file)
        .map_err(|error| AppError::Database(format!("JSON 格式无效：{error}")))?;
    let report = crate::inventory::normalize_import(&mut import);
    let summary = match store.apply_full_snapshot(&import)? {
        Ok(summary) => summary,
        Err(_) => return Err(AppError::AccountMismatch),
    };
    direct_read::inventory_changed(&app, &summary, false)?;
    let _ = app.emit("inventory://changed", &summary);
    Ok(Some(InventoryImportResult {
        summary,
        warnings: report.warnings(),
    }))
}
