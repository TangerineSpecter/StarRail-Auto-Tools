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
        Foundation::{HWND, LPARAM, POINT, RECT},
        Graphics::Gdi::ClientToScreen,
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
                BringWindowToTop, EnumWindows, GetClientRect, GetForegroundWindow, GetWindowRect,
                GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsIconic,
                IsWindowVisible, PostMessageW, SetCursorPos, SetForegroundWindow, ShowWindow,
                SW_RESTORE, WM_CLOSE,
            },
        },
    },
};

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

pub fn click_game_enter(game: GameWindow) -> Result<(), String> {
    // The caller has just verified that this exact process still owns a visible game window.
    // Do not repeat the check here: foreground activation can be denied transiently between
    // two consecutive checks, which would suppress an otherwise valid input attempt.
    click_game_enter_at_window(game.hwnd())
}

fn click_game_enter_at_window(hwnd: HWND) -> Result<(), String> {
    unsafe {
        if !activate_game_window(hwnd) {
            return Err("Windows 拒绝将游戏窗口切换到前台（任务栏闪烁通常表示该情况），已取消点击以避免误操作其他应用。".to_owned());
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

fn activate_game_window(hwnd: HWND) -> bool {
    unsafe {
        let _ = ShowWindow(hwnd, SW_RESTORE);
        let _ = BringWindowToTop(hwnd);
        SetForegroundWindow(hwnd).as_bool() && GetForegroundWindow() == hwnd
    }
}

fn capture_window_png(hwnd: HWND) -> Result<Vec<u8>, String> {
    if !is_game_window(hwnd) {
        return Err("游戏窗口已关闭或无法切换到前台。".to_owned());
    }
    let rect = client_screen_rect(hwnd)?;
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

pub(crate) fn capture_foreground_game_client() -> Result<Vec<u8>, String> {
    let hwnd = find_game_window().ok_or_else(|| "未找到《崩坏：星穹铁道》游戏窗口".to_owned())?;
    if unsafe { GetForegroundWindow() } != hwnd {
        return Err("游戏窗口不在前台，已暂停以避免操作其他窗口".to_owned());
    }
    capture_window_png(hwnd)
}

fn client_screen_rect(hwnd: HWND) -> Result<RECT, String> {
    let mut client = RECT::default();
    unsafe { GetClientRect(hwnd, &mut client).map_err(|error| error.to_string())? };
    let mut top_left = POINT {
        x: client.left,
        y: client.top,
    };
    let mut bottom_right = POINT {
        x: client.right,
        y: client.bottom,
    };
    unsafe {
        if !ClientToScreen(hwnd, &mut top_left).as_bool()
            || !ClientToScreen(hwnd, &mut bottom_right).as_bool()
        {
            return Err("无法将游戏窗口客户区坐标转换为屏幕坐标".to_owned());
        }
    }
    Ok(RECT {
        left: top_left.x,
        top: top_left.y,
        right: bottom_right.x,
        bottom: bottom_right.y,
    })
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
