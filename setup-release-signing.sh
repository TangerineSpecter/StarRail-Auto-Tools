#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY_DIR="$HOME/.tauri"
PRIVATE_KEY_PATH="$KEY_DIR/starrail-auto-tools.key"
PUBLIC_KEY_PATH="${PRIVATE_KEY_PATH}.pub"

if [[ -e "$PRIVATE_KEY_PATH" || -e "$PUBLIC_KEY_PATH" ]]; then
  echo "密钥已存在：$PRIVATE_KEY_PATH" >&2
  echo "为避免覆盖已发布客户端信任的密钥，本脚本不会自动重新生成。" >&2
  exit 1
fi

if ! command -v openssl >/dev/null; then
  echo "未找到 openssl，无法生成随机密码。" >&2
  exit 1
fi

mkdir -p "$KEY_DIR"
PASSWORD="$(openssl rand -base64 32 | tr -d '\n')"

cd "$ROOT"
npm run tauri -- signer generate --ci --password "$PASSWORD" --write-keys "$PRIVATE_KEY_PATH"

if [[ ! -f "$PRIVATE_KEY_PATH" || ! -f "$PUBLIC_KEY_PATH" ]]; then
  echo "Tauri 未生成预期的私钥或公钥文件。" >&2
  exit 1
fi

cat <<EOF

密钥已生成。请将下面三段内容分别保存到 GitHub 仓库的 Actions Secrets；
不要提交它们，也不要发送给其他人。

TAURI_SIGNING_PRIVATE_KEY
$(cat "$PRIVATE_KEY_PATH")

TAURI_SIGNING_PRIVATE_KEY_PASSWORD
$PASSWORD

TAURI_UPDATER_PUBLIC_KEY
$(cat "$PUBLIC_KEY_PATH")

私钥文件已保存到：$PRIVATE_KEY_PATH
请立即备份该私钥和密码；不要删除或替换它，否则旧客户端无法验证后续自动更新。
EOF
