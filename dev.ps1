# Local desktop development entry point for Windows PowerShell.
# It checks the required toolchain and gives guidance when something is missing.
[CmdletBinding()]
param(
    [switch]$BootstrapOnly
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# ---------------------------------------------------------------------------
# Helper: refresh PATH so we can detect freshly-installed tools
# ---------------------------------------------------------------------------
function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"

    $cargoBin = Join-Path $env:USERPROFILE '.cargo\\bin'
    $nvmHome = [Environment]::GetEnvironmentVariable('NVM_HOME', 'Machine')
    if (-not $nvmHome) { $nvmHome = [Environment]::GetEnvironmentVariable('NVM_HOME', 'User') }
    if (-not $nvmHome) { $nvmHome = Join-Path $env:ProgramFiles 'nvm' }
    foreach ($directory in @($cargoBin, $nvmHome)) {
        if ($directory -and (Test-Path $directory) -and ($env:Path -notlike "*$directory*")) {
            $env:Path = "$directory;$env:Path"
        }
    }
}

# ---------------------------------------------------------------------------
# Environment checks
# ---------------------------------------------------------------------------
function Test-Node22 {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
    & node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major === 22 && minor >= 12 ? 0 : 1)"
    return $LASTEXITCODE -eq 0
}

function Test-VcBuildTools {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\\Installer\\vswhere.exe'
    if (-not (Test-Path $vswhere)) { return $false }
    $installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    return -not [string]::IsNullOrWhiteSpace($installation)
}

function Test-RustToolchain {
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { return $false }
    & cargo --version *> $null
    return $LASTEXITCODE -eq 0
}

# ---------------------------------------------------------------------------
# Guidance messages — tell the user what to install and how
# ---------------------------------------------------------------------------
function Show-NvmGuidance {
    Write-Host ''
    Write-Host '╔══════════════════════════════════════════════════════════════════╗' -ForegroundColor Red
    Write-Host '║  未检测到 nvm-windows，请先安装 nvm 来管理 Node.js 版本          ║' -ForegroundColor Red
    Write-Host '╚══════════════════════════════════════════════════════════════════╝' -ForegroundColor Red
    Write-Host ''
    Write-Host '  安装步骤:' -ForegroundColor Yellow
    Write-Host '  1. 前往 nvm-windows 发布页下载安装包:' -ForegroundColor White
    Write-Host '     https://github.com/coreybutler/nvm-windows/releases' -ForegroundColor Cyan
    Write-Host '     下载 nvm-setup.exe 并运行安装程序' -ForegroundColor White
    Write-Host ''
    Write-Host '  2. 安装完成后, 关闭并重新打开 PowerShell, 然后执行:' -ForegroundColor White
    Write-Host '     nvm install 22        # 安装 Node.js 22 最新版' -ForegroundColor Green
    Write-Host '     nvm use 22            # 切换到 Node.js 22' -ForegroundColor Green
    Write-Host ''
    Write-Host '  3. 确认安装成功:' -ForegroundColor White
    Write-Host '     node --version        # 应输出 v22.x.x' -ForegroundColor Green
    Write-Host '     npm --version         # 应输出版本号' -ForegroundColor Green
    Write-Host ''
}

function Show-NodeGuidance {
    Write-Host ''
    Write-Host '╔══════════════════════════════════════════════════════════════════╗' -ForegroundColor Red
    Write-Host '║  Node.js 版本不满足要求 (需要 22.12+)                            ║' -ForegroundColor Red
    Write-Host '╚══════════════════════════════════════════════════════════════════╝' -ForegroundColor Red
    Write-Host ''
    Write-Host "  当前版本: $(& node --version 2>$null)" -ForegroundColor White
    Write-Host ''
    Write-Host '  请使用 nvm 安装并切换到 Node.js 22:' -ForegroundColor Yellow
    Write-Host '     nvm install 22        # 安装 Node.js 22 最新版' -ForegroundColor Green
    Write-Host '     nvm use 22            # 切换到 Node.js 22' -ForegroundColor Green
    Write-Host ''
    Write-Host '  确认版本:' -ForegroundColor White
    Write-Host '     node --version        # 应输出 v22.x.x' -ForegroundColor Green
    Write-Host ''
}

function Show-RustGuidance {
    Write-Host ''
    Write-Host '╔══════════════════════════════════════════════════════════════════╗' -ForegroundColor Red
    Write-Host '║  未检测到 Rust 工具链, 请先安装 Rust 环境                        ║' -ForegroundColor Red
    Write-Host '╚══════════════════════════════════════════════════════════════════╝' -ForegroundColor Red
    Write-Host ''
    Write-Host '  安装步骤:' -ForegroundColor Yellow
    Write-Host '  1. 前往 Rust 官网下载 rustup 安装程序:' -ForegroundColor White
    Write-Host '     https://www.rust-lang.org/tools/install' -ForegroundColor Cyan
    Write-Host '     或直接下载: https://win.rustup.rs/x86_64' -ForegroundColor Cyan
    Write-Host ''
    Write-Host '  2. 运行 rustup-init.exe, 按提示安装 (选择默认选项即可)' -ForegroundColor White
    Write-Host ''
    Write-Host '  3. 安装完成后, 关闭并重新打开 PowerShell, 然后确认:' -ForegroundColor White
    Write-Host '     rustc --version        # 应输出 rustc x.x.x' -ForegroundColor Green
    Write-Host '     cargo --version        # 应输出 cargo x.x.x' -ForegroundColor Green
    Write-Host ''
    Write-Host '  提示: Rust 的 MSVC 目标需要 Visual Studio C++ Build Tools,' -ForegroundColor Yellow
    Write-Host '  rustup 安装程序通常会自动引导您安装。' -ForegroundColor Yellow
    Write-Host ''
}

function Show-VcBuildToolsGuidance {
    Write-Host ''
    Write-Host '╔══════════════════════════════════════════════════════════════════╗' -ForegroundColor Red
    Write-Host '║  未检测到 Visual Studio C++ Build Tools                         ║' -ForegroundColor Red
    Write-Host '╚══════════════════════════════════════════════════════════════════╝' -ForegroundColor Red
    Write-Host ''
    Write-Host '  Tauri 需要 C++ 编译工具来构建原生桌面应用。' -ForegroundColor White
    Write-Host ''
    Write-Host '  安装步骤:' -ForegroundColor Yellow
    Write-Host '  1. 前往 Visual Studio 下载页:' -ForegroundColor White
    Write-Host '     https://visualstudio.microsoft.com/visual-cpp-build-tools/' -ForegroundColor Cyan
    Write-Host ''
    Write-Host '  2. 下载并运行 "Build Tools for Visual Studio 2022"' -ForegroundColor White
    Write-Host ''
    Write-Host '  3. 在安装程序中勾选:' -ForegroundColor White
    Write-Host '     [x] "使用 C++ 的桌面开发" 工作负载' -ForegroundColor Green
    Write-Host '     (英文: "Desktop development with C++")' -ForegroundColor DarkGray
    Write-Host ''
    Write-Host '  4. 安装完成后, 关闭并重新打开 PowerShell, 再次运行 .\dev.ps1' -ForegroundColor White
    Write-Host ''
    Write-Host '  或者通过 winget 命令行安装:' -ForegroundColor Yellow
    Write-Host '     winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"' -ForegroundColor Green
    Write-Host ''
}

# ---------------------------------------------------------------------------
# Main flow: check each dependency, collect missing items, show guidance
# ---------------------------------------------------------------------------
Refresh-Path

$hasMissing = $false

# --- Node.js ---
if (-not (Get-Command nvm -ErrorAction SilentlyContinue)) {
    Show-NvmGuidance
    $hasMissing = $true
} else {
    # nvm is available — try to use Node 22
    & nvm use 22 *> $null
    Refresh-Path

    if (-not (Test-Node22)) {
        # Node 22 is not installed via nvm yet
        Write-Host 'Node.js 22 未通过 nvm 安装, 正在尝试安装...' -ForegroundColor Cyan
        & nvm install 22
        & nvm use 22
        Refresh-Path

        if (-not (Test-Node22)) {
            Show-NodeGuidance
            $hasMissing = $true
        }
    }
}

# --- Rust ---
if (-not (Test-RustToolchain)) {
    Show-RustGuidance
    $hasMissing = $true
}

# --- VC Build Tools ---
if (-not (Test-VcBuildTools)) {
    Show-VcBuildToolsGuidance
    $hasMissing = $true
}

# --- Abort if anything is missing ---
if ($hasMissing) {
    Write-Host ''
    Write-Host '请按照上方提示安装缺失的依赖, 然后重新运行 .\dev.ps1' -ForegroundColor Yellow
    Write-Host ''
    exit 1
}

if ($BootstrapOnly) { exit 0 }

Write-Host '✓ 环境检查通过' -ForegroundColor Green

# --- Install frontend dependencies ---
if (-not (Test-Path 'node_modules/@tauri-apps/cli/package.json')) {
    Write-Host '正在安装前端依赖...' -ForegroundColor Cyan
    npm ci
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$modelFiles = @(
    'models/text_detection.onnx',
    'models/text_recognition.onnx',
    'models/character_dict.txt'
)
if (@($modelFiles | Where-Object { -not (Test-Path $_) }).Count -gt 0) {
    Write-Warning 'OCR 模型文件缺失 (models/ 目录下)。UI 可以启动, 但 OCR 功能不可用。'
}

npm run tauri -- dev
exit $LASTEXITCODE
