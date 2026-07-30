use std::{fs, process::Command, time::{SystemTime, UNIX_EPOCH}};

use crate::error::AppError;

fn temporary_path() -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "starrail-auto-tools-screen-{}-{}.png",
        std::process::id(),
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos(),
    ))
}

#[cfg(target_os = "macos")]
pub fn capture_desktop() -> Result<Vec<u8>, AppError> {
    let path = temporary_path();
    let status = Command::new("screencapture")
        .args(["-x", "-t", "png"])
        .arg(&path)
        .status()
        .map_err(|error| AppError::Capture(format!("无法启动系统截图：{error}")))?;
    if !status.success() {
        return Err(AppError::Capture("系统截图已取消或失败".to_owned()));
    }
    let image = fs::read(&path).map_err(|error| AppError::Capture(format!("无法读取截图：{error}")));
    let _ = fs::remove_file(path);
    image
}

#[cfg(windows)]
pub fn capture_desktop() -> Result<Vec<u8>, AppError> {
    let path = temporary_path();
    let script = r#"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
$bitmap.Save($args[0], [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
"#;
    let status = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .arg(&path)
        .status()
        .map_err(|error| AppError::Capture(format!("无法启动系统截图：{error}")))?;
    if !status.success() {
        return Err(AppError::Capture("系统截图失败".to_owned()));
    }
    let image = fs::read(&path).map_err(|error| AppError::Capture(format!("无法读取截图：{error}")));
    let _ = fs::remove_file(path);
    image
}

#[cfg(not(any(target_os = "macos", windows)))]
pub fn capture_desktop() -> Result<Vec<u8>, AppError> {
    Err(AppError::Capture("当前平台暂不支持系统截图".to_owned()))
}
