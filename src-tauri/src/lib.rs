mod commands;
mod direct_read;
mod domain;
mod error;
mod game_launch;
mod inventory;
mod mcp;
#[cfg(feature = "ocr")]
mod ocr;
mod scanner;
mod screenshot;
mod sync;

use direct_read::DirectReadState;
use inventory::InventoryStore;
use scanner::ScannerState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ScannerState::default())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let store = InventoryStore::initialize(data_dir.join("inventory.sqlite3"))
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            let sync_store = sync::SyncStore::new(data_dir.clone());
            let mcp_runtime = mcp::McpRuntime::new(
                mcp::McpStore::new(data_dir.clone()),
                store.clone(),
                sync_store.clone(),
                app.handle().clone(),
            );
            let game_launch_runtime = game_launch::GameLaunchRuntime::new(
                game_launch::GameLaunchStore::new(data_dir.clone()),
                app.handle().clone(),
            );
            app.manage(store);
            app.manage(sync_store);
            app.manage(mcp_runtime.clone());
            app.manage(game_launch_runtime);
            app.manage(DirectReadState::default());
            direct_read::auto_start(app.handle().clone());
            tauri::async_runtime::spawn(async move {
                let _ = mcp_runtime.apply_saved().await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_system_capabilities,
            commands::get_scanner_snapshot,
            commands::start_scanner,
            commands::stop_scanner,
            commands::recognize_image,
            commands::recognize_screenshot,
            commands::capture_desktop,
            commands::get_direct_read_snapshot,
            commands::start_direct_read,
            commands::stop_direct_read,
            commands::confirm_account_switch,
            commands::get_inventory_summary,
            commands::get_inventory_equipment_counts,
            commands::list_relics,
            commands::get_relic_main_stat_scan_plan_count,
            commands::scan_relics_by_main_stat,
            commands::scan_relics_by_main_stat_grouped,
            commands::list_light_cones,
            commands::list_characters,
            commands::get_inventory_detail,
            commands::list_relic_sets,
            commands::get_character_build_plan,
            commands::get_build_dashboard,
            commands::reorder_build_dashboard,
            commands::set_build_dashboard_pinned,
            commands::list_relic_set_recommended_characters,
            commands::save_character_build_plan,
            commands::delete_character_build_plan,
            commands::export_character_build_plans_excel,
            commands::import_character_build_plans_excel,
            commands::recommend_character_build,
            commands::list_teams,
            commands::get_team,
            commands::save_team,
            commands::delete_team,
            commands::upsert_character_build_score,
            commands::list_character_build_scores,
            commands::delete_character_build_score,
            commands::delete_inventory_items,
            commands::clear_inventory,
            commands::export_inventory,
            commands::import_inventory,
            commands::get_webdav_settings,
            commands::save_webdav_settings,
            commands::test_webdav_connection,
            commands::upload_webdav_snapshot,
            commands::download_webdav_snapshot,
            commands::get_sync_settings,
            commands::save_sync_settings,
            commands::test_sync_connection,
            commands::upload_sync_snapshot,
            commands::download_sync_snapshot,
            commands::get_mcp_settings,
            commands::save_mcp_settings,
            commands::get_mcp_status,
            commands::regenerate_mcp_token,
            commands::get_game_launch_settings,
            commands::save_game_launch_settings,
            commands::detect_game_launcher,
            commands::pick_game_launcher,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run StarRail-Auto-Tools");
}
