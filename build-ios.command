#!/usr/bin/env bash
# Finder double-click entry point; keep errors visible in Terminal.
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
build_status=0
bash "$project_dir/build-ios.sh" "$@" || build_status=$?
echo ""
read -r -p "按回车关闭此窗口…" || true
exit "$build_status"
