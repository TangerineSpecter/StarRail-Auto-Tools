import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [version] = process.argv.slice(2);

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version ?? "")) {
  throw new Error("版本号必须是 SemVer，例如 1.0.0。");
}

const root = resolve(import.meta.dirname, "..");

async function updateJson(relativePath, transform) {
  const path = resolve(root, relativePath);
  const json = JSON.parse(await readFile(path, "utf8"));
  transform(json);
  await writeFile(path, `${JSON.stringify(json, null, 2)}\n`);
}

await updateJson("package.json", (json) => {
  json.version = version;
});
await updateJson("package-lock.json", (json) => {
  json.version = version;
  json.packages[""].version = version;
});

const replacements = [
  ["src-tauri/Cargo.toml", /^(version = ")[^"]+("$)/m],
  ["src-tauri/Cargo.lock", /(name = "starrail-auto-tools"\nversion = ")[^"]+(")/],
  ["src-tauri/tauri.conf.json", /("version": ")[^"]+(")/],
  ["src/shared/app-info.ts", /(APP_VERSION = ")[^"]+(")/],
  ["README.md", /(version-)[0-9A-Za-z.+-]+(-4f7fc4)/],
];

for (const [relativePath, pattern] of replacements) {
  const path = resolve(root, relativePath);
  const text = await readFile(path, "utf8");
  const updated = text.replace(pattern, `$1${version}$2`);
  if (updated === text) throw new Error(`未能在 ${relativePath} 更新版本号。`);
  await writeFile(path, updated);
}
