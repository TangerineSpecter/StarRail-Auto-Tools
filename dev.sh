#!/usr/bin/env bash
# Local desktop development entry point for macOS and Linux.
# It checks the required toolchain and gives guidance when something is missing.
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_dir"

# ---------------------------------------------------------------------------
# Ensure vendored Rust crates exist before any Cargo/toolchain check.
# On a fresh clone src-tauri/vendor/ is gitignored, so this step builds it
# from upstream + local patches (see scripts/bootstrap-vendor.sh).
# ---------------------------------------------------------------------------
bash "$project_dir/scripts/bootstrap-vendor.sh"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
DIM='\033[2m'
NC='\033[0m' # No Color

has_missing=false

# ---------------------------------------------------------------------------
# Node.js — use nvm to switch to Node 22
# ---------------------------------------------------------------------------
nvm_dir="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$nvm_dir/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$nvm_dir/nvm.sh"

  # Try to use Node 22
  if ! nvm use 22 >/dev/null 2>&1; then
    printf '%b\n' "${CYAN}Node.js 22 未通过 nvm 安装, 正在尝试安装...${NC}"
    nvm install 22
    nvm use 22
  fi
else
  echo ''
  printf '%b\n' "${RED}╔══════════════════════════════════════════════════════════════════╗${NC}"
  printf '%b\n' "${RED}║  未检测到 nvm，请先安装 nvm 来管理 Node.js 版本                  ║${NC}"
  printf '%b\n' "${RED}╚══════════════════════════════════════════════════════════════════╝${NC}"
  echo ''
  printf '%b\n' "${YELLOW}  安装步骤:${NC}"
  printf '%b\n' "${WHITE}  1. 执行以下命令安装 nvm:${NC}"
  printf '%b\n' "${GREEN}     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash${NC}"
  echo ''
  printf '%b\n' "${WHITE}  2. 安装完成后, 关闭并重新打开终端, 或者执行:${NC}"
  printf '%b\n' "${GREEN}     source ~/.bashrc${NC}  ${DIM}# 如果使用 bash${NC}"
  printf '%b\n' "${GREEN}     source ~/.zshrc${NC}   ${DIM}# 如果使用 zsh${NC}"
  echo ''
  printf '%b\n' "${WHITE}  3. 安装并切换到 Node.js 22:${NC}"
  printf '%b\n' "${GREEN}     nvm install 22        ${DIM}# 安装 Node.js 22 最新版${NC}"
  printf '%b\n' "${GREEN}     nvm use 22            ${DIM}# 切换到 Node.js 22${NC}"
  echo ''
  printf '%b\n' "${WHITE}  4. 确认安装成功:${NC}"
  printf '%b\n' "${GREEN}     node --version        ${DIM}# 应输出 v22.x.x${NC}"
  printf '%b\n' "${GREEN}     npm --version         ${DIM}# 应输出版本号${NC}"
  echo ''
  has_missing=true
fi

# Check Node version if node is available
if command -v node >/dev/null 2>&1; then
  if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'; then
    echo ''
    printf '%b\n' "${RED}╔══════════════════════════════════════════════════════════════════╗${NC}"
    printf '%b\n' "${RED}║  Node.js 版本不满足要求 (需要 22.12+)                            ║${NC}"
    printf '%b\n' "${RED}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ''
    printf '%b\n' "${WHITE}  当前版本: $(node --version)${NC}"
    echo ''
    printf '%b\n' "${YELLOW}  请使用 nvm 安装并切换到 Node.js 22:${NC}"
    printf '%b\n' "${GREEN}     nvm install 22        ${DIM}# 安装 Node.js 22 最新版${NC}"
    printf '%b\n' "${GREEN}     nvm use 22            ${DIM}# 切换到 Node.js 22${NC}"
    echo ''
    has_missing=true
  fi
elif [ "$has_missing" = false ]; then
  # nvm is loaded but node is still not available
  echo ''
  printf '%b\n' "${RED}  未检测到 node 命令, 请通过 nvm 安装 Node.js 22:${NC}"
  printf '%b\n' "${GREEN}     nvm install 22${NC}"
  printf '%b\n' "${GREEN}     nvm use 22${NC}"
  echo ''
  has_missing=true
fi

# ---------------------------------------------------------------------------
# Rust — check cargo availability
# ---------------------------------------------------------------------------
if ! command -v cargo >/dev/null 2>&1; then
  echo ''
  printf '%b\n' "${RED}╔══════════════════════════════════════════════════════════════════╗${NC}"
  printf '%b\n' "${RED}║  未检测到 Rust 工具链, 请先安装 Rust 环境                        ║${NC}"
  printf '%b\n' "${RED}╚══════════════════════════════════════════════════════════════════╝${NC}"
  echo ''
  printf '%b\n' "${YELLOW}  安装步骤:${NC}"
  printf '%b\n' "${WHITE}  1. 前往 Rust 官网或直接执行以下命令安装 rustup:${NC}"
  printf '%b\n' "${CYAN}     https://www.rust-lang.org/tools/install${NC}"
  printf '%b\n' "${GREEN}     curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh${NC}"
  echo ''
  printf '%b\n' "${WHITE}  2. 按提示选择默认安装选项即可${NC}"
  echo ''
  printf '%b\n' "${WHITE}  3. 安装完成后, 加载环境变量:${NC}"
  printf '%b\n' "${GREEN}     source \"\$HOME/.cargo/env\"${NC}"
  echo ''
  printf '%b\n' "${WHITE}  4. 确认安装成功:${NC}"
  printf '%b\n' "${GREEN}     rustc --version        ${DIM}# 应输出 rustc x.x.x${NC}"
  printf '%b\n' "${GREEN}     cargo --version        ${DIM}# 应输出 cargo x.x.x${NC}"
  echo ''

  # macOS additional hint
  if [[ "$OSTYPE" == "darwin"* ]]; then
    printf '%b\n' "${YELLOW}  macOS 用户提示:${NC}"
    printf '%b\n' "${WHITE}  如果尚未安装 Xcode Command Line Tools, 请先执行:${NC}"
    printf '%b\n' "${GREEN}     xcode-select --install${NC}"
    echo ''
  fi

  has_missing=true
fi

# ---------------------------------------------------------------------------
# Abort if anything is missing
# ---------------------------------------------------------------------------
if [ "$has_missing" = true ]; then
  echo ''
  printf '%b\n' "${YELLOW}请按照上方提示安装缺失的依赖, 然后重新运行 ./dev.sh${NC}"
  echo ''
  exit 1
fi

printf '%b\n' "${GREEN}✓ 环境检查通过${NC}"

# ---------------------------------------------------------------------------
# Install frontend dependencies and start dev server
# ---------------------------------------------------------------------------
if [ ! -d node_modules ]; then
  echo "正在安装前端依赖..."
  npm ci
fi

# ---------------------------------------------------------------------------
# Keep Cargo's local debug cache bounded.
# A clean first development build currently occupies about 4.7 GiB in
# src-tauri/target/debug, so use an 8 GiB threshold instead of cleaning on
# every launch. The release profile is intentionally excluded: dev.sh only
# uses the debug target, while GitHub packaging runs in a separate CI checkout.
# Override with STARRAIL_DEV_CACHE_LIMIT_MB when a different limit is needed.
# ---------------------------------------------------------------------------
dev_target_dir="$project_dir/src-tauri/target/debug"
dev_cache_limit_mb="${STARRAIL_DEV_CACHE_LIMIT_MB:-8192}"
if [ -d "$dev_target_dir" ]; then
  dev_cache_size_mb="$(du -sm "$dev_target_dir" | awk '{print $1}')"
  if [ "$dev_cache_size_mb" -ge "$dev_cache_limit_mb" ]; then
    printf '%b\n' "${YELLOW}Rust Debug 缓存 ${dev_cache_size_mb}MB 已达到上限 ${dev_cache_limit_mb}MB，正在清理...${NC}"
    cargo clean --manifest-path "$project_dir/src-tauri/Cargo.toml" --profile dev
  else
    printf '%b\n' "${DIM}Rust Debug 缓存：${dev_cache_size_mb}MB / ${dev_cache_limit_mb}MB${NC}"
  fi
fi

printf '%b\n' "${DIM}OCR：默认开发构建未启用；需要识别时使用 npm run tauri -- dev --features ocr，并在应用内下载模型。${NC}"

exec npm run tauri -- dev
