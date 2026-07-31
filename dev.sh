#!/usr/bin/env bash
# Local desktop development entry point for macOS and Linux.
# It checks the required toolchain and gives guidance when something is missing.
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_dir"

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
    echo -e "${CYAN}Node.js 22 未通过 nvm 安装, 正在尝试安装...${NC}"
    nvm install 22
    nvm use 22
  fi
else
  echo ''
  echo -e "${RED}╔══════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  未检测到 nvm，请先安装 nvm 来管理 Node.js 版本                  ║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════════════════════════╝${NC}"
  echo ''
  echo -e "${YELLOW}  安装步骤:${NC}"
  echo -e "${WHITE}  1. 执行以下命令安装 nvm:${NC}"
  echo -e "${GREEN}     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash${NC}"
  echo ''
  echo -e "${WHITE}  2. 安装完成后, 关闭并重新打开终端, 或者执行:${NC}"
  echo -e "${GREEN}     source ~/.bashrc${NC}  ${DIM}# 如果使用 bash${NC}"
  echo -e "${GREEN}     source ~/.zshrc${NC}   ${DIM}# 如果使用 zsh${NC}"
  echo ''
  echo -e "${WHITE}  3. 安装并切换到 Node.js 22:${NC}"
  echo -e "${GREEN}     nvm install 22        ${DIM}# 安装 Node.js 22 最新版${NC}"
  echo -e "${GREEN}     nvm use 22            ${DIM}# 切换到 Node.js 22${NC}"
  echo ''
  echo -e "${WHITE}  4. 确认安装成功:${NC}"
  echo -e "${GREEN}     node --version        ${DIM}# 应输出 v22.x.x${NC}"
  echo -e "${GREEN}     npm --version         ${DIM}# 应输出版本号${NC}"
  echo ''
  has_missing=true
fi

# Check Node version if node is available
if command -v node >/dev/null 2>&1; then
  if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'; then
    echo ''
    echo -e "${RED}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  Node.js 版本不满足要求 (需要 22.12+)                            ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ''
    echo -e "${WHITE}  当前版本: $(node --version)${NC}"
    echo ''
    echo -e "${YELLOW}  请使用 nvm 安装并切换到 Node.js 22:${NC}"
    echo -e "${GREEN}     nvm install 22        ${DIM}# 安装 Node.js 22 最新版${NC}"
    echo -e "${GREEN}     nvm use 22            ${DIM}# 切换到 Node.js 22${NC}"
    echo ''
    has_missing=true
  fi
elif [ "$has_missing" = false ]; then
  # nvm is loaded but node is still not available
  echo ''
  echo -e "${RED}  未检测到 node 命令, 请通过 nvm 安装 Node.js 22:${NC}"
  echo -e "${GREEN}     nvm install 22${NC}"
  echo -e "${GREEN}     nvm use 22${NC}"
  echo ''
  has_missing=true
fi

# ---------------------------------------------------------------------------
# Rust — check cargo availability
# ---------------------------------------------------------------------------
if ! command -v cargo >/dev/null 2>&1; then
  echo ''
  echo -e "${RED}╔══════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  未检测到 Rust 工具链, 请先安装 Rust 环境                        ║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════════════════════════╝${NC}"
  echo ''
  echo -e "${YELLOW}  安装步骤:${NC}"
  echo -e "${WHITE}  1. 前往 Rust 官网或直接执行以下命令安装 rustup:${NC}"
  echo -e "${CYAN}     https://www.rust-lang.org/tools/install${NC}"
  echo -e "${GREEN}     curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh${NC}"
  echo ''
  echo -e "${WHITE}  2. 按提示选择默认安装选项即可${NC}"
  echo ''
  echo -e "${WHITE}  3. 安装完成后, 加载环境变量:${NC}"
  echo -e "${GREEN}     source \"\$HOME/.cargo/env\"${NC}"
  echo ''
  echo -e "${WHITE}  4. 确认安装成功:${NC}"
  echo -e "${GREEN}     rustc --version        ${DIM}# 应输出 rustc x.x.x${NC}"
  echo -e "${GREEN}     cargo --version        ${DIM}# 应输出 cargo x.x.x${NC}"
  echo ''

  # macOS additional hint
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${YELLOW}  macOS 用户提示:${NC}"
    echo -e "${WHITE}  如果尚未安装 Xcode Command Line Tools, 请先执行:${NC}"
    echo -e "${GREEN}     xcode-select --install${NC}"
    echo ''
  fi

  has_missing=true
fi

# ---------------------------------------------------------------------------
# Abort if anything is missing
# ---------------------------------------------------------------------------
if [ "$has_missing" = true ]; then
  echo ''
  echo -e "${YELLOW}请按照上方提示安装缺失的依赖, 然后重新运行 ./dev.sh${NC}"
  echo ''
  exit 1
fi

echo -e "${GREEN}✓ 环境检查通过${NC}"

# ---------------------------------------------------------------------------
# Install frontend dependencies and start dev server
# ---------------------------------------------------------------------------
if [ ! -d node_modules ]; then
  echo "正在安装前端依赖..."
  npm ci
fi

if [ ! -f models/text_detection.onnx ] || \
   [ ! -f models/text_recognition.onnx ] || \
   [ ! -f models/character_dict.txt ]; then
  echo -e "${YELLOW}Warning: OCR 模型文件缺失 (models/ 目录下)。UI 可以启动, 但 OCR 功能不可用。${NC}"
fi

exec npm run tauri -- dev
