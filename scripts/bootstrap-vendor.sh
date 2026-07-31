#!/usr/bin/env bash
# Bootstraps src-tauri/vendor/reliquary-archiver on macOS / Linux.
#
# Resolution order (first hit wins):
#   1. Already present at src-tauri/vendor/reliquary-archiver/Cargo.toml → skip.
#   2. Local cached zip at vendor-cache/reliquary-archiver-v0.17.1-patched.zip
#      → unpack it.  This is the preferred, reproducible, offline-safe source
#      of truth.  The cached zip ships inside the git repo so it does not
#      depend on the upstream GitHub repo staying available.
#   3. Fallback: clone the exact upstream tag (v0.17.1) from GitHub and apply
#      the two local patches that gate Win32 VERSION/ICON resource embedding
#      behind a never-enabled Cargo feature.  Used only when the cached zip
#      is missing (e.g. developer deleted it manually, or a fresh checkout
#      somehow dropped vendor-cache/).
#
# The patch prevents tauri-build's VERSION/ICON Win32 resources from colliding
# with the transitive resource.lib that reliquary-archiver's build.rs would
# otherwise emit (MSVC errors CVT1100 / LNK1123 on Windows).
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

repo_url="https://github.com/IceDynamix/reliquary-archiver.git"
repo_tag="v0.17.1"
vendor_dir="src-tauri/vendor/reliquary-archiver"
marker_file="$vendor_dir/Cargo.toml"
cache_zip="vendor-cache/reliquary-archiver-v0.17.1-patched.zip"
tmp_dir="$(mktemp -d -t reliquary-archiver-v0.17.1.XXXXXX)"
trap 'rm -rf "$tmp_dir"' EXIT

# ---------------------------------------------------------------------------
# 1. Already present → nothing to do
# ---------------------------------------------------------------------------
if [ -f "$marker_file" ]; then
    if [ "${VERBOSE:-0}" = "1" ]; then
        echo "vendor/reliquary-archiver already present; skipping bootstrap."
    fi
    exit 0
fi

# ---------------------------------------------------------------------------
# 2. Local cached zip → prefer it (offline-safe, reproducible)
# ---------------------------------------------------------------------------
if [ -f "$cache_zip" ]; then
    echo "Bootstrapping vendored reliquary-archiver (from local cached zip)..."
    mkdir -p "src-tauri/vendor"
    if [ -d "$vendor_dir" ]; then
        if [ "${VERBOSE:-0}" = "1" ]; then
            echo "vendor/reliquary-archiver appeared concurrently; skipping unpack."
        fi
        exit 0
    fi
    # macOS ships `ditto`; GNU/Linux ships `unzip`.  Try both.
    if command -v ditto >/dev/null 2>&1; then
        ditto -x -k "$cache_zip" "src-tauri/vendor"
    elif command -v unzip >/dev/null 2>&1; then
        unzip -q "$cache_zip" -d "src-tauri/vendor"
    else
        echo "error: neither 'ditto' nor 'unzip' available to unpack $cache_zip. Install unzip and try again." >&2
        exit 1
    fi

    if [ ! -f "$marker_file" ]; then
        echo "error: unpacking $cache_zip did not produce $marker_file. Cache zip corrupt?" >&2
        exit 1
    fi
    echo "vendor/reliquary-archiver bootstrap complete (from local cache)."
    exit 0
fi

# ---------------------------------------------------------------------------
# 3. Fallback: clone upstream + patch locally
# ---------------------------------------------------------------------------
echo "Bootstrapping vendored reliquary-archiver ($repo_tag, fallback from GitHub)..."
echo "  (note: vendor-cache zip missing; bootstrap will be slower and requires internet + git)"

if ! command -v git >/dev/null 2>&1; then
    echo "error: git is required for the GitHub fallback. Install git or restore vendor-cache/ and try again." >&2
    exit 1
fi

git clone --depth 1 --branch "$repo_tag" "$repo_url" "$tmp_dir"

rm -rf "$tmp_dir/.git"

# 3a. Cargo.toml — winres optional + embed-winres feature
cargo_toml="$tmp_dir/Cargo.toml"

perl -0777 -i -pe '
s|\[target\.'\''cfg\(windows\)'\''\.build-dependencies\]\nwinres = "0\.1\.12"|[target.'\''cfg(windows)'\''.build-dependencies]
# winres is gated behind the never-enabled `embed-winres` feature so that
# downstream consumers (starrail-auto-tools / tauri-build) remain the sole
# owners of the final executable'\''s VERSION + ICON Win32 resources.  Otherwise
# the transitive `resource.lib` emitted here collides with tauri-build'\''s
# and produces MSVC errors CVT1100 / LNK1123.
winres = { version = "0.1.12", optional = true }|gs
' "$cargo_toml"

perl -0777 -i -pe '
s|\[features\]\ndefault = \["pcap", "stream"\]\ngui = \[|[features]
default = ["pcap", "stream"]
# Never enabled by starrail-auto-tools.  See the winres comment in
# [target.'\''cfg(windows)'\''.build-dependencies] for rationale.
embed-winres = ["dep:winres"]
gui = [|gs
' "$cargo_toml"

if ! grep -q 'optional = true' "$cargo_toml" || ! grep -q 'embed-winres' "$cargo_toml"; then
    echo "error: Cargo.toml patching failed. Expected markers missing. Upstream layout changed?" >&2
    exit 1
fi

# 3b. build.rs — feature-gate winres call
build_rs="$tmp_dir/build.rs"

perl -0777 -i -pe '
s|    #\[cfg\(target_os = "windows"\)\]\n    \{\n        let mut res = winres::WindowsResource::new\(\);\n        res\.set_icon\("assets/icon\.ico"\)\.set\("InternalName", "Reliquary Archiver"\);\n        res\.compile\(\)\.unwrap\(\);\n    \}|    \/\/ Gated behind a never-enabled Cargo feature so that tauri-build stays the\n    \/\/ sole owner of the final executable'\''s VERSION + ICON Win32 resources.\n    \/\/ Otherwise the transitive `resource.lib` from this build.rs collides\n    \/\/ with tauri-build'\''s and produces MSVC errors CVT1100 \/ LNK1123.\n    #\[cfg(all(target_os = "windows", feature = "embed-winres"))\]\n    {\n        let mut res = winres::WindowsResource::new();\n        res.set_icon("assets\/icon.ico").set("InternalName", "Reliquary Archiver");\n        res.compile().unwrap();\n    }|gs
' "$build_rs"

if ! grep -q 'feature = "embed-winres"' "$build_rs"; then
    echo "error: build.rs patching failed. Expected feature-gate marker missing. Upstream layout changed?" >&2
    exit 1
fi

mkdir -p "src-tauri/vendor"
if [ -d "$vendor_dir" ]; then
    if [ "${VERBOSE:-0}" = "1" ]; then
        echo "vendor/reliquary-archiver appeared concurrently; skipping move."
    fi
else
    mv "$tmp_dir" "$vendor_dir"
fi

echo "vendor/reliquary-archiver bootstrap complete (from GitHub fallback)."
echo "  (hint: you can regenerate the offline cache with: cd src-tauri/vendor && zip -qr ../../vendor-cache/reliquary-archiver-v0.17.1-patched.zip reliquary-archiver)"
