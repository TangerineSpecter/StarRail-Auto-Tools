use tauri::{AppHandle, Emitter, State};

use crate::{
    direct_read::{self, DirectReadSnapshot, DirectReadState},
    domain::{OcrImageResult, OcrModelConfig, ScanSnapshot, StartScanRequest, SystemCapabilities},
    error::AppError,
    inventory::{
        CharacterFilter, ClearInventoryRequest, DeleteItemsRequest, InventoryDetail, InventoryKind,
        InventoryStore, InventorySummary, LightConeFilter, LightConeListItem, PagedResult,
        RelicFilter, RelicListItem,
    },
    ocr,
    scanner::ScannerState,
};

#[tauri::command]
pub fn get_system_capabilities() -> SystemCapabilities {
    SystemCapabilities {
        platform: std::env::consts::OS.to_owned(),
        window_capture: cfg!(windows),
        local_ocr: true,
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
    tauri::async_runtime::spawn_blocking(move || ocr::recognize_image(image_path, models))
        .await
        .map_err(|error| AppError::Ocr(error.to_string()))?
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
pub fn export_inventory(store: State<'_, InventoryStore>) -> Result<Option<String>, AppError> {
    let Some(path) = rfd::FileDialog::new()
        .set_title("导出星穹铁道数据")
        .set_file_name("starrail-inventory.json")
        .add_filter("JSON", &["json"])
        .save_file()
    else {
        return Ok(None);
    };
    store.export_to_path(&path)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}
