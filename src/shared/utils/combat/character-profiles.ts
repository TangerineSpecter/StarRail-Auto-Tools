import { mechanicCatalogue } from "@/shared/catalogue/mechanics";
import type { CatalogueAbility, CatalogueOwner } from "@/shared/contracts/catalogue-rules";
import { resolveAbility } from "@/shared/utils/catalogue-rules";
import type {
  AbilityKind,
  CombatantInput,
  CombatElement,
  ModelingDepth,
  TargetPattern,
} from "./types";

export interface SkillAttackSpec {
  id: string;
  name: string;
  abilityKind: AbilityKind;
  element: CombatElement;
  pattern: TargetPattern;
  scalingStat: "atk" | "hp" | "def";
  mainScaling: number;
  adjacentScaling: number;
  /** Extra scaling added per 1.0 of Break Effect (e.g. Firefly enhanced E: 0.2 * BE, capped at 3.6). */
  beToAtkMain?: { coefficient: number; cap: number };
  beToAtkAdjacent?: { coefficient: number; cap: number };
  /** Number of bounce hits (for pattern === "bounce"). */
  bounceHits?: number;
  /** True when total multiplier is split equally across all alive targets (e.g. Dahlia Ult). */
  splitAcrossTargets?: boolean;
  toughnessMain: number;
  toughnessAdjacent: number;
  toughnessSubsequent?: number;
  energyGain: number;
  spDelta: number;
  /** Optional flat damage-only / special flags. */
  ignoreWeaknessRatio?: number;
  ignoreWeaknessFull?: boolean;
  selfAdvance?: number;
  extraDefPen?: number;
  isBuffOnly?: boolean;
  isDotApplier?: { chance: number; atkScaling: number; turns: number };
}

export interface CharacterCombatProfile {
  characterId: number;
  variantKey: string;
  name: string;
  element: CombatElement;
  role: "dps" | "subdps" | "support" | "sustain";
  modelingDepth: ModelingDepth;
  modelingBadge: string;
  modelingSummary: string;
  maxEnergy: number;
  usesSpecialUltResource: boolean;
  basic: SkillAttackSpec;
  skill: SkillAttackSpec;
  ult: SkillAttackSpec;
  enhancedBasic?: SkillAttackSpec;
  enhancedSkill?: SkillAttackSpec;
  fua?: SkillAttackSpec;
  /** Optional active mechanism tags shown in UI. */
  mechanismNotes: string[];
  /** Explicit unmodeled caveats shown in UI. */
  unmodeledNotes: string[];
}

const ownerByGameId = new Map<string, CatalogueOwner>();
const abilitiesByOwnerId = new Map<string, CatalogueAbility[]>();

for (const owner of mechanicCatalogue.owners ?? []) {
  if (owner.sourceKind === "character") {
    ownerByGameId.set(String(owner.gameId), owner);
  }
}
for (const ability of mechanicCatalogue.abilities) {
  const list = abilitiesByOwnerId.get(ability.ownerId) ?? [];
  list.push(ability);
  abilitiesByOwnerId.set(ability.ownerId, list);
}

export function getCharacterMaxEnergy(characterId: number): number {
  const owner = ownerByGameId.get(String(characterId));
  if (owner && typeof owner.maxEnergy === "number" && owner.maxEnergy > 0) {
    return owner.maxEnergy;
  }
  return 120;
}

function effectiveSkillLevel(
  ability: CatalogueAbility,
  skills: CombatantInput["skills"],
  eidolon: number,
  slotOverride?: "basic" | "skill" | "ult" | "talent",
): number {
  const slot = slotOverride ?? (ability.slot as "basic" | "skill" | "ult" | "talent");
  const raw =
    slot === "basic"
      ? skills.basic || 6
      : slot === "skill"
        ? skills.skill || 10
        : slot === "ult"
          ? skills.ult || 10
          : skills.talent || 10;
  // Most characters gain +2/+1 on E3 & E5; if user inventory already stores boosted level or base level,
  // clamp safely to the ability's valid level table.
  let boosted = raw;
  if (eidolon >= 3 && raw <= (slot === "basic" ? 6 : 10)) {
    if (slot === "skill" || slot === "ult") boosted = raw + 2;
    else if (slot === "basic") boosted = raw + 1;
  }
  const levels = ability.levels;
  if (!levels.length) return 1;
  const maxLv = levels[levels.length - 1] ?? 1;
  const minLv = levels[0] ?? 1;
  const clamped = Math.min(maxLv, Math.max(minLv, boosted));
  return levels.includes(clamped) ? clamped : maxLv;
}

function paramValue(ability: CatalogueAbility | undefined, key: string, level: number): number {
  if (!ability) return 0;
  const resolved = resolveAbility(ability, level);
  const v = resolved.parameters[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function parsePatternFromTag(tag: string | null | undefined, desc: string): TargetPattern {
  const t = (tag ?? "").trim();
  if (t.includes("扩散")) return "blast";
  if (t.includes("群攻")) return "aoe";
  if (t.includes("弹射")) return "bounce";
  if (t.includes("单攻")) return "single";
  if (t.includes("辅助") || t.includes("回复") || t.includes("防御") || t.includes("强化")) {
    if (/造成.*伤害/.test(desc)) {
      if (/敌方全体/.test(desc)) return "aoe";
      if (/相邻目标/.test(desc)) return "blast";
      return "single";
    }
    return "team";
  }
  if (/敌方全体/.test(desc)) return "aoe";
  if (/相邻目标/.test(desc)) return "blast";
  if (/随机敌方单体/.test(desc)) return "bounce";
  if (/造成.*伤害/.test(desc)) return "single";
  return "self";
}

function parseGenericSkill(
  ability: CatalogueAbility | undefined,
  build: CombatantInput,
  fallbackKind: AbilityKind,
  fallbackName: string,
  defaultSpDelta: number,
  defaultEnergy: number,
): SkillAttackSpec {
  if (!ability) {
    return {
      id: `${build.characterId}:${fallbackKind}:fallback`,
      name: fallbackName,
      abilityKind: fallbackKind,
      element: build.element,
      pattern: fallbackKind === "basic" ? "single" : "team",
      scalingStat: "atk",
      mainScaling: fallbackKind === "basic" ? 1.0 : 0,
      adjacentScaling: 0,
      toughnessMain: fallbackKind === "basic" ? 10 : 0,
      toughnessAdjacent: 0,
      energyGain: defaultEnergy,
      spDelta: defaultSpDelta,
      isBuffOnly: fallbackKind !== "basic",
    };
  }

  const slotKey =
    fallbackKind === "basic" || fallbackKind === "skill" || fallbackKind === "ult"
      ? fallbackKind
      : "talent";
  const level = effectiveSkillLevel(ability, build.skills, build.eidolon, slotKey);
  const resolved = resolveAbility(ability, level);
  const desc = resolved.description;
  const template = ability.descriptionTemplate;
  const pattern = parsePatternFromTag(ability.tag, desc);

  // Extract primary & secondary damage multiplier from description template.
  const dmgRegex =
    /(?:造成[^。；\n]*?(\{p\d+:\w+\})[^。；\n]*?(攻击力|生命上限|防御力))|(?:(攻击力|生命上限|防御力)[^。；\n]{0,8}(\{p\d+:\w+\})[^。；\n]*?伤害)/g;
  const matches: Array<{ paramKey: string; stat: "atk" | "hp" | "def"; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = dmgRegex.exec(template)) !== null) {
    const token = m[1] ?? m[4] ?? "";
    const statCn = m[2] ?? m[3] ?? "攻击力";
    const keyMatch = /\{(p\d+):/.exec(token);
    if (!keyMatch) continue;
    const stat: "atk" | "hp" | "def" = statCn.includes("生命")
      ? "hp"
      : statCn.includes("防御")
        ? "def"
        : "atk";
    matches.push({ paramKey: keyMatch[1]!, stat, index: m.index });
  }

  let scalingStat: "atk" | "hp" | "def" = matches[0]?.stat ?? "atk";
  let mainScaling = matches[0] ? paramValue(ability, matches[0].paramKey, level) : 0;
  let adjacentScaling = 0;

  if (pattern === "blast" && matches.length >= 2) {
    adjacentScaling = paramValue(ability, matches[1]!.paramKey, level);
  } else if (pattern === "blast" && mainScaling > 0) {
    adjacentScaling = mainScaling * 0.5;
  }

  // Fallback for templates where scaling precedes "的XX属性伤害" in another wording.
  if (mainScaling === 0 && /造成.*伤害/.test(desc)) {
    const simple = /(\{p\d+:percent\w*\})/.exec(template);
    if (simple) {
      const k = /\{(p\d+):/.exec(simple[1]!)?.[1];
      if (k) {
        const val = paramValue(ability, k, level);
        if (val > 0 && val <= 15) {
          mainScaling = val;
          if (template.includes("生命上限")) scalingStat = "hp";
          else if (template.includes("防御力")) scalingStat = "def";
        }
      }
    }
  }

  let bounceHits: number | undefined;
  if (pattern === "bounce") {
    const extraMatch = /额外造成\s*(\d+)\s*次/.exec(desc);
    const totalMatch = /共造成\s*(\d+)\s*次|造成\s*(\d+)\s*次/.exec(desc);
    if (extraMatch) bounceHits = 1 + Number(extraMatch[1]);
    else if (totalMatch) bounceHits = Number(totalMatch[1] ?? totalMatch[2]);
    else bounceHits = 5;
  }

  const toughness = ability.combat?.toughness;
  const toughnessMain =
    toughness?.main ??
    (mainScaling > 0 ? (fallbackKind === "basic" ? 10 : fallbackKind === "ult" ? 20 : 15) : 0);
  const toughnessAdjacent =
    toughness?.adjacent ??
    (pattern === "blast" ? toughnessMain * 0.5 : pattern === "aoe" ? toughnessMain : 0);
  const toughnessSubsequent = toughness?.subsequent;

  const energyGain =
    ability.combat?.energyGain !== undefined ? ability.combat.energyGain : defaultEnergy;

  return {
    id: ability.id,
    name: ability.name || fallbackName,
    abilityKind: fallbackKind,
    element: build.element,
    pattern,
    scalingStat,
    mainScaling,
    adjacentScaling,
    ...(bounceHits ? { bounceHits } : {}),
    toughnessMain,
    toughnessAdjacent,
    ...(toughnessSubsequent !== undefined ? { toughnessSubsequent } : {}),
    energyGain,
    spDelta: defaultSpDelta,
    isBuffOnly: mainScaling <= 0 && toughnessMain <= 0,
  };
}

function inferRole(
  path: string,
  skill: SkillAttackSpec,
  ult: SkillAttackSpec,
): CharacterCombatProfile["role"] {
  const p = path.toLowerCase();
  if (
    p.includes("丰饶") ||
    p.includes("abundance") ||
    p.includes("存护") ||
    p.includes("preservation")
  ) {
    return "sustain";
  }
  if (p.includes("同谐") || p.includes("harmony")) return "support";
  if (p.includes("虚无") || p.includes("nihility")) {
    return skill.isBuffOnly && ult.isBuffOnly ? "support" : "subdps";
  }
  return "dps";
}

export const DEEP_MODELED_CHARACTER_IDS = new Set<number>([
  1310, // 流萤
  1222, // 灵砂
  1225, // 忘归人
  1321, // 大丽花
  1003, // 姬子
  1303, // 阮•梅
  8005, // 同谐开拓者(穹)
  8006, // 同谐开拓者(星)
  1301, // 加拉赫
  1220, // 飞霄
  1309, // 知更鸟
  1304, // 砂金
  1308, // 黄泉
  1106, // 佩拉
  1218, // 椒丘
  1401, // 大黑塔
  1202, // 停云
  1313, // 星期日
  1101, // 布洛妮娅
  1306, // 花火
  1217, // 霍霍
]);

export function buildCharacterCombatProfile(build: CombatantInput): CharacterCombatProfile {
  const ownerId = `character:${build.characterId}`;
  const list = (abilitiesByOwnerId.get(ownerId) ?? []).filter((a) => a.sourceKind === "character");
  const findById = (nodeId: string) => list.find((a) => a.sourceNodeId === nodeId);
  const firstBySlot = (slot: string) =>
    list.find(
      (a) =>
        a.slot === slot &&
        a.groupId ===
          `skills:${slot === "basic" ? 0 : slot === "skill" ? 1 : slot === "ult" ? 2 : 3}`,
    ) ?? list.find((a) => a.slot === slot);

  const rawMaxEnergy = getCharacterMaxEnergy(build.characterId);
  const usesSpecialUltResource = rawMaxEnergy > 0 && rawMaxEnergy <= 30;
  const maxEnergy = rawMaxEnergy > 0 ? rawMaxEnergy : 120;

  // Generic L1 parse first
  let basic = parseGenericSkill(firstBySlot("basic"), build, "basic", "普攻", 1, 20);
  let skill = parseGenericSkill(firstBySlot("skill"), build, "skill", "战技", -1, 30);
  let ult = parseGenericSkill(firstBySlot("ult"), build, "ult", "终结技", 0, 5);
  let enhancedBasic: SkillAttackSpec | undefined;
  let enhancedSkill: SkillAttackSpec | undefined;
  let fua: SkillAttackSpec | undefined;

  let role = inferRole(build.path, skill, ult);
  let modelingDepth: ModelingDepth = "generic";
  let modelingBadge = "通用技能估算";
  let modelingSummary = "基于图鉴技能倍率、削韧与回能自动解析（不含专属变身/队友光环）";
  const mechanismNotes: string[] = [];
  const unmodeledNotes: string[] = [];

  // L2 Deep Character Profiles (strictly keyed by characterId)
  switch (build.characterId) {
    case 1310: {
      // 流萤 (Firefly / SAM)
      modelingDepth = "deep";
      modelingBadge = build.abilityVersion >= 1 ? "深度建模(加强版)" : "深度建模";
      role = "dps";
      const basicAb = findById("339912") ?? firstBySlot("basic");
      const skillAb = findById("55385") ?? firstBySlot("skill");
      const ultAb = findById("139326") ?? firstBySlot("ult");
      const enhBasicAb = findById("992907");
      const enhSkillAb = findById("109552");

      const lvB = basicAb ? effectiveSkillLevel(basicAb, build.skills, build.eidolon, "basic") : 6;
      const lvS = skillAb ? effectiveSkillLevel(skillAb, build.skills, build.eidolon, "skill") : 10;
      const lvU = ultAb ? effectiveSkillLevel(ultAb, build.skills, build.eidolon, "ult") : 10;

      basic = {
        id: basicAb?.id ?? "firefly:basic",
        name: basicAb?.name ?? "指令-闪燃推进",
        abilityKind: "basic",
        element: "fire",
        pattern: "single",
        scalingStat: "atk",
        mainScaling: paramValue(basicAb, "p1", lvB) || 1.0,
        adjacentScaling: 0,
        toughnessMain: 10,
        toughnessAdjacent: 0,
        energyGain: 20,
        spDelta: 1,
      };
      skill = {
        id: skillAb?.id ?? "firefly:skill",
        name: skillAb?.name ?? "指令-天火轰击",
        abilityKind: "skill",
        element: "fire",
        pattern: "single",
        scalingStat: "atk",
        mainScaling: paramValue(skillAb, "p1", lvS) || 2.0,
        adjacentScaling: 0,
        toughnessMain: 20,
        toughnessAdjacent: 0,
        // Fixed 60% of max energy (144) — unaffected by ERR, handled in simulator
        energyGain: 0,
        spDelta: -1,
        selfAdvance: 0.25,
      };
      ult = {
        id: ultAb?.id ?? "firefly:ult",
        name: ultAb?.name ?? "火萤Ⅳ型-完全燃烧",
        abilityKind: "ult",
        element: "fire",
        pattern: "self",
        scalingStat: "atk",
        mainScaling: 0,
        adjacentScaling: 0,
        toughnessMain: 0,
        toughnessAdjacent: 0,
        energyGain: 0,
        spDelta: 0,
        isBuffOnly: true,
        selfAdvance: 1.0,
      };
      enhancedBasic = {
        id: enhBasicAb?.id ?? "firefly:enhBasic",
        name: enhBasicAb?.name ?? "火萤Ⅳ型-底火斩击",
        abilityKind: "basic",
        element: "fire",
        pattern: "single",
        scalingStat: "atk",
        mainScaling: paramValue(enhBasicAb, "p1", lvB) || 2.0,
        adjacentScaling: 0,
        toughnessMain: 15,
        toughnessAdjacent: 0,
        energyGain: 0,
        spDelta: 1,
      };
      enhancedSkill = {
        id: enhSkillAb?.id ?? "firefly:enhSkill",
        name: enhSkillAb?.name ?? "火萤Ⅳ型-死星过载",
        abilityKind: "skill",
        element: "fire",
        pattern: "blast",
        scalingStat: "atk",
        mainScaling: paramValue(enhSkillAb, "p1", lvS) || 2.0,
        adjacentScaling: paramValue(enhSkillAb, "p2", lvS) || 1.0,
        beToAtkMain: { coefficient: 0.2, cap: 3.6 },
        beToAtkAdjacent: { coefficient: 0.1, cap: 3.6 },
        toughnessMain: 30,
        toughnessAdjacent: 15,
        energyGain: 0,
        spDelta: build.eidolon >= 1 ? 0 : -1,
        extraDefPen: build.eidolon >= 1 ? 0.15 : 0,
      };

      const ultSpd = paramValue(ultAb, "p3", lvU) || 60;
      const ultBreakVuln = paramValue(ultAb, "p1", lvU) || 0.2;
      modelingSummary = `已建模攻转击破、完全燃烧(+${ultSpd}速/70速倒计时/击破易伤+${Math.round(ultBreakVuln * 100)}%)、强化E挂火弱点与自拐超击破`;
      mechanismNotes.push(
        "γ模组：攻击超1800每10点转+0.8%击破特攻",
        `完全燃烧：速度+${ultSpd}、100%自拉条、+50%削韧效率、70速燃烧倒计时`,
        build.abilityVersion >= 1
          ? "β模组(加强版)：击破≥150%/300%触发100%/150%自拐超击破；α模组燃烧+25%击破并延后倒计时"
          : "β模组：击破≥200%/360%触发35%/50%自拐超击破",
      );
      if (build.eidolon >= 1) mechanismNotes.push("1魂：强化战技无视15%防御且不耗战技点");
      if (build.eidolon >= 2) mechanismNotes.push("2魂：燃烧期间破韧获额外回合(CD 1回合)");
      if (build.eidolon >= 6) mechanismNotes.push("6魂：火抗穿透+20%、破韧效率额外+50%");
      break;
    }

    case 1222: {
      // 灵砂 (Lingsha)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "sustain";
      const fuaAb = findById("459531") ?? firstBySlot("talent");
      const lvT = fuaAb ? effectiveSkillLevel(fuaAb, build.skills, build.eidolon, "talent") : 10;
      const fuaMult = paramValue(fuaAb, "p2", lvT) || 0.75;
      fua = {
        id: fuaAb?.id ?? "lingsha:fuyuan",
        name: "浮元·追击",
        abilityKind: "fua",
        element: "fire",
        pattern: "aoe",
        scalingStat: "atk",
        mainScaling: fuaMult,
        adjacentScaling: fuaMult,
        toughnessMain: 10,
        toughnessAdjacent: 10,
        energyGain: 0,
        spDelta: 0,
      };
      modelingSummary = "已建模90速召唤物【浮元】追击、大招【醇醉】25%击破易伤与击破转攻行迹";
      mechanismNotes.push(
        "召唤物【浮元】：90速行动，全体火伤+额外单体补刀(总削韧10群+10单)",
        "终结技【醇醉】：全体击破易伤+25%（2回合）并拉条浮元100%",
        "行迹朱燎：25%击破特攻转为攻击力%（上限+50%）",
      );
      if (build.eidolon >= 1) mechanismNotes.push("1魂：自身破韧效率+50%，破韧敌方减防20%");
      if (build.eidolon >= 2) mechanismNotes.push("2魂：终结技全队击破特攻+40%");
      if (build.eidolon >= 6) mechanismNotes.push("6魂：浮元在场敌方全减抗20%并追加4段弹射");
      break;
    }

    case 1225: {
      // 忘归人 (Fugue)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "support";
      const enhBAb = findById("234552");
      const lvB = enhBAb ? effectiveSkillLevel(enhBAb, build.skills, build.eidolon, "basic") : 6;
      enhancedBasic = {
        id: enhBAb?.id ?? "fugue:enhBasic",
        name: enhBAb?.name ?? "冉冉方炽",
        abilityKind: "basic",
        element: "fire",
        pattern: "blast",
        scalingStat: "atk",
        mainScaling: paramValue(enhBAb, "p1", lvB) || 1.0,
        adjacentScaling: paramValue(enhBAb, "p2", lvB) || 0.5,
        toughnessMain: 10,
        toughnessAdjacent: 5,
        energyGain: 20,
        spDelta: 1,
      };
      skill = {
        ...skill,
        pattern: "ally",
        mainScaling: 0,
        adjacentScaling: 0,
        toughnessMain: 0,
        toughnessAdjacent: 0,
        energyGain: 30,
        spDelta: -1,
        isBuffOnly: true,
      };
      ult = {
        ...ult,
        pattern: "aoe",
        toughnessMain: 20,
        toughnessAdjacent: 20,
        ignoreWeaknessFull: true,
      };
      modelingSummary =
        "已建模【云火昭】40%虚韧性二次击破、全队100%超击破、【狐祈】30%击破与18%减防";
      mechanismNotes.push(
        "天赋：全队攻击破韧目标转化100%超击破；敌方附加40%虚韧性【云火昭】可二次击破",
        "战技【狐祈】：主C击破特攻+30%、攻击敌方减防18%、自身强化扩散普攻",
        "行迹：自身+30%击破；破韧为队友叠加击破特攻（击破≥220%叠满+36%）",
      );
      if (build.eidolon >= 1) mechanismNotes.push("1魂：狐祈目标破韧效率+50%");
      if (build.eidolon >= 2) mechanismNotes.push("2魂：破韧回3能、终结技全队拉条24%");
      if (build.eidolon >= 4) mechanismNotes.push("4魂：狐祈目标击破伤害+20%");
      break;
    }

    case 1321: {
      // 大丽花 (Dahlia)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "subdps";
      const talentAb = findById("9589834") ?? firstBySlot("talent");
      const ultAb = findById("9873058") ?? firstBySlot("ult");
      const lvT = talentAb
        ? effectiveSkillLevel(talentAb, build.skills, build.eidolon, "talent")
        : 10;
      const lvU = ultAb ? effectiveSkillLevel(ultAb, build.skills, build.eidolon, "ult") : 10;
      ult = {
        ...ult,
        pattern: "aoe",
        mainScaling: paramValue(ultAb, "p1", lvU) || 3.0,
        adjacentScaling: paramValue(ultAb, "p1", lvU) || 3.0,
        splitAcrossTargets: true,
        toughnessMain: 20,
        toughnessAdjacent: 20,
      };
      const fuaMult = paramValue(talentAb, "p1", lvT) || 0.3;
      fua = {
        id: talentAb?.id ?? "dahlia:fua",
        name: "大丽花·天赋追击",
        abilityKind: "fua",
        element: "fire",
        pattern: "bounce",
        scalingStat: "atk",
        mainScaling: fuaMult,
        adjacentScaling: 0,
        bounceHits: build.eidolon >= 4 ? 10 : 5,
        toughnessMain: 3.3333,
        toughnessAdjacent: 0,
        toughnessSubsequent: 3.3333,
        energyGain: 5,
        spDelta: 0,
      };
      modelingSummary =
        "已建模结界(破韧效率+50%且未破韧可打超击破)、共舞者60%超击破、5段200%超击破追击与【败谢】18%减防";
      mechanismNotes.push(
        "战技结界(3回合)：全队弱点击破效率+50%，未破韧敌方受削韧也能触发超击破",
        "天赋【共舞者】：共舞者+60%超击破；队友攻击后发动5段随机弹射追击(含200%超击破)",
        "终结技【败谢】：敌方全体减防18%并挂共舞者属性弱点(4回合)",
        "行迹：分享(24%大丽花击破+50%)击破特攻、每2次追击回1SP、挂弱点加速+30%与火属性固定20削韧",
      );
      if (build.eidolon >= 1) mechanismNotes.push("1魂：全队享共舞者超击破且共舞者+40%");
      if (build.eidolon >= 2) mechanismNotes.push("2魂：在场敌方全属性减抗20%");
      if (build.eidolon >= 4) mechanismNotes.push("4魂：天赋追击+5段并施加全体12%易伤");
      if (build.eidolon >= 6) mechanismNotes.push("6魂：共舞者击破+150%并拉条20%");
      break;
    }

    case 1003: {
      // 姬子 (Himeko)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "dps";
      const talentAb = findById("280910") ?? firstBySlot("talent");
      const lvT = talentAb
        ? effectiveSkillLevel(talentAb, build.skills, build.eidolon, "talent")
        : 10;
      const fuaMult = paramValue(talentAb, "p1", lvT) || 1.4;
      fua = {
        id: talentAb?.id ?? "himeko:fua",
        name: "乘胜追击",
        abilityKind: "fua",
        element: "fire",
        pattern: "aoe",
        scalingStat: "atk",
        mainScaling: fuaMult,
        adjacentScaling: fuaMult,
        toughnessMain: 10,
        toughnessAdjacent: 10,
        energyGain: 10,
        spDelta: 0,
      };
      skill = {
        ...skill,
        isDotApplier: { chance: 0.5, atkScaling: 0.3, turns: 2 },
      };
      modelingSummary = "已建模破韧3层触发全体追击【乘胜追击】、灼烧DoT增伤与满血+15%暴击";
      mechanismNotes.push(
        "天赋【乘胜追击】：敌方破韧积攒充能(开局1层，满3层发动全体火伤追击)",
        "行迹：高血量暴击率+15%、攻击挂灼烧DoT、战技对灼烧增伤+20%",
      );
      if (build.eidolon >= 1) mechanismNotes.push("1魂：追击后速度+20%(2回合)");
      if (build.eidolon >= 6) mechanismNotes.push("6魂：终结技额外2段40%弹射伤害");
      break;
    }

    case 1303: {
      // 阮•梅 (Ruan Mei)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "support";
      skill = { ...skill, pattern: "team", mainScaling: 0, toughnessMain: 0, isBuffOnly: true };
      ult = { ...ult, pattern: "team", mainScaling: 0, toughnessMain: 0, isBuffOnly: true };
      modelingSummary =
        "已建模战技全队增伤(最高68%)+50%破韧效率、大招25%全穿、队友+10%速与破韧附加冰伤";
      mechanismNotes.push(
        "战技【弦外音】：全队增伤32%~68%(按击破特攻转化)、弱点击破效率+50%",
        "终结技结界：全队全属性抗性穿透+25%、破韧延迟【残梅绽】",
        "天赋与行迹：队友速度+10%、全队击破+20%、我方破韧附加120%冰击破伤害",
      );
      if (build.eidolon >= 1) mechanismNotes.push("1魂：终结技结界全队无视20%防御");
      if (build.eidolon >= 2) mechanismNotes.push("2魂：攻击破韧敌人全队攻击力+40%");
      break;
    }

    case 8005:
    case 8006: {
      // 同谐开拓者 (Harmony Trailblazer)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "support";
      skill = {
        ...skill,
        pattern: "bounce",
        bounceHits: build.eidolon >= 6 ? 7 : 5,
        toughnessMain: 20, // First hit doubled by trace 随波逐流
        toughnessSubsequent: 5,
      };
      ult = { ...ult, pattern: "team", mainScaling: 0, toughnessMain: 0, isBuffOnly: true };
      modelingSummary = "已建模【伴舞】全队超击破(120%~160%人数修正)与+30%击破、4魂全队共享15%击破";
      mechanismNotes.push(
        "终结技【伴舞】：全队击破特攻+30%，并开启100%×(1.2~1.6人数倍率)全队超击破",
        "战技多段虚数弹射高额削韧（首段削韧翻倍）",
      );
      if (build.eidolon >= 4) mechanismNotes.push("4魂：为除自身外队友提供15%自身击破特攻");
      break;
    }

    case 1301: {
      // 加拉赫 (Gallagher)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "sustain";
      skill = { ...skill, pattern: "ally", mainScaling: 0, toughnessMain: 0, isBuffOnly: true };
      ult = { ...ult, pattern: "aoe", selfAdvance: 1.0, toughnessMain: 20, toughnessAdjacent: 20 };
      enhancedBasic = {
        ...basic,
        name: "酒花 blitz",
        mainScaling: Math.max(2.5, basic.mainScaling * 2.5),
        toughnessMain: 30,
      };
      modelingSummary = "已建模大招【酩酊】击破易伤+12%与100%自拉条强化普攻";
      mechanismNotes.push(
        "终结技【酩酊】：全体敌方受击破伤害提高12%，自身100%拉条并强化普攻(30削韧)",
      );
      break;
    }

    case 1220: {
      // 飞霄 (Feixiao)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "dps";
      fua = {
        id: "feixiao:fua",
        name: "雷狩·追加攻击",
        abilityKind: "fua",
        element: "wind",
        pattern: "single",
        scalingStat: "atk",
        mainScaling: 1.1,
        adjacentScaling: 0,
        toughnessMain: 5,
        toughnessAdjacent: 0,
        energyGain: 0,
        spDelta: 0,
      };
      ult = {
        ...ult,
        pattern: "single",
        mainScaling: 7.0,
        toughnessMain: 30,
        ignoreWeaknessFull: true,
        energyGain: 0,
      };
      modelingSummary = "已建模【飞黄】叠层大招(6段+终结段高额倍率/无视弱点)与高频追击";
      mechanismNotes.push(
        "大招【飞黄】：按我方攻击次数积攒6点施放，总倍率约700%并无视弱点削韧",
        "天赋：队友攻击后每回合触发1次追加攻击，大招视为追加攻击享受+36%暴伤与追击增伤",
      );
      break;
    }

    case 1309: {
      // 知更鸟 (Robin)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "support";
      skill = { ...skill, pattern: "team", mainScaling: 0, toughnessMain: 0, isBuffOnly: true };
      ult = { ...ult, pattern: "team", mainScaling: 0, toughnessMain: 0, isBuffOnly: true };
      modelingSummary =
        "已建模战技全队+50%增伤、大招【协奏】全队100%拉条/高额加攻/每次攻击附加物理必暴伤";
      mechanismNotes.push(
        "战技：全队增伤+50%(3回合)；天赋：全队暴伤+20%、队友攻击回2能",
        "终结技【协奏】：90速倒计时、全队100%拉条、全队加攻(22.8%自身攻+200)、队友每次攻击附加120%攻必暴物伤(150%暴伤)",
      );
      break;
    }

    case 1304: {
      // 砂金 (Aventurine)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "sustain";
      fua = {
        id: "aventurine:fua",
        name: "盲注·追加攻击",
        abilityKind: "fua",
        element: "imaginary",
        pattern: "bounce",
        scalingStat: "def",
        mainScaling: 0.25,
        adjacentScaling: 0,
        bounceHits: 7,
        toughnessMain: 3.3333,
        toughnessAdjacent: 0,
        toughnessSubsequent: 3.3333,
        energyGain: 7,
        spDelta: 0,
      };
      modelingSummary = "已建模防御转化最高48%暴击率、大招+15%暴伤易伤与7段盲注追击";
      mechanismNotes.push(
        "行迹：防御力转暴击率(最高+48%)；大招施加+15%受暴击伤害易伤；7段防御倍率追击",
      );
      break;
    }

    case 1308: {
      // 黄泉 (Acheron)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "dps";
      ult = {
        ...ult,
        pattern: "aoe",
        mainScaling: 3.72,
        adjacentScaling: 3.0,
        toughnessMain: 20,
        toughnessAdjacent: 20,
        ignoreWeaknessFull: true,
      };
      modelingSummary = "已建模【残梦】9层大招、大招期间20%全属性抗穿与虚无队友1.6倍独立乘区";
      mechanismNotes.push(
        "残梦9层开大：全体高额雷伤并附带20%全属性抗性穿透",
        "行迹【奈落】：按队内虚无角色数提供115%/160%独立最终伤害乘区（2魂减1名要求）",
      );
      break;
    }

    case 1106: {
      // 佩拉 (Pela)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "support";
      modelingSummary = "已建模终结技全体40%减防（2回合）";
      mechanismNotes.push("终结技【通解】：敌方全体防御力降低40%(满级42%)，持续2回合");
      break;
    }

    case 1218: {
      // 椒丘 (Jiaoqiu)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "support";
      modelingSummary = "已建模5层【烬煨】35%全体易伤 + 大招结界额外15%终结技易伤";
      mechanismNotes.push("天赋【烬煨】：满5层使敌方全体易伤+35%，结界内额外终结技易伤+15%");
      break;
    }

    case 1401: {
      // 大黑塔 (The Herta)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "dps";
      modelingSummary = "已建模【解读】叠层强化战技、同智识全队+80%暴伤与大招100%自拉条";
      mechanismNotes.push(
        "大招后100%自拉条并释放高额倍率强化战技；队内有另一名智识角色时全队暴伤+80%",
      );
      break;
    }

    case 1202: {
      // 停云 (Tingyun)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "support";
      skill = { ...skill, pattern: "ally", mainScaling: 0, toughnessMain: 0, isBuffOnly: true };
      ult = { ...ult, pattern: "ally", mainScaling: 0, toughnessMain: 0, isBuffOnly: true };
      modelingSummary = "已建模战技【赐福】加攻与雷附加伤、大招给主C回50能量+50%增伤";
      mechanismNotes.push("战技【赐福】：主C攻击力提高(受停云攻击上限约束)；大招主C回50能+50%增伤");
      break;
    }

    case 1313: {
      // 星期日 (Sunday)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "support";
      skill = { ...skill, pattern: "ally", mainScaling: 0, toughnessMain: 0, isBuffOnly: true };
      ult = { ...ult, pattern: "ally", mainScaling: 0, toughnessMain: 0, isBuffOnly: true };
      modelingSummary = "已建模战技拉条主C100%+30%增伤+20%暴击、大招回20%能量与高额暴伤转化";
      mechanismNotes.push(
        "战技：主C立即行动(100%拉条)、增伤+30%、暴击率+20%",
        "终结技：主C恢复20%最大能量并获得(30%星期日暴伤+12%)暴伤加成",
      );
      break;
    }

    case 1101: {
      // 布洛妮娅 (Bronya)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "support";
      skill = { ...skill, pattern: "ally", mainScaling: 0, toughnessMain: 0, isBuffOnly: true };
      ult = { ...ult, pattern: "team", mainScaling: 0, toughnessMain: 0, isBuffOnly: true };
      modelingSummary = "已建模战技100%拉条+66%增伤、大招全队+55%攻击力与暴伤转化";
      mechanismNotes.push("战技：拉条主C100%并增伤+66%；大招：全队+55%攻与暴伤加成");
      break;
    }

    case 1306: {
      // 花火 (Sparkle)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "support";
      skill = { ...skill, pattern: "ally", mainScaling: 0, toughnessMain: 0, isBuffOnly: true };
      ult = { ...ult, pattern: "team", mainScaling: 0, toughnessMain: 0, isBuffOnly: true };
      modelingSummary = "已建模战技50%拉条+暴伤转化、大招恢复4点战技点与全队增伤";
      mechanismNotes.push("战技：主C拉条50%并获得高额暴伤；大招：立刻回复4战技点并提高全队增伤");
      break;
    }

    case 1217: {
      // 霍霍 (Huohuo)
      modelingDepth = "deep";
      modelingBadge = "深度建模";
      role = "sustain";
      skill = { ...skill, pattern: "team", mainScaling: 0, toughnessMain: 0, isBuffOnly: true };
      ult = { ...ult, pattern: "team", mainScaling: 0, toughnessMain: 0, isBuffOnly: true };
      modelingSummary = "已建模大招全队回复20%最大能量与+40%攻击力";
      mechanismNotes.push("终结技：为除自身外全队恢复20%最大能量并提高40%攻击力(2回合)");
      break;
    }

    default: {
      unmodeledNotes.push(
        `${build.name} 当前使用通用技能模板估算（已读取图鉴倍率/削韧/回能，不含专属叠层或队友特殊机制）`,
      );
      break;
    }
  }

  return {
    characterId: build.characterId,
    variantKey: build.variantKey,
    name: build.name,
    element: build.element,
    role,
    modelingDepth,
    modelingBadge,
    modelingSummary,
    maxEnergy,
    usesSpecialUltResource,
    basic,
    skill,
    ult,
    ...(enhancedBasic ? { enhancedBasic } : {}),
    ...(enhancedSkill ? { enhancedSkill } : {}),
    ...(fua ? { fua } : {}),
    mechanismNotes,
    unmodeledNotes,
  };
}
