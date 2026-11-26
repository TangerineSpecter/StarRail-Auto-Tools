#!/usr/bin/env bash
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
cd "$ROOT"

SEMVER_REGEX='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'

usage() {
  cat <<'EOF'
用法: bash release-desktop.sh [version] [-y]

示例:
  bash release-desktop.sh
  bash release-desktop.sh 1.0.1
  bash release-desktop.sh v1.0.1 -y

未传 version 时会交互式提示输入版本号（可直接回车采用建议的下一修订号）。
该命令会同步项目中的版本展示，提交并推送当前分支，随后推送 vX.Y.Z tag。
GitHub Actions 会生成 Windows NSIS 安装包、GitHub Release 和自动更新清单。
EOF
}

VERSION_RAW=""
YES=""

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      exit 0
      ;;
    -y|--yes)
      YES="-y"
      ;;
    -*)
      echo "未知参数：$arg" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [[ -n "$VERSION_RAW" ]]; then
        echo "多余参数：$arg" >&2
        usage >&2
        exit 1
      fi
      VERSION_RAW="$arg"
      ;;
  esac
done

CURRENT_VERSION="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n 1 || true)"
SUGGESTED_VERSION=""
if [[ "$CURRENT_VERSION" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+) ]]; then
  SUGGESTED_VERSION="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.$((BASH_REMATCH[3] + 1))"
fi

if [[ -z "$VERSION_RAW" ]]; then
  if [[ -t 0 ]]; then
    if [[ -n "$CURRENT_VERSION" ]]; then
      echo "当前版本: ${CURRENT_VERSION}"
    fi
    while true; do
      if [[ -n "$SUGGESTED_VERSION" ]]; then
        if ! read -r -p "请输入发布版本号（默认 ${SUGGESTED_VERSION}，支持 v 前缀，回车使用默认）: " input; then
          echo
          echo "已取消。"
          exit 0
        fi
      else
        if ! read -r -p "请输入发布版本号（SemVer，例如 1.0.1）: " input; then
          echo
          echo "已取消。"
          exit 0
        fi
      fi
      input="${input#"${input%%[![:space:]]*}"}"
      input="${input%"${input##*[![:space:]]}"}"
      if [[ -z "$input" && -n "$SUGGESTED_VERSION" ]]; then
        VERSION_RAW="$SUGGESTED_VERSION"
      else
        VERSION_RAW="$input"
      fi
      candidate="${VERSION_RAW#v}"
      if [[ "$candidate" =~ $SEMVER_REGEX ]]; then
        break
      fi
      echo "版本号无效：${VERSION_RAW:-<空>}（需要 SemVer，例如 1.0.1）" >&2
    done
  else
    if IFS= read -r input; then
      input="${input#"${input%%[![:space:]]*}"}"
      input="${input%"${input##*[![:space:]]}"}"
      VERSION_RAW="$input"
    fi
    if [[ -z "$VERSION_RAW" ]]; then
      usage >&2
      exit 1
    fi
  fi
fi

VERSION="${VERSION_RAW#v}"
TAG="v${VERSION}"

if ! [[ "$VERSION" =~ $SEMVER_REGEX ]]; then
  echo "版本号无效：${VERSION_RAW}（需要 SemVer，例如 1.0.1）" >&2
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
if git diff --cached --quiet; then
  echo "项目版本已是 ${VERSION}，无需创建版本提交。"
else
  git commit -m "chore: release ${TAG}"
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git push -u origin "$BRANCH"
if git show-ref --verify --quiet "refs/tags/${TAG}"; then
  echo "本地 tag ${TAG} 已存在，停止以避免覆盖已有发布。" >&2
  exit 1
fi
git tag "$TAG"
git push origin "refs/tags/${TAG}:refs/tags/${TAG}"
if ! git ls-remote --exit-code --tags origin "refs/tags/${TAG}" >/dev/null; then
  echo "远程未找到 ${TAG}；发布已中止，请检查 git push 输出和仓库权限。" >&2
  exit 1
fi

echo "已推送 ${TAG}。GitHub Actions 将发布 Windows 安装包与自动更新清单。"
