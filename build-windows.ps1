# Produces a Windows distributable from a Windows build machine.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# ---------------------------------------------------------------------------
# Ensure vendored Rust crates exist before any build step.
# On a fresh clone src-tauri/vendor/ is gitignored, so this step builds it
# from upstream + local patches (see scripts/bootstrap-vendor.ps1).
# ---------------------------------------------------------------------------
& "$PSScriptRoot\scripts\bootstrap-vendor.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# nvm-windows does not switch versions automatically for every new shell.
if (Get-Command nvm -ErrorAction SilentlyContinue) {
    nvm use 22
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($env:OS -ne 'Windows_NT') {
    throw 'Windows packaging must run on Windows because Tauri builds native Windows binaries.'
}

Clear-Host
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ' StarRail Auto Tools - Windows Packaging' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''
Write-Host '  1. Recommended: NSIS installer (.exe)'
Write-Host '  2. MSI installer (for enterprise deployment)'
Write-Host '  3. Build both installers'
Write-Host '  0. Exit'
Write-Host ''

do {
    $choice = Read-Host 'Choose an option (0-3)'
    $format = switch ($choice) {
        '1' { 'nsis' }
        '2' { 'msi' }
        '3' { 'all' }
        '0' { $null }
        default { 'invalid' }
    }
    if ($format -eq 'invalid') {
        Write-Host 'Please enter 0, 1, 2, or 3.' -ForegroundColor Yellow
    }
} while ($format -eq 'invalid')

if ($choice -eq '0') {
    Write-Host 'Packaging cancelled.'
    exit 0
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
    Write-Host 'Installing locked frontend dependencies...'
    npm ci
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Building Windows package ($format)..."
npm run tauri -- build --bundles $format
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$bundleDir = Join-Path $PSScriptRoot 'src-tauri\target\release\bundle'
Write-Host "Build complete. Installers are in: $bundleDir"
Write-Host 'OCR models are intentionally not bundled; distribute them separately or add them to the bundle resources after licensing and size are decided.'
