#!/usr/bin/env bash
# Local desktop development entry point for macOS and Linux.
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_dir"

# Desktop shells launched by IDEs usually do not load nvm automatically.
nvm_dir="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$nvm_dir/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$nvm_dir/nvm.sh"
  nvm use 22 >/dev/null
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: $1 is required. $2" >&2
    exit 1
  fi
}

require_command node "Install Node.js 22.12 or newer first."
require_command npm "Install Node.js 22.12 or newer first."
require_command cargo "Install Rust via https://rustup.rs first."

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'; then
  echo "Error: Node.js 22.12 or newer is required (current: $(node --version))." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing frontend dependencies..."
  npm ci
fi

if [ ! -f models/text_detection.onnx ] || \
   [ ! -f models/text_recognition.onnx ] || \
   [ ! -f models/character_dict.txt ]; then
  echo "Warning: OCR model files are missing under models/. The UI can start, but OCR will be unavailable."
fi

exec npm run tauri -- dev
