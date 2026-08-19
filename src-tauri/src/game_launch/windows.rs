use std::{path::Path, process::Command, time::Duration};

use windows::Win32::{
    Foundation::{BOOL, HWND, LPARAM, RECT},
    System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    },
    UI::{
        Accessibility::{
            CUIAutomation, IUIAutomation, IUIAutomationInvokePattern, TreeScope_Subtree,
            UIA_InvokePatternId,
        },
        Input::KeyboardAndMouse::{mouse_event, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP},
        WindowsAndMessaging::{
            EnumWindows, GetForegroundWindow, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
            GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetCursorPos, SetForegroundWindow,
        },
    },
};

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

pub async fn wait_for_game_window(timeout: Duration) -> Result<HWND, String> {
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        if let Some(hwnd) = find_game_window() {
            return Ok(hwnd);
        }
        if tokio::time::Instant::now() >= deadline {
            return Err("等待游戏客户端窗口超时。请检查启动器是否完成启动游戏。".to_owned());
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

pub fn click_window_center(hwnd: HWND) -> Result<(), String> {
    unsafe {
        if !SetForegroundWindow(hwnd).as_bool() || GetForegroundWindow() != hwnd {
            return Err("无法将游戏窗口切换到前台，已取消点击以避免误操作其他应用。".to_owned());
        }
        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).map_err(|error| error.to_string())?;
        SetCursorPos((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2)
            .map_err(|error| error.to_string())?;
        if GetForegroundWindow() != hwnd {
            return Err("游戏窗口失去前台焦点，已取消点击以避免误操作其他应用。".to_owned());
        }
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
        Ok(())
    }
}

fn existing_process_id(name: &str) -> Option<u32> {
    let output = Command::new("tasklist")
        .args(["/FI", &format!("IMAGENAME eq {name}"), "/FO", "CSV", "/NH"])
        .output()
        .ok()?;
    let line = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()?
        .trim_matches('"');
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
        let elements = root.FindAll(TreeScope_Subtree, automation.CreateTrueCondition()?)?;
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
        Err(windows::core::Error::from_win32())
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
