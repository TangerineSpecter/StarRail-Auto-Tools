# iOS 个人查看版

移动端复用电脑端视觉和展示组件，包括背包列表和筛选、遗器质量排序和标签预览、角色属性与技能行迹及配装评分、遗器和光锥详情、完整图鉴、遗器分析和毕业进度。支持查询角色、遗器、光锥和毕业方案，通过 WebDAV 下载电脑端上传的快照。移动端没有上传或背包编辑入口。电脑端和手机端共用同步快照格式和库存数据库逻辑；同步出现本地冲突时停止，不自动覆盖。

“分析”入口替代移动端原“配队”入口，复用主属性扫描和替换推荐：前者按套装、部位汇总没有目标主属性的未装备遗器，后者对照已同步培养方案和当前穿戴寻找替换候选。点击推荐卡片可查看详情；两种扫描均只读，不会删除、标记或更换装备。替换推荐一次最多分析前 200 件未装备遗器，超出时显示范围提示。返回分析页保留扫描结果，同步库存修订后重新加载分析组件。

已在 iOS 27 和 27.2 的 iPhone 模拟器中构建、启动并验证空数据界面和本地数据库初始化；27.2 验证包含复用电脑端设计后的移动界面。浏览器使用明确的测试数据验证了各页面和详情，未产生数据写入请求；真实 WebDAV 同步、真实数据展示和 iPhone 真机仍需验证。移动端查看角色时不会保存派生评分缓存，毕业管理不提供拖拽、置顶或编辑目标入口。

## 开发环境与生成工程

需要 Node.js 22、Rust iOS 目标、完整 Xcode、XcodeGen、CocoaPods 和 iOS 模拟器运行时。首次生成可运行：

```sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
npm run tauri -- ios init --ci --skip-targets-install --config src-tauri/tauri.ios.conf.json
```

Xcode 工程生成在 `src-tauri/gen/apple/`，该目录被 Git 忽略，可重新生成。若已有旧工程的 `project.yml` 中 `deploymentTarget.iOS` 仍为 `14.0`，请改为 `15.0` 后运行 `xcodegen generate --spec src-tauri/gen/apple/project.yml` 重新生成工程。

## 安装到自己的 iPhone

在 Mac 上双击项目根目录的 `build-ios.command`，或在项目目录运行：

```sh
npm run build:ios
```

也可以运行 `./build-ios.sh`。脚本自动切换到项目目录、通过 nvm 使用 Node.js 22，检查完整 Xcode、真机 SDK、Rust 真机目标与 iOS 工程；缺少前端依赖时执行 `npm ci`。它复用已有工程与签名配置，不重新生成工程、不清理构建产物。首次环境准备仍按上一节执行；真机 Rust 目标为 `aarch64-apple-ios`。

脚本调用 `tauri ios build --target aarch64 --open --export-method debugging`，使用打包后的前端资源，不依赖电脑上的 Vite 服务。打开 Xcode 不代表已完成编译或安装，后续需要：

1. 手机连接 Mac、解锁并信任电脑，开启开发者模式。
2. Xcode → 应用 Target → Signing & Capabilities，勾选 Automatically manage signing，Team 选择自己的 Personal Team。
3. 顶部运行设备选择真实 iPhone，按 `⌘R` 或点击左上角 ▶ 安装。保持脚本终端运行，直到 Xcode 安装结束。
4. 若手机提示“不受信任的开发者”，到“设置 → 通用 → VPN 与设备管理”，选择并信任自己的开发者账号，再打开应用。
5. 安装后拔线、关闭电脑，再从手机桌面打开应用，确认构建版可以独立启动。应用内数据继续通过 WebDAV 下载同步。

免费 Personal Team 的描述文件有效期为 7 天，到期后重新运行脚本并在 Xcode 覆盖安装。不要为了刷新签名删除手机上的应用，以免丢失本地数据。[苹果个人团队说明](https://developer.apple.com/help/account/basics/about-your-developer-account)

只检查环境、不打开 Xcode 时，可运行 `./build-ios.sh --check`；参数说明见 `./build-ios.sh --help`。与 `dev-ios.sh` 的区别是：前者准备真实手机的独立构建版，后者只启动已安装模拟器开发版所需的开发服务。

## 启动已安装的模拟器开发版

在项目目录运行：

```sh
./dev-ios.sh
```

脚本会选择已启动的 iPhone 模拟器（优先 iPhone Duo），没有正在运行的模拟器时会选择唯一可用的 iPhone Duo 或 iPhone 并启动。接着它会启动移动端 Vite 服务并打开已安装的应用。保持终端运行；按 `Ctrl+C` 可停止脚本启动的服务。如果本项目的移动端服务已经运行，脚本会复用它并退出，服务仍由原来的进程管理。

该脚本适用于已安装、指向 `http://127.0.0.1:1432` 的 iOS 开发版；它不构建或安装原生应用。若开发版使用其他本机端口，可用 `STARRAIL_IOS_DEV_PORT=端口号 ./dev-ios.sh` 指定相同端口。多个模拟器无法自动区分时，可通过 `STARRAIL_IOS_SIMULATOR_UDID=设备ID` 指定。前端代码可通过开发服务更新；Rust 或原生代码变更需要重新构建应用。

## 构建模拟器应用

构建时使用 Tauri 命令提供 Xcode 脚本所需的上下文。模拟器构建命令：

```sh
npm run tauri -- ios build --debug --target aarch64-sim --no-sign
```

重复构建时，若 Tauri 提示输出 App 目录非空，可以先移除本次生成的 `src-tauri/gen/apple/build/arm64-sim/星穹铁道工具箱.app` 再重新构建。构建命令会自动为生成的 Info.plist 启用 Tauri 的 iOS 场景生命周期，以兼容 iOS 27。

项目内 `compat/swift-rs` 修复 Xcode 27 的 Swift 目标和产物目录；`compat/tauri-runtime-wry` 避免 iOS 27 模拟器上的 WebKit 版本查询崩溃。升级 Tauri 后应重新检查并移除不再需要的补丁。

## 同步与凭据

电脑端先在“数据同步站”上传本地数据；手机端填写同一 WebDAV 服务器和目录，点击“下载最新数据”。下载会覆盖手机的同步数据；当现有同步机制检测到本地修改冲突时，手机端停止下载。

目前沿用桌面端的同步设置存储实现：密码保存在应用私有数据目录的本地 JSON 配置中，尚未接入 iOS 钥匙串。

## iPhone Duo 适配规范

修改菜单、边距、姿态识别或 WebView 配置前，阅读 [iPhone Duo 适配与开发经验](iPhone-Duo适配与开发经验.md)。该文档包含用户已确认的位置基线、实际模拟器截图、菜单多次被推入正文的原因和回归验收标准。展开横屏菜单需要与时间、Wi-Fi 共用同一侧栏；仅检查“不遮挡”不足以验收，还要确认没有额外占用一列正文空间。
