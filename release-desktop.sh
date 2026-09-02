#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

VERSION_RAW="${1:-}"
YES="${2:-}"

if [[ -z "$VERSION_RAW" || "$VERSION_RAW" == "-h" || "$VERSION_RAW" == "--help" ]]; then
  cat <<'EOF'
用法: bash release-desktop.sh <version> [-y]

示例:
  bash release-desktop.sh 1.0.1
  bash release-desktop.sh v1.0.1 -y

该命令会同步项目中的版本展示，提交并推送当前分支，随后推送 vX.Y.Z tag。
GitHub Actions 会生成 Windows NSIS 安装包、GitHub Release 和自动更新清单。
EOF
  [[ -n "$VERSION_RAW" ]] && exit 0
  exit 1
fi

VERSION="${VERSION_RAW#v}"
TAG="v${VERSION}"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]]; then
  echo "版本号无效：$VERSION_RAW（需要 SemVer，例如 1.0.1）" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "工作区存在未提交改动；请先提交或暂存后再发版。" >&2
  exit 1
fi

node scripts/set-release-version.mjs "$VERSION"
git diff --check
git status --short

if [[ "$YES" != "-y" && "$YES" != "--yes" ]]; then
  read -r -p "确认提交、推送并创建 ${TAG}？[y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { echo "已取消；版本文件保留在工作区。"; exit 0; }
fi

git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock \
  src-tauri/tauri.conf.json src/shared/app-info.ts README.md
git commit -m "chore: release ${TAG}"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git push -u origin "$BRANCH"
git tag "$TAG"
git push origin "refs/tags/${TAG}"

echo "已推送 ${TAG}。GitHub Actions 将发布 Windows 安装包与自动更新清单。"
