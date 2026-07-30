# Local desktop development entry point for Windows PowerShell.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# nvm-windows does not switch versions automatically for every new shell.
if (Get-Command nvm -ErrorAction SilentlyContinue) {
    nvm use 22
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Require-Command([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is required. $Hint"
    }
}

Require-Command 'node' 'Install Node.js 22.12 or newer first.'
Require-Command 'npm' 'Install Node.js 22.12 or newer first.'
Require-Command 'cargo' 'Install Rust via https://rustup.rs first.'

node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)"
if ($LASTEXITCODE -ne 0) {
    throw "Node.js 22.12 or newer is required (current: $(node --version))."
}

if (-not (Test-Path 'node_modules')) {
    Write-Host 'Installing frontend dependencies...'
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
