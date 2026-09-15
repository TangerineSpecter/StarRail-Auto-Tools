import { reviewedStandingRules, standingEquipment } from "@/shared/utils/standing-rule-catalogue";
import {
  characterDisplayName,
  lightConeById,
  relicCatalogue,
  resolveCharacterCatalogue,
} from "@/shared/catalogue";
import {
  calculateStandingSpeed,
  isMaxStandingEquipment,
  lightConeSkillEffect,
} from "@/shared/utils/standing-stats";
import { traceNodeEnabled, type DisabledTraceNodes } from "@/shared/utils/trace-settings";
import { primaryTraceNodes } from "@/shared/utils/trace-stats";
import type { TeamMember } from "@/types";

const VONWACQ_SET_ID = 308;
const EAGLE_SET_ID = 110;
const DANCE_DANCE_DANCE_ID = 21018;

interface AxisRelic {
  setId: number;
  mainStat: string;
  mainStatValue: number;
  substats?: Array<{ kind: string; key: string; value: number }>;
}

interface AxisLightCone {
  templateId: number;
  level: number;
  ascension: number;
  superimposition: number;
}

export interface TeamAxisCharacterDetail {
  characterId: number;
  name: string;
  path: string;
  level: number;
  ascension: number;
  equippedRelics?: AxisRelic[];
  equippedLightCone?: AxisLightCone | null;
}

export interface TeamActionAxisProfile {
  characterId: number;
  name: string;
  avatar?: string;
  available: boolean;
  speed: number | null;
  initialAdvance: number;
  initialAdvanceLabel?: string;
  warnings: string[];
  reason?: string;
}

function unavailable(
  member: TeamMember,
  reason: string,
  name = member.name,
): TeamActionAxisProfile {
  return {
    characterId: member.characterId,
    name,
    available: false,
    speed: null,
    initialAdvance: 0,
    warnings: [],
    reason,
  };
}

export function resolveTeamActionAxisProfile(
  member: TeamMember,
  detail: TeamAxisCharacterDetail,
  disabledTraceNodes: DisabledTraceNodes,
): TeamActionAxisProfile {
  const displayName = characterDisplayName({
    characterId: member.characterId,
    name: member.name,
    path: member.path,
  });
  const catalogue = resolveCharacterCatalogue({
    characterId: member.characterId,
    name: member.name,
    path: member.path,
  });
  if (!catalogue?.baseStats) return unavailable(member, "角色满级基础速度尚未同步", displayName);

  const lightCone = detail.equippedLightCone ?? null;
  if (!lightCone) return unavailable(member, "未装备光锥，无法确认完整站街速度", displayName);
  const lightConeEntry = lightConeById.get(lightCone.templateId);
  if (!lightConeEntry?.baseStats) {
    return unavailable(member, "光锥满级基础属性尚未同步", displayName);
  }
  if (!isMaxStandingEquipment(detail, lightCone)) {
    return unavailable(member, "当前仅支持角色与光锥均为 Lv.80、满突破的精确排轴", displayName);
  }

  const relics = detail.equippedRelics ?? [];
  const equipment = standingEquipment(lightCone, relics, detail.path ?? "");
  const review = reviewedStandingRules(equipment);
  if (review.unreviewedSources.length || review.missingInputs.length) {
    return unavailable(
      member,
      `站街规则待审核或缺少计算状态：${[...review.unreviewedSources, ...review.missingInputs].join("、")}`,
      displayName,
    );
  }
  const setCounts = new Map<number, number>();
  for (const relic of relics) setCounts.set(relic.setId, (setCounts.get(relic.setId) ?? 0) + 1);

  const traces = primaryTraceNodes(catalogue.traceStats ?? [])
    .filter((node) => traceNodeEnabled(disabledTraceNodes, member.characterId, node.id))
    .flatMap((node) => node.stats);
  const setEffects = relicCatalogue.sets.flatMap((set) => {
    const count = setCounts.get(set.id) ?? 0;
    return [count >= 2 ? set.effects.twoPiece : "", count >= 4 ? set.effects.fourPiece : ""].filter(
      (effect): effect is string => Boolean(effect),
    );
  });
  const lightConeEffect = lightConeSkillEffect(lightConeEntry.skill, lightCone.superimposition);
  const speed = calculateStandingSpeed({
    characterBase: catalogue.baseStats,
    lightConeBase: lightConeEntry.baseStats,
    relics,
    traces,
    setEffects,
    lightConeEffects: lightConeEffect ? [lightConeEffect] : [],
    equipment,
  });

  const hasVonwacq = (setCounts.get(VONWACQ_SET_ID) ?? 0) >= 2;
  const initialAdvance = hasVonwacq && speed >= 120 ? 0.4 : 0;
  const warnings: string[] = [];
  if ((setCounts.get(EAGLE_SET_ID) ?? 0) >= 4) warnings.push("风套终结技后行动提前未模拟");
  if (lightCone.templateId === DANCE_DANCE_DANCE_ID) warnings.push("舞！舞！舞！全队拉条未模拟");

  return {
    characterId: member.characterId,
    name: displayName,
    avatar: catalogue.image ?? undefined,
    available: Number.isFinite(speed) && speed > 0,
    speed,
    initialAdvance,
    initialAdvanceLabel: initialAdvance ? "翁瓦克开局提前 40%" : undefined,
    warnings,
  };
}
