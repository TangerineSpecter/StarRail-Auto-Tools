#!/usr/bin/env bash
# Start the mobile development server for an existing iOS simulator app.
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$project_dir"

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
  echo "需要 Node.js 22.12 或更高的 22.x 版本，请通过 nvm 安装并切换。" >&2
  exit 1
fi

for command in xcrun curl lsof; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "缺少 $command，请检查 macOS 和 Xcode 开发环境。" >&2
    exit 1
  fi
done

if [ ! -x node_modules/.bin/vite ]; then
  echo "正在安装前端依赖..."
  npm ci
fi

port="${STARRAIL_IOS_DEV_PORT:-1432}"
if [[ ! "$port" =~ ^[0-9]+$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); then
  echo "STARRAIL_IOS_DEV_PORT 必须是 1 到 65535 之间的端口号。" >&2
  exit 1
fi
port="$((10#$port))"
url="http://127.0.0.1:$port/"
bundle_id="com.starrail.autotools"

# Prefer a running Duo, then any single running iPhone. If none is running,
# boot the only available Duo (or the only available iPhone).
simulator="$(xcrun simctl list devices available --json | node -e '
  let input = "";
  process.stdin.on("data", (chunk) => { input += chunk; });
  process.stdin.on("end", () => {
    const devices = Object.values(JSON.parse(input).devices).flat().filter((device) => {
      const isIphone = device.deviceTypeIdentifier
        ? device.deviceTypeIdentifier.startsWith("com.apple.CoreSimulator.SimDeviceType.iPhone")
        : device.name.startsWith("iPhone");
      return device.isAvailable !== false && isIphone;
    });
    const requested = process.env.STARRAIL_IOS_SIMULATOR_UDID;
    const booted = devices.filter((device) => device.state === "Booted");
    const isDuo = (device) => device.deviceTypeIdentifier
      ? device.deviceTypeIdentifier === "com.apple.CoreSimulator.SimDeviceType.iPhone-Duo"
      : device.name === "iPhone Duo";
    const bootedDuo = booted.filter(isDuo);
    const duo = devices.filter(isDuo);
    let matches;
    if (requested) matches = devices.filter((device) => device.udid === requested);
    else if (bootedDuo.length) matches = bootedDuo;
    else if (booted.length) matches = booted;
    else if (duo.length) matches = duo;
    else matches = devices;

    if (matches.length !== 1) {
      console.error("未能确定 iPhone 模拟器，请先启动一个模拟器，或设置 STARRAIL_IOS_SIMULATOR_UDID。");
      process.exit(1);
    }
    const device = matches[0];
    console.log(`${device.state}\t${device.udid}\t${device.name}`);
  });
')"
IFS=$'\t' read -r simulator_state simulator_udid simulator_name <<< "$simulator"

echo "使用模拟器：$simulator_name"
developer_dir="$(xcode-select -p 2>/dev/null || true)"
simulator_app="$developer_dir/Applications/Simulator.app"
device_hub_app="$(dirname "$developer_dir")/Applications/DeviceHub.app"
if [ -d "$simulator_app" ]; then
  open -a "$simulator_app"
elif [ -d "$device_hub_app" ]; then
  open -a "$device_hub_app"
else
  open -a Simulator
fi
if [ "$simulator_state" != "Booted" ]; then
  echo "正在启动模拟器..."
  xcrun simctl bootstatus "$simulator_udid" -b
fi

if ! xcrun simctl get_app_container "$simulator_udid" "$bundle_id" app >/dev/null 2>&1; then
  echo "模拟器中未安装星穹铁道工具箱；请先安装指向 $url 的 iOS 开发版。" >&2
  echo "此脚本只启动已安装的开发版，不会构建或安装原生应用。" >&2
  exit 1
fi

mobile_server_ready() {
  local html
  html="$(curl --noproxy '*' --fail --silent --max-time 2 "$url" 2>/dev/null)" || return 1
  [[ "$html" == *"/@vite/client"* && "$html" == *"/src/mobile/main.ts"* ]]
}

listener_pids="$(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$listener_pids" ]; then
  # Reuse only a single Vite process belonging to this checkout and serving the
  # mobile entry. Never stop an existing process occupying the port.
  listener_cwd="$(lsof -a -p "$listener_pids" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' || true)"
  listener_command="$(ps -p "$listener_pids" -o command= 2>/dev/null || true)"
  if [[ "$listener_pids" != *$'\n'* && "$listener_cwd" == "$project_dir" && \
        "$listener_command" == *vite* ]] && mobile_server_ready; then
    echo "正在复用本项目的移动端开发服务：$url"
    xcrun simctl launch --terminate-running-process "$simulator_udid" "$bundle_id"
    echo "开发服务由原来的进程管理，请保持那个终端运行。"
    exit 0
  fi
  echo "端口 $port 已被其他进程占用，无法启动移动端开发服务。" >&2
  echo "请先检查占用进程，或使用与已安装开发版一致的其他端口。" >&2
  exit 1
fi

server_pid=""
cleanup() {
  if [ -n "$server_pid" ]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "正在启动移动端开发服务：$url"
node_modules/.bin/vite --mode mobile --host 127.0.0.1 --port "$port" --strictPort &
server_pid=$!

ready=false
for ((attempt = 0; attempt < 60; attempt++)); do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "移动端开发服务启动失败，请检查上面的错误。" >&2
    exit 1
  fi
  if mobile_server_ready; then
    ready=true
    break
  fi
  sleep 0.25
done

if [ "$ready" != true ]; then
  echo "移动端开发服务未及时就绪，请检查上面的错误。" >&2
  exit 1
fi

xcrun simctl launch --terminate-running-process "$simulator_udid" "$bundle_id"
echo "应用已启动。请保持此终端运行；按 Ctrl+C 停止开发服务。"
wait "$server_pid"
