import { invoke } from "@tauri-apps/api/core";
import type { GameLaunchDetection, GameLaunchSettings } from "@/types";

export const gameLaunchApi = {
  getSettings: () => invoke<GameLaunchSettings>("get_game_launch_settings"),
  saveSettings: (settings: GameLaunchSettings) =>
    invoke<GameLaunchSettings>("save_game_launch_settings", { settings }),
  detectLauncher: () => invoke<GameLaunchDetection>("detect_game_launcher"),
  pickLauncher: () => invoke<string | null>("pick_game_launcher"),
};
