# Windows 发版与自动更新

项目在推送 `vX.Y.Z` tag 后，会由 GitHub Actions 生成 NSIS Windows 安装包并创建同版本 GitHub Release。Release 同时上传 `latest.json` 和安装包签名，已安装的客户端会在启动时检查它；发现新版后，用户点击“立即更新”即可下载、校验签名并安装。无法自动更新时，仍可从 Release 下载 `.exe` 覆盖安装。

## 首次配置（只做一次）

Tauri 自动更新强制使用签名。请在一台受控电脑上运行根目录的一键初始化脚本；它会无交互生成随机密码、密钥，并在终端打印待填写的 GitHub Secret 内容。妥善备份私钥，**不要提交私钥到仓库**：

```bash
bash setup-release-signing.sh
```

将脚本输出逐项复制到 GitHub 仓库的 `Settings → Secrets and variables → Actions`：

| Secret                               | 内容                               |
| ------------------------------------ | ---------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | 上一步生成的私钥文件完整内容       |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 生成密钥时设置的密码；无密码时留空 |
| `TAURI_UPDATER_PUBLIC_KEY`           | 命令输出的公钥完整内容             |

私钥遗失后，已发布客户端将无法信任后续更新，因此请离线备份。Windows 安装包没有 Authenticode 代码签名时，Windows 仍可能显示“未知发布者”提示；这与 Tauri 更新签名是两套机制。

## 发布

确保工作区干净后运行：

```bash
bash release-desktop.sh 1.0.1
```

脚本会同步 `package.json`、`package-lock.json`、Rust/Tauri 配置、客户端版本展示与 README 徽章，提交当前分支并推送 `v1.0.1` tag。工作流会校验 tag 与 Tauri 版本一致，防止错发版本。

发布后的首次安装请从 GitHub Release 下载 `.exe`。之后的版本，客户端会自动检测并提供“立即更新”；也可以继续下载 Release 中的安装包覆盖安装，用户数据不会因正常升级而清除。
