# iOS 个人查看版

移动端使用只读界面，支持查询角色、遗器、光锥、配队和毕业方案，通过 WebDAV 下载电脑端上传的快照。移动端没有上传或背包编辑入口。电脑端和手机端共用同步快照格式和库存数据库逻辑；同步出现本地冲突时停止，不自动覆盖。

已在 iOS 27 的 iPhone 模拟器中构建、启动并验证空数据界面和本地数据库初始化。真实 WebDAV 同步、真实数据展示和 iPhone 真机仍需验证。

## 开发环境与生成工程

需要 Node.js 22、Rust iOS 目标、完整 Xcode、XcodeGen、CocoaPods 和 iOS 模拟器运行时。首次生成可运行：

```sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
npm run tauri -- ios init --ci --skip-targets-install --config src-tauri/tauri.ios.conf.json
```

Xcode 工程生成在 `src-tauri/gen/apple/`，该目录被 Git 忽略，可重新生成。若已有旧工程的 `project.yml` 中 `deploymentTarget.iOS` 仍为 `14.0`，请改为 `15.0` 后运行 `xcodegen generate --spec src-tauri/gen/apple/project.yml` 重新生成工程。

构建时使用 Tauri 命令提供 Xcode 脚本所需的上下文。模拟器构建命令：

```sh
npm run tauri -- ios build --debug --target aarch64-sim --no-sign
```

重复构建时，若 Tauri 提示输出 App 目录非空，可以先移除本次生成的 `src-tauri/gen/apple/build/arm64-sim/星穹铁道工具箱.app` 再重新构建。构建命令会自动为生成的 Info.plist 启用 Tauri 的 iOS 场景生命周期，以兼容 iOS 27。

项目内 `compat/swift-rs` 修复 Xcode 27 的 Swift 目标和产物目录；`compat/tauri-runtime-wry` 避免 iOS 27 模拟器上的 WebKit 版本查询崩溃。升级 Tauri 后应重新检查并移除不再需要的补丁。

## 同步与凭据

电脑端先在“数据同步站”上传本地数据；手机端填写同一 WebDAV 服务器和目录，点击“下载最新数据”。下载会覆盖手机的同步数据；当现有同步机制检测到本地修改冲突时，手机端停止下载。

目前沿用桌面端的同步设置存储实现：密码保存在应用私有数据目录的本地 JSON 配置中，尚未接入 iOS 钥匙串。
