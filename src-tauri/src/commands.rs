use tauri::{AppHandle, Emitter, State};

use crate::{
    direct_read::{self, DirectReadSnapshot, DirectReadState},
    domain::{OcrImageResult, OcrModelConfig, ScanSnapshot, StartScanRequest, SystemCapabilities},
    error::AppError,
    inventory::{
        BuildPlanExcelImportResult, BuildRecommendation, BuildRecommendationRequest,
        CharacterBuildPlan, CharacterBuildScore, CharacterFilter, ClearInventoryRequest,
        DeleteItemsRequest, InventoryDetail, InventoryEquipmentCounts, InventoryImportResult,
        InventoryKind, InventoryStore, InventorySummary, LightConeFilter, LightConeListItem,
        PageQuery, PagedResult, RelicFilter, RelicListItem, RelicMainStatGroupedResult,
        RelicMainStatScanResult, RelicSetRecommendedCharacter, Team, TeamFilter, TeamInput,
    },
    mcp::{McpRuntime, McpSettings, McpStatus},
    scanner::ScannerState,
    screenshot,
    sync::{self, SyncSettings, SyncStore, WebDavSettings},
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
pub fn get_webdav_settings(store: State<'_, SyncStore>) -> Result<WebDavSettings, AppError> {
    Ok(store.load()?.webdav)
}

#[tauri::command]
pub fn save_webdav_settings(
    settings: WebDavSettings,
    store: State<'_, SyncStore>,
) -> Result<(), AppError> {
    store.save_webdav(&settings)
}

#[tauri::command]
pub async fn test_webdav_connection(settings: WebDavSettings) -> Result<(), AppError> {
    sync::test_webdav(&settings).await
}

#[tauri::command]
pub async fn upload_webdav_snapshot(
    settings: WebDavSettings,
    inventory: State<'_, InventoryStore>,
) -> Result<(), AppError> {
    sync::upload_webdav_snapshot(&settings, inventory.sync_snapshot()?).await
}

#[tauri::command]
pub async fn download_webdav_snapshot(
    settings: WebDavSettings,
    app: AppHandle,
    inventory: State<'_, InventoryStore>,
) -> Result<InventorySummary, AppError> {
    let snapshot = sync::download_webdav_snapshot(&settings).await?;
    publish_restored_snapshot(&app, &inventory, snapshot)
}

#[tauri::command]
pub fn get_sync_settings(store: State<'_, SyncStore>) -> Result<SyncSettings, AppError> {
    store.load()
}

#[tauri::command]
pub fn save_sync_settings(
    settings: SyncSettings,
    store: State<'_, SyncStore>,
) -> Result<(), AppError> {
    store.save(&settings)
}

#[tauri::command]
pub async fn test_sync_connection(
    settings: SyncSettings,
    store: State<'_, SyncStore>,
) -> Result<(), AppError> {
    let known_hosts = store.known_hosts_path().to_path_buf();
    sync::test(&settings, &known_hosts).await
}

#[tauri::command]
pub async fn upload_sync_snapshot(
    settings: SyncSettings,
    store: State<'_, SyncStore>,
    inventory: State<'_, InventoryStore>,
) -> Result<(), AppError> {
    let known_hosts = store.known_hosts_path().to_path_buf();
    sync::upload_snapshot(&settings, &known_hosts, inventory.sync_snapshot()?).await
}

#[tauri::command]
pub async fn download_sync_snapshot(
    settings: SyncSettings,
    store: State<'_, SyncStore>,
    app: AppHandle,
    inventory: State<'_, InventoryStore>,
) -> Result<InventorySummary, AppError> {
    let known_hosts = store.known_hosts_path().to_path_buf();
    let snapshot = sync::download_snapshot(&settings, &known_hosts).await?;
    publish_restored_snapshot(&app, &inventory, snapshot)
}

fn publish_restored_snapshot(
    app: &AppHandle,
    inventory: &InventoryStore,
    snapshot: crate::inventory::SyncSnapshot,
) -> Result<InventorySummary, AppError> {
    let summary = inventory.replace_with_sync_snapshot(snapshot)?;
    direct_read::inventory_changed(app, &summary, false)?;
    let _ = app.emit("inventory://changed", &summary);
    Ok(summary)
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
pub fn get_inventory_equipment_counts(
    store: State<'_, InventoryStore>,
) -> Result<InventoryEquipmentCounts, AppError> {
    store.equipment_counts()
}

#[tauri::command]
pub fn get_relic_main_stat_scan_plan_count(
    store: State<'_, InventoryStore>,
) -> Result<u64, AppError> {
    store.build_plan_count()
}

#[tauri::command]
pub fn scan_relics_by_main_stat(
    page: PageQuery,
    store: State<'_, InventoryStore>,
) -> Result<RelicMainStatScanResult, AppError> {
    store.scan_relics_by_main_stat(&page)
}

#[tauri::command]
pub fn scan_relics_by_main_stat_grouped(
    store: State<'_, InventoryStore>,
) -> Result<RelicMainStatGroupedResult, AppError> {
    store.scan_relics_by_main_stat_grouped()
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
pub fn get_build_dashboard(
    store: State<'_, InventoryStore>,
) -> Result<Vec<crate::inventory::BuildDashboardEntry>, AppError> {
    store.build_dashboard()
}

#[tauri::command]
pub fn reorder_build_dashboard(
    character_ids: Vec<u32>,
    store: State<'_, InventoryStore>,
) -> Result<(), AppError> {
    store.reorder_build_dashboard(&character_ids)
}

#[tauri::command]
pub fn set_build_dashboard_pinned(
    character_id: u32,
    pinned: bool,
    store: State<'_, InventoryStore>,
) -> Result<(), AppError> {
    store.set_build_dashboard_pinned(character_id, pinned)
}

#[tauri::command]
pub fn list_relic_set_recommended_characters(
    set_id: u32,
    store: State<'_, InventoryStore>,
) -> Result<Vec<RelicSetRecommendedCharacter>, AppError> {
    store.recommended_characters_for_relic_set(set_id)
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
pub async fn export_character_build_plans_excel(
    store: State<'_, InventoryStore>,
) -> Result<Option<String>, AppError> {
    let Some(file) = rfd::AsyncFileDialog::new()
        .set_title("导出角色目标")
        .set_file_name("角色目标.xlsx")
        .add_filter("Excel", &["xlsx"])
        .save_file()
        .await
    else {
        return Ok(None);
    };
    store.export_build_plans_excel(file.path())?;
    Ok(Some(file.path().to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn import_character_build_plans_excel(
    store: State<'_, InventoryStore>,
) -> Result<Option<BuildPlanExcelImportResult>, AppError> {
    let Some(file) = rfd::AsyncFileDialog::new()
        .set_title("导入角色目标")
        .add_filter("Excel", &["xlsx"])
        .pick_file()
        .await
    else {
        return Ok(None);
    };
    Ok(Some(BuildPlanExcelImportResult {
        imported: store.import_build_plans_excel(file.path())?,
    }))
}

#[tauri::command]
pub fn recommend_character_build(
    request: BuildRecommendationRequest,
    store: State<'_, InventoryStore>,
) -> Result<BuildRecommendation, AppError> {
    store.recommend_build(&request)
}

#[tauri::command]
pub fn list_teams(
    filter: TeamFilter,
    store: State<'_, InventoryStore>,
) -> Result<PagedResult<Team>, AppError> {
    store.list_teams(&filter)
}

#[tauri::command]
pub fn upsert_character_build_score(
    score: CharacterBuildScore,
    store: State<'_, InventoryStore>,
) -> Result<(), AppError> {
    store.upsert_character_build_score(&score)
}

#[tauri::command]
pub fn list_character_build_scores(
    character_ids: Vec<u32>,
    store: State<'_, InventoryStore>,
) -> Result<Vec<CharacterBuildScore>, AppError> {
    store.list_character_build_scores(&character_ids)
}

#[tauri::command]
pub fn delete_character_build_score(
    character_id: u32,
    store: State<'_, InventoryStore>,
) -> Result<(), AppError> {
    store.delete_character_build_score(character_id)
}

#[tauri::command]
pub fn get_team(team_id: u32, store: State<'_, InventoryStore>) -> Result<Team, AppError> {
    store.get_team(team_id)
}

#[tauri::command]
pub fn save_team(
    team: TeamInput,
    app: AppHandle,
    store: State<'_, InventoryStore>,
) -> Result<Team, AppError> {
    let saved = store.save_team(&team)?;
    let summary = store.summary()?;
    direct_read::inventory_changed(&app, &summary, false)?;
    let _ = app.emit("inventory://changed", &summary);
    Ok(saved)
}

#[tauri::command]
pub fn delete_team(
    team_id: u32,
    app: AppHandle,
    store: State<'_, InventoryStore>,
) -> Result<(), AppError> {
    store.delete_team(team_id)?;
    let summary = store.summary()?;
    direct_read::inventory_changed(&app, &summary, false)?;
    let _ = app.emit("inventory://changed", &summary);
    Ok(())
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

#[tauri::command]
pub fn get_mcp_settings(runtime: State<'_, McpRuntime>) -> Result<McpSettings, AppError> {
    runtime.load_settings()
}

#[tauri::command]
pub fn get_mcp_status(runtime: State<'_, McpRuntime>) -> McpStatus {
    runtime.status()
}

#[tauri::command]
pub async fn save_mcp_settings(
    settings: McpSettings,
    runtime: State<'_, McpRuntime>,
) -> Result<McpSettings, AppError> {
    let saved = runtime.save_settings(settings)?;
    let _ = runtime.apply(&saved).await;
    Ok(saved)
}

#[tauri::command]
pub fn regenerate_mcp_token(runtime: State<'_, McpRuntime>) -> Result<McpSettings, AppError> {
    runtime.regenerate_token()
}
