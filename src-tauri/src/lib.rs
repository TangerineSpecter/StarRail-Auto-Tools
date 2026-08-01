mod commands;
mod direct_read;
mod domain;
mod error;
mod inventory;
#[cfg(feature = "ocr")]
mod ocr;
mod scanner;
mod screenshot;

use direct_read::DirectReadState;
use inventory::InventoryStore;
use scanner::ScannerState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ScannerState::default())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let store = InventoryStore::initialize(data_dir.join("inventory.sqlite3"))
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            app.manage(store);
            app.manage(DirectReadState::default());
            direct_read::auto_start(app.handle().clone());
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
            commands::list_relics,
            commands::get_relic_main_stat_scan_plan_count,
            commands::scan_relics_by_main_stat,
            commands::list_light_cones,
            commands::list_characters,
            commands::get_inventory_detail,
            commands::list_relic_sets,
            commands::get_character_build_plan,
            commands::get_build_dashboard,
            commands::save_character_build_plan,
            commands::delete_character_build_plan,
            commands::recommend_character_build,
            commands::delete_inventory_items,
            commands::clear_inventory,
            commands::export_inventory,
            commands::import_inventory,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run StarRail-Auto-Tools");
}
