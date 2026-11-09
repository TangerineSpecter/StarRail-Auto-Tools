import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const plist = fileURLToPath(
  new URL("../src-tauri/gen/apple/starrail-auto-tools_iOS/Info.plist", import.meta.url),
);
if (!existsSync(plist)) throw new Error("请先运行 npm run tauri -- ios init 生成 iOS 工程。");
const buddy = "/usr/libexec/PlistBuddy";
const hasKey = (key) =>
  spawnSync(buddy, ["-c", `Print ${key}`, plist], { stdio: "ignore" }).status === 0;
const run = (command) => execFileSync(buddy, ["-c", command, plist], { stdio: "inherit" });
const manifest = ":UIApplicationSceneManifest";
const supports = `${manifest}:UIApplicationSupportsMultipleScenes`;
if (!hasKey(manifest)) run(`Add ${manifest} dict`);
if (hasKey(supports)) run(`Set ${supports} true`);
else run(`Add ${supports} bool true`);
