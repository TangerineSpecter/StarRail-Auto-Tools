import { createHash } from "node:crypto";

/** Parse JSON only: never evaluate untrusted inline JavaScript. */
export function parsePageConfig(html) {
  const marker = /window\.PAGE_CONFIG\s*=\s*/g.exec(html);
  if (!marker) throw new Error("Missing window.PAGE_CONFIG");
  const start = marker.index + marker[0].length;
  if (html[start] !== "{") throw new Error("PAGE_CONFIG must be an object");
  let depth = 0,
    quoted = false,
    escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(html.slice(start, i + 1));
  }
  throw new Error("Unclosed PAGE_CONFIG");
}

export function stripHtml(value = "") {
  const entities = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
  return String(value)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, key) => {
      if (!key.startsWith("#")) return entities[key.toLowerCase()] ?? all;
      const code = key[1].toLowerCase() === "x" ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : "";
    })
    .replace(/[\t \u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

export function normalizeDescription(value) {
  const description = stripHtml(value).replace(
    /#(\d+)\[(i|f1|f2)\](%?)/g,
    (_, index, format, percent) =>
      `{p${index}:${percent ? (format === "i" ? "percentInteger" : format === "f1" ? "percentFixed1" : "percentFixed2") : format === "f1" ? "fixed1" : format === "f2" ? "fixed2" : "integer"}}`,
  );
  if (/#\d+\[/.test(description))
    throw new Error(`Unsupported description parameter format: ${description}`);
  return description;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  return value;
}

export function semanticHash(ability) {
  const semantic = {
    id: ability.id,
    ownerId: ability.ownerId,
    sourceNodeId: ability.sourceNodeId,
    descriptionTemplate: ability.descriptionTemplate,
    parameters: ability.parameters,
    levels: ability.levels,
    levelBinding: ability.levelBinding,
    sourceKind: ability.sourceKind,
    type: ability.type,
    tag: ability.tag,
    groupId: ability.groupId,
    slot: ability.slot,
  };
  return createHash("sha256")
    .update(JSON.stringify(stable(semantic)))
    .digest("hex");
}

export function normalizeParams(skill) {
  const table = skill.levelData;
  const source = table ?? skill.params ?? [];
  const levels = table
    ? table.map((row) => ({ level: row.level, values: row.params ?? [] }))
    : [{ level: 1, values: skill.params ?? [] }];
  if (!Array.isArray(levels) || !levels.length) throw new Error("Empty parameter table");
  const seen = new Set();
  for (const row of levels) {
    if (
      !Number.isInteger(row.level) ||
      row.level < 1 ||
      seen.has(row.level) ||
      !Array.isArray(row.values) ||
      row.values.some((value) => !Number.isFinite(value))
    )
      throw new Error("Invalid parameter level");
    seen.add(row.level);
  }
  const width = levels[0].values.length;
  if (levels.some((row) => row.values.length !== width))
    throw new Error("Inconsistent parameter width");
  const parameters = Object.fromEntries(
    Array.from({ length: width }, (_, index) => [
      `p${index + 1}`,
      table && levels.some((row) => row.values[index] !== levels[0].values[index])
        ? {
            kind: "table",
            levels: levels.map((row) => row.level),
            values: levels.map((row) => row.values[index]),
          }
        : { kind: "constant", value: levels[0].values[index] },
    ]),
  );
  return { source, levels: levels.map((row) => row.level), parameters };
}

export function adaptOwner(kind, entry, config, url) {
  const gameId = String(entry.id ?? entry.rankKey ?? config.id ?? "");
  if (!/^\d+$/.test(gameId))
    throw new Error(`Missing game identity: ${kind}/${entry.pageId ?? entry.slug}`);
  const owner = {
    id: `${kind}:${gameId}`,
    sourceKind: kind === "lightcone" ? "lightCone" : kind,
    gameId,
    slug: entry.pageId ?? entry.slug ?? gameId,
    name: stripHtml(entry.name ?? config.name),
    source: { url, mapping: { slug: entry.pageId ?? entry.slug ?? gameId, gameId } },
    abilityIds: [],
  };
  const owners = [owner];
  const paths = {
    1: "destruction",
    2: "hunt",
    3: "erudition",
    4: "harmony",
    5: "nihility",
    6: "preservation",
    7: "abundance",
    8: "remembrance",
    9: "elation",
  };
  if (kind === "character") {
    const path = paths[entry.baseTypeId];
    if (!path) throw new Error(`Unknown canonical path ${owner.id}`);
    owner.variantKey = `hsr/${gameId}/${path}/base`;
  }
  const summon = config.servant
    ? {
        ...owner,
        id: `summon:${gameId}:servant`,
        sourceKind: "summon",
        gameId: `${gameId}:servant`,
        slug: `${owner.slug}/servant`,
        name: stripHtml(config.servant.name),
        parentOwnerId: owner.id,
        abilityIds: [],
      }
    : null;
  if (summon) owners.push(summon);
  if (summon) summon.source = { url, mapping: { slug: summon.slug, gameId: summon.gameId } };
  const abilities = new Map();
  const add = (skill, group, fallbackId, grouping = null) => {
    if (!skill || typeof skill !== "object") throw new Error(`Invalid skill ${owner.id}/${group}`);
    if (skill.statusList?.length && !skill.descHash && !skill.skillDesc && !skill.desc) {
      skill = {
        ...skill,
        params: skill.statusList.map((status) => status.value),
        desc: skill.statusList
          .map((status, index) => `${stripHtml(status.key)} {p${index + 1}:number}`)
          .join("\n"),
      };
    }
    const raw = skill.descHash ?? skill.skillDesc ?? skill.desc ?? "";
    const description = normalizeDescription(raw);
    const params = normalizeParams(skill);
    for (const token of description.matchAll(/\{p(\d+):/g)) {
      if (!("p" + token[1] in params.parameters))
        throw new Error(`Unbound parameter ${owner.id}/${group}`);
    }
    const sourceId = String(fallbackId ?? skill.id);
    if (!sourceId || sourceId === "undefined")
      throw new Error(`Missing source node identity ${owner.id}/${group}`);
    const target = group.startsWith("servant-") ? summon : owner;
    const sourceKind = group.startsWith("servant-")
      ? "summon"
      : group === "traces"
        ? "trace"
        : group === "ranks"
          ? "eidolon"
          : owner.sourceKind;
    const type = stripHtml(skill.typeDescHash ?? skill.typeDesc ?? skill.type ?? "");
    const slots = {
      普攻: "basic",
      普通攻击: "basic",
      战技: "skill",
      终结技: "ult",
      天赋: "talent",
      秘技: "technique",
      欢愉技: "elation",
      忆灵技: "skill",
      忆灵天赋: "talent",
    };
    const slot =
      sourceKind === "lightCone"
        ? "passive"
        : sourceKind === "relic"
          ? Number(skill.useNum ?? fallbackId) === 2
            ? "twoPiece"
            : Number(skill.useNum ?? fallbackId) === 4
              ? "fourPiece"
              : "other"
          : group === "traces"
            ? "trace"
            : group === "ranks"
              ? "eidolon"
              : (slots[type] ?? "other");
    const groupIndex = grouping?.findIndex?.((ids) => ids.includes(skill.id));
    const ability = {
      id: `${target.id}:${group}:${sourceId}`,
      ownerId: target.id,
      sourceNodeId: sourceId,
      sourceKind,
      groupId: groupIndex >= 0 ? `${group}:${groupIndex}` : group,
      slot,
      name: stripHtml(skill.name ?? skill.skillName ?? ""),
      type,
      tag: skill.tagHash ?? skill.tag ?? null,
      icon: skill.icon ?? skill.iconPath ?? null,
      descriptionTemplate: description,
      parameters: params.parameters,
      levels: params.levels,
      levelBinding:
        sourceKind === "lightCone"
          ? "superimposition"
          : params.levels.length > 1 && slot !== "other"
            ? sourceKind === "summon"
              ? `memosprite:${slot}`
              : slot
            : null,
    };
    ability.sourceHash = semanticHash(ability);
    const previous = abilities.get(ability.id);
    if (previous && previous.sourceHash !== ability.sourceHash)
      throw new Error(`Conflicting ability ${ability.id}`);
    abilities.set(ability.id, ability);
  };
  const list = (value) =>
    Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];
  const tree = (nodes, group) => {
    for (const node of list(nodes)) {
      if (node.embedBuff) add(node.embedBuff.skill ?? node.embedBuff, group, node.id);
      for (const key of ["embedBonusSkill", "embedSkill", "embedServantSkill"])
        if (node[key]) add(node[key], group, node.id);
      if (node.skill) add(node.skill, group, node.id);
      tree(node.children, group);
    }
  };
  if (kind === "character") {
    for (const skill of list(config.skills))
      add(skill, "skills", skill.id, config.skillGrouping ?? null);
    for (const rank of list(config.ranks)) add(rank, "ranks", rank.id);
    tree(config.skillTreePoints, "traces");
    for (const skill of list(config.servant?.skills))
      add(skill, "servant-skills", skill.id, config.servant.skillGrouping ?? null);
    tree(config.servant?.skillTreePoints, "servant-traces");
  } else if (kind === "lightcone") add(config.skill, "skill", entry.id);
  else {
    for (const [key, skill] of Object.entries(config.setSkills ?? config.skills ?? {}))
      add(skill, "set", skill.useNum ?? key);
  }
  if (!abilities.size) throw new Error(`No public mechanics for ${owner.id}`);
  for (const item of owners)
    item.abilityIds = [...abilities.values()]
      .filter((ability) => ability.ownerId === item.id)
      .map((ability) => ability.id)
      .sort();
  return { owner, owners, abilities: [...abilities.values()] };
}

export async function fetchPageConfig(url, fetcher = fetch) {
  let failure;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(60000),
        headers: { "user-agent": "Mozilla/5.0", accept: "text/html" },
      });
      if (!response.ok)
        throw Object.assign(new Error(`HTTP ${response.status} ${url}`), {
          status: response.status,
        });
      return parsePageConfig(await response.text());
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

/** Raw validity is independent of manual-rule review coverage. */
export function validateMechanicCatalogue(data) {
  if (data.schemaVersion !== 1 || !Array.isArray(data.owners) || !Array.isArray(data.abilities))
    throw new Error("Invalid mechanic schema");
  const owners = new Map(data.owners.map((owner) => [owner.id, owner]));
  const abilities = new Map(data.abilities.map((ability) => [ability.id, ability]));
  if (owners.size !== data.owners.length || abilities.size !== data.abilities.length)
    throw new Error("Duplicate mechanic identity");
  const kinds = new Set(["character", "trace", "eidolon", "summon", "lightCone", "relic"]);
  for (const owner of data.owners) {
    if (
      !owner.id ||
      !kinds.has(owner.sourceKind) ||
      !owner.slug ||
      !owner.source?.mapping?.gameId ||
      owner.source.mapping.slug !== owner.slug ||
      String(owner.source.mapping.gameId) !== String(owner.gameId)
    )
      throw new Error(`Invalid owner mapping ${owner.id}`);
    if (owner.parentOwnerId && !owners.has(owner.parentOwnerId))
      throw new Error(`Invalid parent ${owner.id}`);
    if (
      new Set(owner.abilityIds).size !== owner.abilityIds.length ||
      owner.abilityIds.some((id) => abilities.get(id)?.ownerId !== owner.id)
    )
      throw new Error(`Invalid owner abilities ${owner.id}`);
  }
  for (const ability of data.abilities) {
    if (
      !owners.get(ability.ownerId)?.abilityIds.includes(ability.id) ||
      !kinds.has(ability.sourceKind) ||
      !ability.sourceNodeId ||
      !ability.groupId ||
      !ability.slot ||
      typeof ability.descriptionTemplate !== "string" ||
      !(ability.levelBinding === null || typeof ability.levelBinding === "string")
    )
      throw new Error(`Invalid ability ${ability.id}`);
    if (
      !Array.isArray(ability.levels) ||
      !ability.levels.length ||
      new Set(ability.levels).size !== ability.levels.length ||
      ability.levels.some((level) => !Number.isInteger(level) || level < 1)
    )
      throw new Error(`Invalid ability levels ${ability.id}`);
    for (const [key, curve] of Object.entries(ability.parameters)) {
      if (!/^p[1-9]\d*$/.test(key)) throw new Error(`Invalid parameter key ${ability.id}`);
      if (curve.kind === "constant") {
        if (!Number.isFinite(curve.value)) throw new Error(`Invalid constant ${ability.id}`);
      } else if (
        curve.kind !== "table" ||
        !Array.isArray(curve.levels) ||
        !Array.isArray(curve.values) ||
        curve.levels.length !== ability.levels.length ||
        curve.values.length !== curve.levels.length ||
        curve.levels.some((level, index) => level !== ability.levels[index]) ||
        curve.values.some((value) => !Number.isFinite(value))
      )
        throw new Error(`Invalid curve ${ability.id}`);
    }
    for (const token of ability.descriptionTemplate.matchAll(
      /\{(p\d+):(percent|percentInteger|percentFixed1|percentFixed2|integer|number|fixed1|fixed2)\}/g,
    ))
      if (!Object.hasOwn(ability.parameters, token[1]))
        throw new Error(`Unbound template ${ability.id}`);
    if (ability.sourceHash !== semanticHash(ability))
      throw new Error(`Invalid source hash ${ability.id}`);
  }
  return { valid: true, owners: owners.size, abilities: abilities.size };
}
