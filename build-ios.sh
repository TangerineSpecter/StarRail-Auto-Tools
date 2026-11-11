#!/usr/bin/env bash
# Prepare a standalone iPhone build and hand signing/installation to Xcode.
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$project_dir"

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  echo "用法：./build-ios.sh [--check]"
  echo "默认：准备手机构建版并打开 Xcode，选择自己的手机后按 ⌘R 安装。"
  echo "--check：仅检查环境，不安装依赖、不生成工程、不打开 Xcode。"
  exit 0
fi
if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != "--check" ]; }; then
  echo "不支持的参数，请运行 ./build-ios.sh --help。" >&2
  exit 1
fi
check_only="${1:-}"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "iPhone 打包需要在安装完整 Xcode 的 Mac 上运行。" >&2
  exit 1
fi

nvm_dir="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$nvm_dir/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$nvm_dir/nvm.sh"
  if ! nvm use 22 >/dev/null 2>&1; then
    echo "请先运行 nvm install 22，安装 Node.js 22。" >&2
    exit 1
  fi
fi
if ! command -v node >/dev/null 2>&1 || ! node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  process.exit(major === 22 && minor >= 12 ? 0 : 1);
'; then
  echo "需要 Node.js 22.12 或更高的 22.x 版本，请运行 nvm use 22。" >&2
  exit 1
fi

for tool in npm cargo rustup xcodebuild xcrun; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "缺少 $tool，请先按 docs/iOS个人查看版.md 配置开发环境。" >&2
    exit 1
  fi
done
xcodebuild -version
xcrun --sdk iphoneos --show-sdk-path >/dev/null

if ! rustup target list --installed | grep -qx 'aarch64-apple-ios'; then
  echo "缺少真机 Rust 目标，请先运行：rustup target add aarch64-apple-ios" >&2
  exit 1
fi
if [ ! -x node_modules/.bin/tauri ]; then
  if [ "$check_only" = "--check" ]; then
    echo "缺少项目依赖，请先运行 npm ci。" >&2
    exit 1
  fi
  npm ci
fi
if [ ! -d src-tauri/gen/apple/starrail-auto-tools.xcodeproj ]; then
  echo "缺少 iOS 工程，请先按 docs/iOS个人查看版.md 运行 ios init。" >&2
  exit 1
fi
if [ "$check_only" = "--check" ]; then
  echo "手机打包环境检查通过。"
  exit 0
fi

cat <<'GUIDE'

正在准备可脱离电脑使用的 iPhone 构建版，并打开 Xcode。
保留此终端，直到 Xcode 安装完成：
  1. 用数据线连接并解锁手机，按提示信任电脑、开启开发者模式。
  2. Signing & Capabilities → Team 选择自己的 Personal Team。
  3. 顶部运行设备选择自己的真实 iPhone，按 ⌘R（或左上角 ▶）安装。
  4. 若手机提示“不受信任的开发者”：设置 → 通用 → VPN 与设备管理，信任自己的账号。
免费个人签名到期后，重新运行本脚本并在 Xcode 覆盖安装；无需删除手机上的应用。
GUIDE

# Use bundled frontend assets, never ios dev or the simulator/no-sign target.
# Reuse the existing generated project so its signing team is preserved.
exec npm run tauri -- ios build --target aarch64 --open \
  --export-method debugging --config src-tauri/tauri.ios.conf.json
