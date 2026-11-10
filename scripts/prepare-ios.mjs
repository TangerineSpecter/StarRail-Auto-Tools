import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

// The generated Xcode project starts with Tauri's icon. Rebuild its icon set
// from the same source used by the desktop bundle on every iOS preparation.
const iconSet = fileURLToPath(
  new URL("../src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset/", import.meta.url),
);
const iconSource = fileURLToPath(
  new URL("../public/logo/android-chrome-512x512.png", import.meta.url),
);
const tauriCli = fileURLToPath(new URL("../node_modules/.bin/tauri", import.meta.url));
const temporaryIcons = mkdtempSync(join(tmpdir(), "starrail-ios-icons-"));
try {
  execFileSync(tauriCli, ["icon", iconSource, "--output", temporaryIcons]);
  const manifest = JSON.parse(readFileSync(join(iconSet, "Contents.json"), "utf8"));
  for (const entry of manifest.images) {
    if (entry.filename) {
      copyFileSync(join(temporaryIcons, "ios", entry.filename), join(iconSet, entry.filename));
    }
  }
} finally {
  rmSync(temporaryIcons, { recursive: true, force: true });
}
