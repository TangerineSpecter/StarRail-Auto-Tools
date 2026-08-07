# 星穹铁道工具箱 · StarRail-Auto-Tools

[![Version](https://img.shields.io/badge/version-1.0.0-4f7fc4?style=flat-square)](https://github.com/TangerineSpecter/StarRail-Auto-Tools/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-4f7fc4?style=flat-square)](#游戏数据直读)
[![Tauri](https://img.shields.io/badge/Tauri-2-24c8d8?style=flat-square&logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![Vue](https://img.shields.io/badge/Vue-3-42b883?style=flat-square&logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![Rust](https://img.shields.io/badge/Rust-2021-000000?style=flat-square&logo=rust)](https://www.rust-lang.org/)
[![License](https://img.shields.io/badge/license-MIT-c7a453?style=flat-square)](./LICENSE)

> 为《崩坏：星穹铁道》打造的本地数据工具。集中管理游戏背包、查看图鉴、规划毕业目标，并支持本地截图 OCR。

## 功能一览

- 📡 **游戏数据直读**：Windows 下监听游戏登录流量，自动归档遗器、光锥与角色数据；不读取游戏进程内存。
- 🗃️ **本地数据管理**：使用 SQLite 保存数据，支持筛选、查看详情、批量删除、配队维护和 HSR-Scanner / Fribbels 兼容 JSON 导出。
- 🗺️ **图鉴与培养规划**：内置遗器、位面饰品、角色与光锥参考数据，支持角色毕业目标和配装推荐。
- 🔎 **截图识别**：使用本地 PaddleOCR ONNX 模型识别截图，并提供遗器主词条扫描辅助。
- 🖥️ **跨平台开发**：macOS/Linux 可用于界面开发和图片 OCR；Windows 提供完整的游戏数据直读能力。

## 工作方式

```text
Windows Packet Monitor（UDP 23301-23302）
  → reliquary 协议解析
  → 遗器 / 光锥 / 角色完整快照与增量同步
  → SQLite 数据管理与 JSON 导出

游戏窗口采集
  → 画面变化检测
  → 背包详情区域裁剪
  → PaddleOCR ONNX（Rust）
  → 字段规则校验与去重
  → 本地数据录入
```

- Tauri 负责桌面窗口和前后端通信。
- Rust 负责网络包解析、SQLite 持久化、截图处理和 OCR 推理。
- Windows 游戏数据直读基于系统 Packet Monitor 与 `reliquary v22.0.0`，无需安装 Npcap。
- OCR 使用 `oar-ocr` 加载 PaddleOCR ONNX 检测/识别模型。
- YOLO 不是 OCR 的替代品；只有在固定区域裁剪不可靠时，才用于定位物品或详情面板。
- 大模型不进入逐帧主链路，只预留给低置信度结果做可选复核。

## 开发

要求：

- Node.js 22.12+
- Rust 1.95+
- Windows 10/11（游戏窗口采集的目标平台）

macOS/Linux：

```bash
chmod +x dev.sh
./dev.sh
```

Windows PowerShell：

```powershell
.\dev.ps1
```

首次在 Windows 10/11 上运行 `dev.ps1` 时，脚本会请求一次管理员授权，并通过
Windows Package Manager（winget）自动安装 nvm-windows、Node.js 22、Rust 和 Visual
Studio C++ Build Tools；随后会执行 `npm ci` 并启动应用。若电脑没有 winget，请先从
Microsoft Store 安装/更新 **App Installer**。也可以直接使用 `npm run dev:desktop`，但这
要求上述环境已经手动配置完成。

`dev.sh` 会在检测到 nvm 时自动执行 `nvm use 22`，避免 IDE 或非交互终端误用系统 Node。Windows 脚本在检测到 nvm-windows 时也会切换至 22。

在 macOS/Linux 上可以开发界面和测试图片 OCR；游戏窗口采集计划在 Windows 上启用，目前适配器仍在开发中。

## 游戏数据直读

Windows 10/11 版本会以管理员权限启动，并自动监听星穹铁道登录流量。使用步骤：

1. 启动工具并接受 Windows UAC。
2. 等待状态显示“等待登录”。
3. 从游戏的“点击进入游戏”界面重新登录。
4. 完整数据解析成功后，遗器、光锥和角色会写入本地 SQLite 数据库。

应用不会读取游戏进程内存。数据库保存在 Tauri 应用数据目录的
`inventory.sqlite3`，只保留当前状态；本地删除的数据会在下次完整同步时恢复。
数据管理页面支持分页筛选、详情、批量删除、分类清空、本地配队维护和 HSR-Scanner/Fribbels
兼容 JSON 导出。

## 公共遗器图鉴

客户端内置遗器套装与位面饰品图鉴，供图鉴展示和毕业方案选项使用，不依赖游戏登录或本地背包。数据以 JSON 和图片随客户端发版；更新方法见 [公共数据维护文档](./docs/遗器图鉴维护.md)。

## OCR 模型

应用需要三个本地文件：

```text
models/
  text_detection.onnx
  text_recognition.onnx
  character_dict.txt
```

模型不会提交到仓库。可以使用 PaddleOCR 的中文 PP-OCR ONNX 模型；最终模型版本应根据游戏截图样本进行准确率测试后锁定。

## Windows 打包

在 Windows 10/11 上，直接双击 [`build-windows.cmd`](./build-windows.cmd)。脚本会显示菜单供选择：推荐的 NSIS 安装包 EXE、企业部署用 MSI，或同时构建两种格式。

默认生成 **NSIS 安装包 EXE**，输出目录为 `src-tauri\target\release\bundle\nsis`。这是推荐的发布形式：它会创建开始菜单/卸载入口，并按当前配置在用户缺少 WebView2 Runtime 时使用轻量下载引导程序安装该运行时。

不建议直接分发 `target\release` 下的裸 EXE：用户仍可能缺少 WebView2，且后续应用资源、模型和升级管理会变得零散。当前 OCR 模型刻意未打入安装包（体积和模型许可待确定）；发布时应单独提供模型下载，或在确认许可和体积后把 `models/` 加入 Tauri bundle resources。
