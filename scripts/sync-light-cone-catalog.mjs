#!/usr/bin/env node
/**
 * Creates the bundled light-cone catalogue from the public Star Rail Station Wiki.
 * It deliberately has no third-party dependency so a maintainer can run it with Node 22.
 */
import { access, mkdir, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";

const sourceUrl = "https://starrailstation.com/cn/equipment";
const cdnBase = "https://cdn.starrailstation.com/assets/";
const root = new URL("..", import.meta.url).pathname;
const outputFile = join(root, "src/data/light-cones.json");
const imageRoot = join(root, "public/light-cones");
const skipImages = process.argv.includes("--skip-images");
const refreshImages = process.argv.includes("--refresh-images");

function decodeHtml(value) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchOrThrow(url) {
  const response = await fetch(url, {
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    },
  });
  if (!response.ok) throw new Error(`请求失败：${response.status} ${response.statusText} (${url})`);
  return response;
}

async function downloadAsset(url, localPath) {
  if (skipImages) return;
  if (!refreshImages) {
    try {
      await access(localPath, fsConstants.F_OK);
      return;
    } catch {
      // File does not exist yet; download it below.
    }
  }
  const image = await fetchOrThrow(url);
  await mkdir(join(localPath, ".."), { recursive: true });
  await writeFile(localPath, Buffer.from(await image.arrayBuffer()));
}

function parsePageConfig(html) {
  // The equipment page embeds all light-cone data in a window.PAGE_CONFIG
  // JavaScript assignment within an inline <script> tag. The JSON is very
  // large, so we locate the opening brace and use brace-depth counting to
  // find the matching close instead of a single regex.
  const marker = "PAGE_CONFIG=";
  const start = html.indexOf(marker);
  if (start < 0) {
    throw new Error("无法从页面中找到 PAGE_CONFIG 标记；页面结构可能已更新。");
  }
  const afterMarker = html.substring(start + marker.length);
  let depth = 0;
  let end = -1;
  for (let i = 0; i < afterMarker.length; i++) {
    if (afterMarker[i] === "{") depth++;
    else if (afterMarker[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) {
    throw new Error("PAGE_CONFIG JSON 未正确闭合；页面结构可能已更新。");
  }
  try {
    return JSON.parse(afterMarker.substring(0, end));
  } catch {
    throw new Error("PAGE_CONFIG JSON 解析失败；页面结构可能已更新。");
  }
}

function level80BaseStats(levelData) {
  const level80 = levelData?.find((entry) => entry.maxLevel === 80);
  if (!level80) throw new Error("未找到 80 级光锥成长数据。");

  const statAtLevel80 = (baseKey, growthKey) => {
    const base = level80[baseKey];
    const growth = level80[growthKey] ?? 0;
    if (!Number.isFinite(base) || !Number.isFinite(growth)) {
      throw new Error(`80 级属性字段无效：${baseKey}/${growthKey}`);
    }
    return Math.floor(base + growth * 79);
  };

  return {
    hp: statAtLevel80("hpBase", "hpAdd"),
    attack: statAtLevel80("attackBase", "attackAdd"),
    defense: statAtLevel80("defenseBase", "defenseAdd"),
  };
}

async function forEachConcurrent(entries, worker, concurrency = 8) {
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
      while (nextIndex < entries.length) {
        const index = nextIndex;
        nextIndex += 1;
        await worker(entries[index]);
      }
    }),
  );
}

const html = await (await fetchOrThrow(sourceUrl)).text();
const config = parsePageConfig(html);
const entries = config.entries ?? [];

if (entries.length < 10) {
  throw new Error(
    `只解析到 ${entries.length} 个光锥；页面结构可能已更新。为保护现有图鉴，未写入任何文件。`,
  );
}

const lightCones = entries
  .map((entry) => ({
    id: Number(entry.pageId),
    name: decodeHtml(entry.name),
    rarity: entry.rarity,
    path: entry.baseType?.name ?? "",
    iconHash: entry.iconPath ?? null,
  }))
  .filter((lc) => lc.name && lc.id)
  .sort((a, b) => a.id - b.id);

await forEachConcurrent(lightCones, async (lightCone) => {
  try {
    const detailUrl = new URL(`/cn/lightcone/${lightCone.id}`, sourceUrl).toString();
    const detailConfig = parsePageConfig(await (await fetchOrThrow(detailUrl)).text());
    lightCone.baseStats = level80BaseStats(detailConfig.levelData);
  } catch (error) {
    throw new Error(`无法同步光锥「${lightCone.name}」的 80 级基础属性：${error.message}`);
  }
});

await mkdir(imageRoot, { recursive: true });

for (const lc of lightCones) {
  if (!lc.iconHash) {
    lc.image = null;
    continue;
  }
  const cdnUrl = `${cdnBase}${lc.iconHash}.webp`;
  const relativePath = `light-cones/${lc.id}.webp`;
  const localPath = join(root, "public", relativePath);
  await downloadAsset(cdnUrl, localPath);
  lc.image = `/${relativePath}`;
}

// Remove intermediate hash fields before writing
for (const lc of lightCones) {
  delete lc.iconHash;
  if (!lc.image) lc.image = null;
}

const catalogue = {
  schemaVersion: 1,
  source: {
    name: "Star Rail Station Wiki",
    url: sourceUrl,
    syncedAt: new Date().toISOString(),
  },
  lightCones,
};

await writeFile(outputFile, `${JSON.stringify(catalogue, null, 2)}\n`, "utf8");
console.log(`已更新 ${lightCones.length} 个光锥${skipImages ? "（已跳过图片）" : "及图片"}。`);
