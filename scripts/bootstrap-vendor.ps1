# Bootstraps src-tauri/vendor/reliquary-archiver on Windows.
#
# Resolution order (first hit wins):
#   1. Already present at src-tauri/vendor/reliquary-archiver/Cargo.toml → skip.
#   2. Local cached zip at vendor-cache/reliquary-archiver-v0.17.1-patched.zip
#      → Expand-Archive it.  This is the preferred, reproducible, offline-safe
#      source of truth.  The cached zip ships inside the git repo so it does
#      not depend on the upstream GitHub repo staying available.
#   3. Fallback: clone the exact upstream tag (v0.17.1) from GitHub and apply
#      the two local patches that gate Win32 VERSION/ICON resource embedding
#      behind a never-enabled Cargo feature.  Used only when the cached zip
#      is missing (e.g. developer deleted it manually, or a fresh checkout
#      somehow dropped vendor-cache/).
#
# The patch prevents tauri-build's VERSION/ICON Win32 resources from colliding
# with the transitive resource.lib that reliquary-archiver's build.rs would
# otherwise emit (MSVC errors CVT1100 / LNK1123 on Windows).
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

$repoUrl    = 'https://github.com/IceDynamix/reliquary-archiver.git'
$repoTag    = 'v0.17.1'
$vendorDir  = 'src-tauri\vendor\reliquary-archiver'
$markerFile = Join-Path $vendorDir 'Cargo.toml'
$cacheZip   = 'vendor-cache\reliquary-archiver-v0.17.1-patched.zip'
$tmpDir     = Join-Path $env:TEMP "reliquary-archiver-v0.17.1-$([guid]::NewGuid().ToString('N'))"

# ---------------------------------------------------------------------------
# 1. Already present → nothing to do
# ---------------------------------------------------------------------------
if (Test-Path $markerFile) {
    Write-Verbose "vendor/reliquary-archiver already present; skipping bootstrap."
    exit 0
}

# ---------------------------------------------------------------------------
# 2. Local cached zip → prefer it (offline-safe, reproducible)
# ---------------------------------------------------------------------------
if (Test-Path $cacheZip) {
    Write-Host 'Bootstrapping vendored reliquary-archiver (from local cached zip)...' -ForegroundColor Cyan

    $vendorParent = Split-Path $vendorDir
    if (-not (Test-Path $vendorParent)) { New-Item -ItemType Directory -Path $vendorParent | Out-Null }

    if (Test-Path $vendorDir) {
        Write-Verbose 'vendor/reliquary-archiver appeared concurrently; skipping unpack.'
    } else {
        # PowerShell 5.1+ ships Expand-Archive on every supported Windows box.
        Expand-Archive -LiteralPath $cacheZip -DestinationPath (Split-Path $vendorDir -Parent) -Force
    }

    if (-not (Test-Path $markerFile)) {
        throw "Unpacking $cacheZip did not produce $markerFile. Cache zip corrupt?"
    }

    Write-Host 'vendor/reliquary-archiver bootstrap complete (from local cache).' -ForegroundColor Green
    exit 0
}

# ---------------------------------------------------------------------------
# 3. Fallback: clone upstream + patch locally
# ---------------------------------------------------------------------------
Write-Host "Bootstrapping vendored reliquary-archiver ($repoTag, fallback from GitHub)..." -ForegroundColor Cyan
Write-Warning 'vendor-cache zip missing; bootstrap will be slower and requires internet + git.'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'git is required for the GitHub fallback. Install git or restore vendor-cache/ and try again.'
}

& git clone --depth 1 --branch $repoTag $repoUrl $tmpDir
if ($LASTEXITCODE -ne 0) { throw "git clone failed (exit $LASTEXITCODE)." }

$gitDir = Join-Path $tmpDir '.git'
if (Test-Path $gitDir) { Remove-Item -Recurse -Force $gitDir }

# 3a. Cargo.toml — winres optional + embed-winres feature
$cargoToml = Join-Path $tmpDir 'Cargo.toml'
$cargoContent = Get-Content -Raw $cargoToml

$oldWinres = @'
[target.'cfg(windows)'.build-dependencies]
winres = "0.1.12"
'@
$newWinres = @'
[target.'cfg(windows)'.build-dependencies]
# winres is gated behind the never-enabled `embed-winres` feature so that
# downstream consumers (starrail-auto-tools / tauri-build) remain the sole
# owners of the final executable's VERSION + ICON Win32 resources.  Otherwise
# the transitive `resource.lib` emitted here collides with tauri-build's
# and produces MSVC errors CVT1100 / LNK1123.
winres = { version = "0.1.12", optional = true }
'@
if (-not $cargoContent.Contains($oldWinres)) {
    throw "Cargo.toml patching failed: expected winres build-dep block not found. Upstream layout changed?"
}
$cargoContent = $cargoContent.Replace($oldWinres, $newWinres)

$oldFeatures = @'
[features]
default = ["pcap", "stream"]
gui = [
'@
$newFeatures = @'
[features]
default = ["pcap", "stream"]
# Never enabled by starrail-auto-tools.  See the winres comment in
# [target.'cfg(windows)'.build-dependencies] for rationale.
embed-winres = ["dep:winres"]
gui = [
'@
if (-not $cargoContent.Contains($oldFeatures)) {
    throw "Cargo.toml patching failed: expected [features] block header not found. Upstream layout changed?"
}
$cargoContent = $cargoContent.Replace($oldFeatures, $newFeatures)

Set-Content -NoNewline -Path $cargoToml -Value $cargoContent

# 3b. build.rs — feature-gate winres invocation
$buildRs = Join-Path $tmpDir 'build.rs'
$buildContent = Get-Content -Raw $buildRs

$oldBlock = @'
    #[cfg(target_os = "windows")]
    {
        let mut res = winres::WindowsResource::new();
        res.set_icon("assets/icon.ico").set("InternalName", "Reliquary Archiver");
        res.compile().unwrap();
    }
'@
$newBlock = @'
    // Gated behind a never-enabled Cargo feature so that tauri-build stays the
    // sole owner of the final executable's VERSION + ICON Win32 resources.
    // Otherwise the transitive `resource.lib` from this build.rs collides
    // with tauri-build's and produces MSVC errors CVT1100 / LNK1123.
    #[cfg(all(target_os = "windows", feature = "embed-winres"))]
    {
        let mut res = winres::WindowsResource::new();
        res.set_icon("assets/icon.ico").set("InternalName", "Reliquary Archiver");
        res.compile().unwrap();
    }
'@
if (-not $buildContent.Contains($oldBlock)) {
    throw "build.rs patching failed: expected winres block not found. Upstream layout changed?"
}
$buildContent = $buildContent.Replace($oldBlock, $newBlock)

Set-Content -NoNewline -Path $buildRs -Value $buildContent

# Move into place
$vendorParent = Split-Path $vendorDir
if (-not (Test-Path $vendorParent)) { New-Item -ItemType Directory -Path $vendorParent | Out-Null }

if (Test-Path $vendorDir) {
    Write-Verbose 'vendor/reliquary-archiver appeared concurrently; skipping move.'
} else {
    Move-Item -Force $tmpDir $vendorDir
}

Write-Host 'vendor/reliquary-archiver bootstrap complete (from GitHub fallback).' -ForegroundColor Green
Write-Host "  (hint: you can regenerate the offline cache with: cd src-tauri\vendor; Compress-Archive -Path reliquary-archiver -DestinationPath ..\..\vendor-cache\reliquary-archiver-v0.17.1-patched.zip -Force)"
