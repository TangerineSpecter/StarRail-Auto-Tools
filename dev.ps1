# Local desktop development entry point for Windows PowerShell.
# It can bootstrap the required toolchain on a clean Windows 10/11 machine.
[CmdletBinding()]
param(
    [switch]$BootstrapOnly
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"

    # rustup and nvm-windows can be installed without their directories being
    # visible to the PowerShell process that started this script.
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

function Test-ToolchainReady {
    Refresh-Path
    return (Get-Command nvm -ErrorAction SilentlyContinue) -and
        (Test-Node22) -and
        (Test-RustToolchain) -and
        (Test-VcBuildTools)
}

function Install-WithWinget([string]$Id, [string[]]$ExtraArguments = @()) {
    Write-Host "Installing $Id ..." -ForegroundColor Cyan
    & winget install --exact --id $Id --accept-package-agreements --accept-source-agreements @ExtraArguments
    if ($LASTEXITCODE -ne 0) { throw "winget could not install $Id (exit code $LASTEXITCODE)." }
    Refresh-Path
}

function Install-Toolchain {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw 'Windows Package Manager (winget) is required for automatic setup. Install/update App Installer from Microsoft Store, then run .\\dev.ps1 again.'
    }

    if (-not (Get-Command nvm -ErrorAction SilentlyContinue)) {
        Install-WithWinget 'CoreyButler.NVMforWindows'
    }

    if (-not (Test-Node22)) {
        Write-Host 'Installing and selecting Node.js 22 via nvm-windows ...' -ForegroundColor Cyan
        & nvm install 22
        if ($LASTEXITCODE -ne 0) { throw "nvm could not install Node.js 22 (exit code $LASTEXITCODE)." }
        & nvm use 22
        if ($LASTEXITCODE -ne 0) { throw "nvm could not select Node.js 22 (exit code $LASTEXITCODE)." }
        Refresh-Path
    }

    if (-not (Get-Command rustup -ErrorAction SilentlyContinue)) {
        Install-WithWinget 'Rustlang.Rustup'
    }
    if (-not (Test-RustToolchain)) {
        Write-Host 'Installing the Rust MSVC toolchain ...' -ForegroundColor Cyan
        & rustup default stable-x86_64-pc-windows-msvc
        if ($LASTEXITCODE -ne 0) { throw "rustup could not install the Rust MSVC toolchain (exit code $LASTEXITCODE)." }
        Refresh-Path
    }

    if (-not (Test-VcBuildTools)) {
        # Rust's MSVC target and Tauri's native dependencies need the C++ toolset.
        Install-WithWinget 'Microsoft.VisualStudio.2022.BuildTools' @(
            '--override', '--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'
        )
    }
}

Refresh-Path
if (-not (Test-ToolchainReady)) {
    if (-not $BootstrapOnly -and -not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host 'Missing Windows development prerequisites. Requesting administrator permission to install them...' -ForegroundColor Yellow
        $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-BootstrapOnly')
        $process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $arguments -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw "Prerequisite installation failed (exit code $($process.ExitCode))." }
        Refresh-Path
    } else {
        Install-Toolchain
    }
}

if ($BootstrapOnly) { exit 0 }

if (-not (Test-ToolchainReady)) {
    throw 'The required toolchain is still unavailable. Close and reopen PowerShell, then run .\\dev.ps1 again.'
}

if (-not (Test-Node22)) {
    throw "Node.js 22.12 or newer is required (current: $(& node --version))."
}

if (-not (Test-Path 'node_modules')) {
    Write-Host 'Installing frontend dependencies...' -ForegroundColor Cyan
    npm ci
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$modelFiles = @(
    'models/text_detection.onnx',
    'models/text_recognition.onnx',
    'models/character_dict.txt'
)
if (@($modelFiles | Where-Object { -not (Test-Path $_) }).Count -gt 0) {
    Write-Warning 'OCR model files are missing under models/. The UI can start, but OCR will be unavailable.'
}

npm run tauri -- dev
exit $LASTEXITCODE
