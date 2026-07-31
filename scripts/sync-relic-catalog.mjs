#!/usr/bin/env node
/**
 * Creates bundled relic and character catalogues from public Star Rail Station Wiki pages.
 * It deliberately has no third-party dependency so a maintainer can run it with Node 22.
 */
import { access, mkdir, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, extname, join } from "node:path";

const relicSourceUrl = "https://starrailstation.com/cn/relics";
const characterSourceUrl = "https://starrailstation.com/cn/characters";
const root = new URL("..", import.meta.url).pathname;
const relicOutputFile = join(root, "src/data/relic-sets.json");
const characterOutputFile = join(root, "src/data/characters.json");
const imageRoot = join(root, "public/relic-sets");
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

function absoluteUrl(value) {
  if (!value || value.startsWith("data:")) return null;
  return new URL(value.replaceAll("&amp;", "&"), relicSourceUrl).toString();
}

function parseCard(id, fragment) {
  const text = decodeHtml(fragment);
  const kind = text.includes("位面饰品") || Number(id) >= 300 ? "planar" : "cavern";
  const prefix = kind === "planar" ? "位面饰品" : "遗器套装";
  const afterPrefix = text.slice(text.indexOf(prefix) + prefix.length).trim();
  // Do not use String#split here: its limit makes a later `20 %` look like a
  // second "2 件" marker and silently truncates the effect text.
  const effectMatch = afterPrefix.match(/^(.*?)\s+2(?:件)?\s+([\s\S]*)$/);
  const name = effectMatch?.[1]?.trim() ?? "";
  const effects = effectMatch?.[2]?.trim() ?? "";
  // The source renders the set-size marker as a standalone number. Require a
  // following Chinese character so values such as `40 %` in planar effects do
  // not get misidentified as a four-piece section.
  const fourPieceMatch =
    kind === "cavern"
      ? effects.match(/^([\s\S]*?)\s+4(?:件)?\s+(?=[\p{Script=Han}【])([\s\S]*)$/u)
      : null;
  const twoPiece = (fourPieceMatch?.[1] ?? effects).trim();
  const fourPiece = fourPieceMatch?.[2]?.trim() ?? "";
  const imageUrls = [...fragment.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi)]
    .map((match) => absoluteUrl(match[1]))
    .filter(Boolean);
  // The first image is the set icon; the rest are individual relic/ornament pieces.
  return {
    id: Number(id),
    name,
    kind,
    effects: { twoPiece, fourPiece },
    imageUrl: imageUrls[0] ?? null,
    pieceImageUrls: imageUrls.slice(1),
  };
}

function parseCharacter(slug, fragment) {
  const labels = new Set([
    "物理",
    "火",
    "冰",
    "雷",
    "风",
    "量子",
    "虚数",
    "毁灭",
    "巡猎",
    "智识",
    "同谐",
    "虚无",
    "存护",
    "丰饶",
    "记忆",
    "欢愉",
    "New",
    "4⭐",
    "5⭐",
  ]);
  const elementNames = ["物理", "火", "冰", "雷", "风", "量子", "虚数"];
  const pathNames = ["毁灭", "巡猎", "智识", "同谐", "虚无", "存护", "丰饶", "记忆", "欢愉"];
  const parts = decodeHtml(fragment).split(" ").filter(Boolean);
  // The card's visible text only contains the name. Attribute/path labels are
  // exposed through the two icon alt attributes on the source page.
  const iconAlts = [...fragment.matchAll(/<img[^>]+alt=["']([^"']+)["']/gi)].map((match) =>
    decodeHtml(match[1]),
  );
  const element =
    parts.find((part) => elementNames.includes(part)) ??
    iconAlts.find((alt) => elementNames.includes(alt)) ??
    "";
  const path =
    parts.find((part) => pathNames.includes(part)) ??
    iconAlts.find((alt) => pathNames.includes(alt)) ??
    "";
  const imageAlt = fragment.match(/<img[^>]+alt=["']([^"']+)["']/i)?.[1] ?? "";
  const visibleName = parts.filter((part) => !labels.has(part)).join(" ");
  // The list page has changed between server-rendered text cards and image-only
  // cards. Image alt text is the stable fallback for the latter.
  const name = (visibleName || imageAlt).replace(/^New\s*/i, "").trim();
  const backgrounds = [
    ...fragment.matchAll(/(?:background(?:-image)?\s*:\s*)?url\(\s*["']?([^"')\s]+)["']?\s*\)/gi),
  ]
    .map((match) => absoluteUrl(match[1]))
    .filter(Boolean);
  const inlineImages = [
    ...fragment.matchAll(/<(?:img|source)[^>]+(?:src|data-src|srcset)=["']([^"']+)["']/gi),
  ]
    .map((match) => absoluteUrl(match[1].split(" ")[0]))
    .filter(Boolean);
  // The outer CSS background is the 4/5-star card backdrop, while the nested
  // CSS background is the portrait. Keep both so the client can layer them.
  return {
    slug,
    name,
    element,
    path,
    imageUrl: backgrounds.at(-1) ?? inlineImages.at(-1) ?? null,
    backgroundImageUrl: backgrounds.length > 1 ? backgrounds[0] : null,
    elementIconUrl: inlineImages[0] ?? null,
    pathIconUrl: inlineImages[1] ?? null,
  };
}

async function fetchOrThrow(url) {
  // Character cards are client-rendered for some non-browser user agents. Keep
  // the fetch close to a normal Chrome navigation so the same page variant is
  // returned to the synchronizer and to a maintainer's browser.
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
  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, Buffer.from(await image.arrayBuffer()));
}

const html = await (await fetchOrThrow(relicSourceUrl)).text();
const found = new Map();
const pattern =
  /<a\b[^>]*href=["'](?:https?:\/\/starrailstation\.com)?\/cn\/relics\/(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
for (const match of html.matchAll(pattern)) {
  const card = parseCard(match[1], match[2]);
  if (card.name && card.effects.twoPiece) found.set(card.id, card);
}
const sets = [...found.values()].sort((a, b) => a.id - b.id);
if (sets.length < 10) {
  throw new Error(
    `只解析到 ${sets.length} 个套装；页面结构可能已更新。为保护现有图鉴，未写入任何文件。`,
  );
}

await mkdir(imageRoot, { recursive: true });
for (const set of sets) {
  if (!set.imageUrl) continue;
  const extension = extname(new URL(set.imageUrl).pathname) || ".webp";
  const relativePath = `relic-sets/${set.id}${extension}`;
  const localPath = join(root, "public", relativePath);
  await downloadAsset(set.imageUrl, localPath);
  set.image = `/${relativePath}`;
  delete set.imageUrl;
}
for (const set of sets) {
  delete set.imageUrl;
  if (!set.image) set.image = null;
}
for (const set of sets) {
  const slots =
    set.kind === "planar" ? ["PlanarSphere", "LinkRope"] : ["Head", "Hands", "Body", "Feet"];
  const pieces = [];
  for (const [index, url] of set.pieceImageUrls.entries()) {
    const extension = extname(new URL(url).pathname) || ".webp";
    const relativePath = `relic-pieces/${set.id}-${index + 1}${extension}`;
    const localPath = join(root, "public", relativePath);
    await downloadAsset(url, localPath);
    pieces.push({ slot: slots[index] ?? `Unknown-${index + 1}`, image: `/${relativePath}` });
  }
  set.pieces = pieces;
  delete set.pieceImageUrls;
}

const catalogue = {
  schemaVersion: 1,
  source: {
    name: "Star Rail Station Wiki",
    url: relicSourceUrl,
    syncedAt: new Date().toISOString(),
  },
  sets,
};
await writeFile(relicOutputFile, `${JSON.stringify(catalogue, null, 2)}\n`, "utf8");

const characterHtml = await (await fetchOrThrow(characterSourceUrl)).text();
const charactersBySlug = new Map();
const characterAnchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
for (const match of characterHtml.matchAll(characterAnchorPattern)) {
  const href = match[1].match(
    /\bhref=["'](?:https?:\/\/starrailstation\.com)?\/cn\/characters?\/([^"'/?#]+)(?:\/)?(?:[?#][^"']*)?["']/i,
  );
  if (!href) continue;
  const accessibleName = match[1].match(/\b(?:aria-label|title)=["']([^"']+)["']/i)?.[1] ?? "";
  const character = parseCharacter(href[1], `${accessibleName} ${match[2]}`);
  if (character.name) charactersBySlug.set(character.slug, character);
}
const characters = [...charactersBySlug.values()].sort((a, b) =>
  a.name.localeCompare(b.name, "zh-CN"),
);
if (characters.length < 50) {
  const linkCount = [...characterHtml.matchAll(/\/cn\/characters?\//gi)].length;
  throw new Error(
    `角色数据页未返回可用的角色卡片（发现 ${linkCount} 个角色链接，解析到 ${characters.length} 名角色）。请稍后重试；现有角色图鉴不会被覆盖。`,
  );
}
for (const character of characters) {
  if (!character.imageUrl) continue;
  const extension = extname(new URL(character.imageUrl).pathname) || ".webp";
  const relativePath = `characters/${character.slug}${extension}`;
  const localPath = join(root, "public", relativePath);
  await downloadAsset(character.imageUrl, localPath);
  character.image = `/${relativePath}`;
  delete character.imageUrl;
}
for (const character of characters) {
  if (!character.backgroundImageUrl) continue;
  const extension = extname(new URL(character.backgroundImageUrl).pathname) || ".webp";
  const relativePath = `character-backgrounds/${character.slug}${extension}`;
  const localPath = join(root, "public", relativePath);
  await downloadAsset(character.backgroundImageUrl, localPath);
  character.backgroundImage = `/${relativePath}`;
}
for (const character of characters) {
  delete character.imageUrl;
  if (!character.image) character.image = null;
}
const iconSpecs = [
  ["element", "elementIconUrl", "elementIcon"],
  ["path", "pathIconUrl", "pathIcon"],
];
for (const [kind, sourceKey, targetKey] of iconSpecs) {
  const icons = new Map();
  for (const character of characters) {
    const name = kind === "element" ? character.element : character.path;
    if (name && character[sourceKey] && !icons.has(name)) icons.set(name, character[sourceKey]);
  }
  for (const [name, url] of icons) {
    const extension = extname(new URL(url).pathname) || ".webp";
    const relativePath = `character-icons/${kind}s/${name}${extension}`;
    const localPath = join(root, "public", relativePath);
    await downloadAsset(url, localPath);
    for (const character of characters)
      if ((kind === "element" ? character.element : character.path) === name)
        character[targetKey] = `/${relativePath}`;
  }
}
for (const character of characters) {
  delete character.elementIconUrl;
  delete character.pathIconUrl;
  delete character.backgroundImageUrl;
}
const characterCatalogue = {
  schemaVersion: 1,
  source: {
    name: "Star Rail Station Wiki",
    url: characterSourceUrl,
    syncedAt: new Date().toISOString(),
  },
  characters,
};
await writeFile(characterOutputFile, `${JSON.stringify(characterCatalogue, null, 2)}\n`, "utf8");
console.log(
  `已更新 ${sets.length} 个套装和 ${characters.length} 名角色${skipImages ? "（已跳过图片）" : "及图片"}。`,
);
