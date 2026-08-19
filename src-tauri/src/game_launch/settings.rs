use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::error::AppError;
use serde::{Deserialize, Serialize};

const SETTINGS_FILE: &str = "game-launch-settings.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GameLaunchSettings {
    #[serde(default)]
    pub launcher_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GameLaunchDetection {
    pub launcher_path: Option<String>,
    pub source: Option<String>,
}

#[derive(Clone)]
pub struct GameLaunchStore {
    path: PathBuf,
}

impl GameLaunchStore {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            path: data_dir.join(SETTINGS_FILE),
        }
    }
    pub fn load(&self) -> Result<GameLaunchSettings, AppError> {
        if !self.path.exists() {
            return Ok(GameLaunchSettings::default());
        }
        serde_json::from_str(&fs::read_to_string(&self.path).map_err(game_io("读取游戏启动设置"))?)
            .map_err(|error| AppError::Mcp(format!("本地游戏启动设置无效：{error}")))
    }
    pub fn save(&self, settings: GameLaunchSettings) -> Result<GameLaunchSettings, AppError> {
        validate_launcher_path(&settings.launcher_path)?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(game_io("创建游戏启动设置目录"))?;
        }
        fs::write(
            &self.path,
            serde_json::to_vec_pretty(&settings)
                .map_err(|error| AppError::Mcp(error.to_string()))?,
        )
        .map_err(game_io("写入游戏启动设置"))?;
        Ok(settings)
    }
}

pub fn validate_launcher_path(value: &str) -> Result<(), AppError> {
    let path = Path::new(value.trim());
    if value.trim().is_empty() {
        return Err(AppError::Mcp("尚未配置启动器位置".to_owned()));
    }
    if !path.is_file()
        || path
            .extension()
            .is_none_or(|ext| !ext.eq_ignore_ascii_case("exe"))
    {
        return Err(AppError::Mcp("启动器路径必须是存在的 .exe 文件".to_owned()));
    }
    Ok(())
}

pub fn detect_launcher() -> GameLaunchDetection {
    #[cfg(windows)]
    {
        return detect_windows_launcher();
    }
    #[cfg(not(windows))]
    {
        GameLaunchDetection {
            launcher_path: None,
            source: None,
        }
    }
}

#[cfg(windows)]
fn detect_windows_launcher() -> GameLaunchDetection {
    use std::process::Command;
    for candidate in [
        "C:\\Program Files\\miHoYo Launcher\\launcher.exe",
        "C:\\Program Files\\HoYoPlay\\launcher.exe",
        "C:\\Program Files\\HoYoPlay\\HoYoPlay.exe",
    ] {
        if Path::new(candidate).is_file() {
            return GameLaunchDetection {
                launcher_path: Some(candidate.to_owned()),
                source: Some("常见安装目录".to_owned()),
            };
        }
    }
    for hive in ["HKCU", "HKLM"] {
        if let Ok(output) = Command::new("reg")
            .args([
                "query",
                &format!("{hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall"),
                "/s",
                "/v",
                "DisplayIcon",
            ])
            .output()
        {
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                if let Some(path) = launcher_path_from_registry_line(line) {
                    return GameLaunchDetection {
                        launcher_path: Some(path),
                        source: Some("Windows 卸载注册表".to_owned()),
                    };
                }
            }
        }
    }
    GameLaunchDetection {
        launcher_path: None,
        source: None,
    }
}

#[cfg(windows)]
fn launcher_path_from_registry_line(line: &str) -> Option<String> {
    let lowered = line.to_ascii_lowercase();
    if !lowered.contains("hoyoplay") && !lowered.contains("mihoyo") {
        return None;
    }
    let end = lowered.find(".exe")? + 4;
    let raw = line[..end].trim();
    let start = raw
        .as_bytes()
        .windows(3)
        .position(|part| part[0].is_ascii_alphabetic() && part[1] == b':' && part[2] == b'\\')?;
    let path = raw[start..].trim_matches('"').to_owned();
    Path::new(&path).is_file().then_some(path)
}

fn game_io(action: &'static str) -> impl FnOnce(std::io::Error) -> AppError {
    move |error| AppError::Mcp(format!("{action}失败：{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn empty_or_non_executable_launcher_path_is_rejected() {
        assert!(validate_launcher_path("").is_err());
        assert!(validate_launcher_path("/tmp/not-a-launcher.txt").is_err());
    }
}
