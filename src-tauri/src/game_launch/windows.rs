use std::{
    fs,
    mem::size_of,
    path::Path,
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use windows::{
    core::{BOOL, HRESULT},
    Win32::{
        Foundation::{HWND, LPARAM, RECT},
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        },
        UI::{
            Accessibility::{
                CUIAutomation, IUIAutomation, IUIAutomationInvokePattern, TreeScope_Subtree,
                UIA_InvokePatternId,
            },
            Input::KeyboardAndMouse::{
                SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
                MOUSEINPUT,
            },
            WindowsAndMessaging::{
                EnumWindows, GetForegroundWindow, GetWindowRect, GetWindowTextLengthW,
                GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, PostMessageW,
                SetCursorPos, SetForegroundWindow, WM_CLOSE,
            },
        },
    },
};

const ENTER_TEMPLATE: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/assets/game-enter-template.png"
));
const ENTER_REGION_X: f32 = 616.0 / 1362.0;
const ENTER_REGION_Y: f32 = 735.0 / 800.0;
const ENTER_REGION_WIDTH: f32 = 130.0 / 1362.0;
const ENTER_REGION_HEIGHT: f32 = 42.0 / 800.0;
// The bundled template was taken from a remote desktop image. Only compare the glyph area:
// the surrounding login animation changes continuously and is not a stable signal.
const ENTER_TEXT_LEFT: u32 = 34;
const ENTER_TEXT_RIGHT: u32 = 100;
const ENTER_TEXT_TOP: u32 = 8;
const ENTER_TEXT_BOTTOM: u32 = 32;
const TEMPLATE_TEXT_BRIGHTNESS: u8 = 215;
const CANDIDATE_TEXT_BRIGHTNESS: u8 = 190;
const ENTER_TEXT_SIMILARITY: f32 = 0.58;
const ENTER_READY_TIMEOUT: Duration = Duration::from_secs(45);
const ENTER_RETRY_DELAY: Duration = Duration::from_secs(5);
const MAX_ENTER_CLICKS: u8 = 3;

#[derive(Clone, Copy)]
pub struct GameWindow {
    hwnd: isize,
    process_id: u32,
}

impl GameWindow {
    fn hwnd(self) -> HWND {
        HWND(self.hwnd as *mut _)
    }
}

pub fn start_or_reuse_launcher(path: &Path) -> Result<u32, String> {
    if let Some(pid) = existing_process_id(
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default(),
    ) {
        return Ok(pid);
    }
    Command::new(path)
        .spawn()
        .map(|process| process.id())
        .map_err(|error| format!("无法启动启动器：{error}"))
}

pub fn game_is_running() -> bool {
    find_game_window().is_some()
}

pub fn game_window_is_open(game: GameWindow) -> bool {
    find_game_window()
        .and_then(window_process_id)
        .is_some_and(|process_id| process_id == game.process_id)
}

pub async fn invoke_launcher_start(pid: u32) -> Result<(), String> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(45);
    loop {
        if let Some(hwnd) = find_window(pid).or_else(find_launcher_window) {
            if invoke_button(hwnd).is_ok() {
                return Ok(());
            }
        }
        if tokio::time::Instant::now() >= deadline {
            return Err("未在启动器中找到可点击的“开始游戏”按钮。请确认启动器已登录且 UI Automation 可访问该按钮。".to_owned());
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

pub async fn wait_for_game_window(timeout: Duration) -> Result<GameWindow, String> {
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        if let Some(hwnd) = find_game_window() {
            if let Some(process_id) = window_process_id(hwnd) {
                return Ok(GameWindow {
                    hwnd: hwnd.0 as isize,
                    process_id,
                });
            }
        }
        if tokio::time::Instant::now() >= deadline {
            return Err("等待游戏客户端窗口超时。请检查启动器是否完成启动游戏。".to_owned());
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

pub async fn wait_for_enter_screen_and_click(game: GameWindow) -> Result<(), String> {
    // 游戏窗口出现后仍需加载一段时间，先避免在黑屏或动画早期误点。
    tokio::time::sleep(Duration::from_secs(8)).await;
    let deadline = tokio::time::Instant::now() + ENTER_READY_TIMEOUT;
    let mut clicks = 0;
    loop {
        if !is_current_game_window(game) {
            return Err("游戏窗口已关闭或不再属于本次启动的客户端。".to_owned());
        }
        match enter_screen_visible(game.hwnd()) {
            Ok(true) => {
                click_game_enter(game.hwnd())?;
                clicks += 1;
                tokio::time::sleep(ENTER_RETRY_DELAY).await;
                match enter_screen_visible(game.hwnd()) {
                    Ok(false) => return Ok(()),
                    Ok(true) => {}
                    Err(error) => {
                        return Err(format!("点击后无法确认“点击进入”界面是否消失：{error}"));
                    }
                }
                if clicks >= MAX_ENTER_CLICKS {
                    return Err("已识别到“点击进入”界面，但连续 3 次点击后界面仍未消失。可能是游戏以管理员身份运行，或远程控制软件拦截了输入。".to_owned());
                }
            }
            Ok(false) => {
                if tokio::time::Instant::now() >= deadline {
                    return Err("等待“点击进入”界面超时。请确认游戏已正常加载到登录页。".to_owned());
                }
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
            Err(error) => {
                if tokio::time::Instant::now() >= deadline {
                    return Err(format!("无法识别“点击进入”界面：{error}"));
                }
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }
}

pub fn click_game_enter(hwnd: HWND) -> Result<(), String> {
    unsafe {
        if !SetForegroundWindow(hwnd).as_bool() || GetForegroundWindow() != hwnd {
            return Err("无法将游戏窗口切换到前台，已取消点击以避免误操作其他应用。".to_owned());
        }
        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).map_err(|error| error.to_string())?;
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        // 模板确认后，点击“点击进入”文字的窗口相对中心位置。
        SetCursorPos(rect.left + width / 2, rect.top + height * 19 / 20)
            .map_err(|error| error.to_string())?;
        if GetForegroundWindow() != hwnd {
            return Err("游戏窗口失去前台焦点，已取消点击以避免误操作其他应用。".to_owned());
        }
        let inputs = [
            mouse_input(MOUSEEVENTF_LEFTDOWN),
            mouse_input(MOUSEEVENTF_LEFTUP),
        ];
        if SendInput(&inputs, size_of::<INPUT>() as i32) != inputs.len() as u32 {
            return Err("Windows 未接受游戏进入点击；可能是游戏以管理员身份运行或远程控制软件拦截了输入。请让本工具与游戏使用相同权限后重试。".to_owned());
        }
        Ok(())
    }
}

fn enter_screen_visible(hwnd: HWND) -> Result<bool, String> {
    let image = image::load_from_memory(&capture_window_png(hwnd)?)
        .map_err(|error| format!("无法解析游戏窗口截图：{error}"))?;
    let template = image::load_from_memory(ENTER_TEMPLATE)
        .map_err(|error| format!("无法加载“点击进入”模板：{error}"))?
        .to_luma8();
    let width = image.width();
    let height = image.height();
    let crop_width = (width as f32 * ENTER_REGION_WIDTH).round() as u32;
    let crop_height = (height as f32 * ENTER_REGION_HEIGHT).round() as u32;
    if crop_width < 20 || crop_height < 12 {
        return Err("游戏窗口尺寸过小，无法识别“点击进入”界面。".to_owned());
    }
    let center_x = (width as f32 * ENTER_REGION_X).round() as i32;
    let center_y = (height as f32 * ENTER_REGION_Y).round() as i32;
    for offset_y in [-2, -1, 0, 1, 2] {
        for offset_x in [-2, -1, 0, 1, 2] {
            let x = (center_x + offset_x * (crop_width as i32 / 8))
                .clamp(0, width as i32 - crop_width as i32) as u32;
            let y = (center_y + offset_y * (crop_height as i32 / 5))
                .clamp(0, height as i32 - crop_height as i32) as u32;
            let candidate = image
                .crop_imm(x, y, crop_width, crop_height)
                .resize_exact(
                    template.width(),
                    template.height(),
                    image::imageops::FilterType::Triangle,
                )
                .to_luma8();
            if text_template_similarity(&template, &candidate) >= ENTER_TEXT_SIMILARITY {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn text_template_similarity(template: &image::GrayImage, candidate: &image::GrayImage) -> f32 {
    let mut template_text_pixels = 0_u32;
    let mut candidate_text_pixels = 0_u32;
    let mut matching_text_pixels = 0_u32;
    let right = ENTER_TEXT_RIGHT.min(template.width());
    let bottom = ENTER_TEXT_BOTTOM.min(template.height());
    for y in ENTER_TEXT_TOP.min(bottom)..bottom {
        for x in ENTER_TEXT_LEFT.min(right)..right {
            let template_is_text = template.get_pixel(x, y)[0] >= TEMPLATE_TEXT_BRIGHTNESS;
            let candidate_is_text = candidate.get_pixel(x, y)[0] >= CANDIDATE_TEXT_BRIGHTNESS;
            if template_is_text {
                template_text_pixels += 1;
            }
            if candidate_is_text {
                candidate_text_pixels += 1;
            }
            if template_is_text && candidate_is_text {
                matching_text_pixels += 1;
            }
        }
    }
    2.0 * matching_text_pixels as f32 / (template_text_pixels + candidate_text_pixels).max(1) as f32
}

fn capture_window_png(hwnd: HWND) -> Result<Vec<u8>, String> {
    if !is_game_window(hwnd) {
        return Err("游戏窗口已关闭或无法切换到前台。".to_owned());
    }
    let mut rect = RECT::default();
    unsafe { GetWindowRect(hwnd, &mut rect).map_err(|error| error.to_string())? };
    let width = rect.right - rect.left;
    let height = rect.bottom - rect.top;
    if width <= 0 || height <= 0 {
        return Err("游戏窗口尺寸无效。".to_owned());
    }
    let path = std::env::temp_dir().join(format!(
        "starrail-enter-screen-{}-{}.png",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    // `powershell -Command <script> <arguments>` does not reliably provide the trailing values
    // as `$args`: PowerShell may parse them as part of the command text. The rectangle values are
    // integers from Win32 and the path is generated locally, so embed quoted literals instead.
    let escaped_path = path.to_string_lossy().replace('\'', "''");
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap {width}, {height}
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen({left}, {top}, 0, 0, $bitmap.Size)
$bitmap.Save('{escaped_path}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
"#,
        left = rect.left,
        top = rect.top,
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .map_err(|error| format!("无法截取游戏窗口：{error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(if detail.is_empty() {
            "截取游戏窗口失败。".to_owned()
        } else {
            format!("截取游戏窗口失败：{detail}")
        });
    }
    let bytes = fs::read(&path).map_err(|error| format!("无法读取游戏窗口截图：{error}"));
    let _ = fs::remove_file(path);
    bytes
}

pub async fn close_game_window(game: GameWindow) -> Result<(), String> {
    if is_current_game_window(game) {
        unsafe {
            PostMessageW(
                Some(game.hwnd()),
                WM_CLOSE,
                Default::default(),
                Default::default(),
            )
            .map_err(|error| format!("无法请求关闭游戏窗口：{error}"))?;
        }
    }
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    while process_is_running(game.process_id) && tokio::time::Instant::now() < deadline {
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    if process_is_running(game.process_id) {
        let output = Command::new("taskkill")
            .args(["/PID", &game.process_id.to_string(), "/T", "/F"])
            .output()
            .map_err(|error| format!("游戏窗口未响应且无法强制关闭：{error}"))?;
        if !output.status.success() {
            return Err(format!(
                "游戏窗口未响应且强制关闭失败：{}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
    }
    Ok(())
}

fn is_current_game_window(game: GameWindow) -> bool {
    let hwnd = game.hwnd();
    window_process_id(hwnd) == Some(game.process_id) && is_game_window(hwnd)
}

fn is_game_window(hwnd: HWND) -> bool {
    unsafe {
        if !SetForegroundWindow(hwnd).as_bool() || GetForegroundWindow() != hwnd {
            return false;
        }
    }
    let title = window_title(hwnd);
    title.contains("崩坏：星穹铁道") || title.contains("Honkai: Star Rail")
}

fn window_process_id(hwnd: HWND) -> Option<u32> {
    let mut process_id = 0;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut process_id)) };
    (process_id != 0).then_some(process_id)
}

fn process_is_running(process_id: u32) -> bool {
    let Ok(output) = Command::new("tasklist")
        .args(["/FI", &format!("PID eq {process_id}"), "/FO", "CSV", "/NH"])
        .output()
    else {
        return false;
    };
    let output = String::from_utf8_lossy(&output.stdout);
    output
        .lines()
        .next()
        .map(|line| line.contains(&format!("\",\"{process_id}\",")))
        .unwrap_or(false)
}

fn mouse_input(flags: ::windows::Win32::UI::Input::KeyboardAndMouse::MOUSE_EVENT_FLAGS) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn existing_process_id(name: &str) -> Option<u32> {
    let output = Command::new("tasklist")
        .args(["/FI", &format!("IMAGENAME eq {name}"), "/FO", "CSV", "/NH"])
        .output()
        .ok()?;
    let output = String::from_utf8_lossy(&output.stdout);
    let line = output.lines().next()?.trim_matches('"');
    let mut fields = line.split("\",\"");
    if fields.next()?.eq_ignore_ascii_case(name) {
        fields.next()?.parse().ok()
    } else {
        None
    }
}

fn invoke_button(hwnd: HWND) -> windows::core::Result<()> {
    let _com = ComGuard::initialize()?;
    unsafe {
        let automation: IUIAutomation =
            CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)?;
        let root = automation.ElementFromHandle(hwnd)?;
        let condition = automation.CreateTrueCondition()?;
        let elements = root.FindAll(TreeScope_Subtree, &condition)?;
        for index in 0..elements.Length()? {
            let element = elements.GetElement(index)?;
            let name = element.CurrentName()?.to_string();
            if ["开始游戏", "启动游戏"].contains(&name.as_str()) {
                let pattern: IUIAutomationInvokePattern =
                    element.GetCurrentPatternAs(UIA_InvokePatternId)?;
                pattern.Invoke()?;
                return Ok(());
            }
        }
        Err(windows::core::Error::new(
            HRESULT(0x8000_4005_u32 as i32),
            "开始游戏按钮不可用",
        ))
    }
}

struct ComGuard;

impl ComGuard {
    fn initialize() -> windows::core::Result<Self> {
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()?;
        }
        Ok(Self)
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

fn find_game_window() -> Option<HWND> {
    find_window_where(|hwnd, _| {
        let title = window_title(hwnd);
        title.contains("崩坏：星穹铁道") || title.contains("Honkai: Star Rail")
    })
}

fn find_launcher_window() -> Option<HWND> {
    find_window_where(|hwnd, _| {
        let title = window_title(hwnd).to_ascii_lowercase();
        title.contains("hoyoplay") || title.contains("mihoyo") || title.contains("米哈游")
    })
}

fn find_window(pid: u32) -> Option<HWND> {
    find_window_where(|_, window_pid| window_pid == pid)
}

fn find_window_where(predicate: impl Fn(HWND, u32) -> bool) -> Option<HWND> {
    struct Context<'a> {
        predicate: &'a dyn Fn(HWND, u32) -> bool,
        result: Option<HWND>,
    }
    unsafe extern "system" fn callback(hwnd: HWND, data: LPARAM) -> BOOL {
        let context = unsafe { &mut *(data.0 as *mut Context<'_>) };
        let mut pid = 0;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
        if unsafe { IsWindowVisible(hwnd).as_bool() }
            && !unsafe { IsIconic(hwnd).as_bool() }
            && (context.predicate)(hwnd, pid)
        {
            context.result = Some(hwnd);
            return BOOL(0);
        }
        BOOL(1)
    }
    let mut context = Context {
        predicate: &predicate,
        result: None,
    };
    unsafe {
        let _ = EnumWindows(Some(callback), LPARAM(&mut context as *mut _ as isize));
    }
    context.result
}

fn window_title(hwnd: HWND) -> String {
    unsafe {
        let length = GetWindowTextLengthW(hwnd);
        if length == 0 {
            return String::new();
        }
        let mut text = vec![0u16; (length + 1) as usize];
        let _ = GetWindowTextW(hwnd, &mut text);
        String::from_utf16_lossy(&text[..length as usize])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn template_similarity_requires_the_text_shape_not_just_brightness() {
        let mut template = image::GrayImage::new(130, 42);
        for x in 40..90 {
            template.put_pixel(x, 20, image::Luma([255]));
        }
        let matching = template.clone();
        let bright_background = image::GrayImage::from_pixel(130, 42, image::Luma([255]));

        assert!(text_template_similarity(&template, &matching) >= ENTER_TEXT_SIMILARITY);
        assert!(text_template_similarity(&template, &bright_background) < ENTER_TEXT_SIMILARITY);
    }
}
