import type { AbilityKind, CombatantInput, CombatElement } from "./types";

/**
 * Combat-only buffs from relic sets and light cones.
 * IMPORTANT: Unconditional standing bonuses (e.g. 2pc +16% Break Effect, LC passive +60% BE)
 * are already included in `standing` stats by `standing-stats.ts`. This module ONLY models
 * combat-triggered, conditional, team-aura, or debuff effects to avoid double counting.
 */

export interface EquipmentCombatProfile {
  /** Self combat stat additions active in battle (ratios in decimal). */
  selfAtkPercent: number;
  selfCritRate: number;
  selfCritDamage: number;
  selfBreakEffect: number;
  selfGenericDmg: number;
  selfAbilityDmg: Partial<Record<AbilityKind, number>>;
  selfBreakDmgBoost: number;
  selfDefPen: number;
  selfBreakDefPen: number;
  selfSuperBreakDefPen: number;
  /** Team aura buffs granted to allies in battle. */
  teamAtkPercent: number;
  teamCritDamage: number;
  teamBreakEffectOnUlt: number;
  teamGenericDmgOnUlt: number;
  teamBreakDmgBoostCarry: number;
  teamStartEnergy: number;
  /** Enemy debuffs inflicted by this equipment. */
  enemyDefDown: number;
  enemyVulnOnUlt: number;
  enemyBreakVulnOnBreak: number;
  selfBreakVulnOnBreak: number;
  /** Action-value / energy / SP triggers. */
  initialAdvance: number;
  eagleUltAdvance: number;
  dddTeamAdvanceOnUlt: number;
  extraEnergyOnAttack: number;
  extraEnergyOnBreak: number;
  extraSpOnUlt: boolean;
  /** Dynamic per-attack stacking (e.g. Fall of an Aeon). */
  aeonAtkPerAttack: number;
  aeonBreakDmgBuff: number;
  /** Human-readable descriptions of active equipment combat effects. */
  notes: string[];
}

function emptyEquipmentProfile(): EquipmentCombatProfile {
  return {
    selfAtkPercent: 0,
    selfCritRate: 0,
    selfCritDamage: 0,
    selfBreakEffect: 0,
    selfGenericDmg: 0,
    selfAbilityDmg: {},
    selfBreakDmgBoost: 0,
    selfDefPen: 0,
    selfBreakDefPen: 0,
    selfSuperBreakDefPen: 0,
    teamAtkPercent: 0,
    teamCritDamage: 0,
    teamBreakEffectOnUlt: 0,
    teamGenericDmgOnUlt: 0,
    teamBreakDmgBoostCarry: 0,
    teamStartEnergy: 0,
    enemyDefDown: 0,
    enemyVulnOnUlt: 0,
    enemyBreakVulnOnBreak: 0,
    selfBreakVulnOnBreak: 0,
    initialAdvance: 0,
    eagleUltAdvance: 0,
    dddTeamAdvanceOnUlt: 0,
    extraEnergyOnAttack: 0,
    extraEnergyOnBreak: 0,
    extraSpOnUlt: false,
    aeonAtkPerAttack: 0,
    aeonBreakDmgBuff: 0,
    notes: [],
  };
}

function interpS1S5(s1: number, s5: number, superimposition: number): number {
  const clamped = Math.min(5, Math.max(1, Math.round(superimposition || 1)));
  return s1 + ((s5 - s1) * (clamped - 1)) / 4;
}

function addAbilityDmg(
  target: Partial<Record<AbilityKind, number>>,
  kind: AbilityKind,
  val: number,
) {
  target[kind] = (target[kind] ?? 0) + val;
}

export function resolveEquipmentCombatProfile(
  build: CombatantInput,
  options: { targetHasFireWeakness?: boolean; targetCount?: number } = {},
): EquipmentCombatProfile {
  const out = emptyEquipmentProfile();
  const setPieces = new Map<number, number>();
  for (const s of build.sets) setPieces.set(s.setId, s.pieces);
  const standing = build.standing;

  // --- Cavern 4pc combat effects ---
  if ((setPieces.get(119) ?? 0) >= 4) {
    // 荡除蠹灾的铁骑 4pc: BE>=150% -> Break ignores 10% DEF; BE>=250% -> Super Break ignores extra 15% DEF
    out.selfBreakDefPen += 0.1;
    out.selfSuperBreakDefPen += 0.15;
    out.notes.push("铁骑4件：击破无视10%防御，超击破额外无视15%防御（按实战达标判定）");
  }
  if ((setPieces.get(118) ?? 0) >= 4) {
    // 机心戏梦的钟表匠 4pc: Ult on ally grants team +30% BE
    out.teamBreakEffectOnUlt += 0.3;
    out.notes.push("钟表匠4件：终结技全队击破特攻+30%");
  }
  if ((setPieces.get(110) ?? 0) >= 4) {
    // 晨昏交界的翔鹰 4pc: Ult advances self by 25%
    out.eagleUltAdvance = 0.25;
    out.notes.push("风套4件：终结技后自身行动提前25%");
  }
  if ((setPieces.get(111) ?? 0) >= 4) {
    // 流星追迹的怪盗 4pc: +3 energy on break
    out.extraEnergyOnBreak += 3;
    out.notes.push("怪盗4件：击破敌方弱点回复3点能量");
  }
  if ((setPieces.get(108) ?? 0) >= 4) {
    // 繁星璀璨的天才 4pc: ignore 10% DEF (+10% vs Quantum weak)
    out.selfDefPen += build.element === "quantum" ? 0.2 : 0.1;
    out.notes.push(
      build.element === "quantum" ? "量子套4件：无视20%防御（弱点匹配）" : "量子套4件：无视10%防御",
    );
  }
  if ((setPieces.get(115) ?? 0) >= 4) {
    // 毁烬焚骨的大公 4pc: FUA stacks ATK% (conservative 5 stacks = +30% ATK)
    out.selfAtkPercent += 0.3;
    out.notes.push("大公4件：追击叠层攻击力+30%（稳态估算）");
  }
  if ((setPieces.get(116) ?? 0) >= 4) {
    // 幽锁深牢的系囚 4pc: ignore up to 18% DEF with DoTs (conservative 12%)
    out.selfDefPen += 0.12;
    out.notes.push("系囚4件：按2层DoT计无视12%防御");
  }
  if ((setPieces.get(117) ?? 0) >= 4) {
    // 死水深潜的先驱 4pc: +4% CR, +12% CD (doubled on debuff -> extra +4% CR, +12% CD)
    out.selfCritRate += 0.04;
    out.selfCritDamage += 0.24;
    out.notes.push("死水4件：双暴战斗加成（按稳态3负面估算）");
  }
  if ((setPieces.get(120) ?? 0) >= 4) {
    // 风举云飞的勇烈 4pc: FUA -> Ult DMG +36%
    addAbilityDmg(out.selfAbilityDmg, "ult", 0.36);
    out.notes.push("勇烈4件：追击后终结技伤害+36%");
  }
  if ((setPieces.get(122) ?? 0) >= 4) {
    // 识海迷坠的学者 4pc: Skill/Ult DMG +20%, extra +25% next Skill after Ult
    addAbilityDmg(out.selfAbilityDmg, "skill", 0.32);
    addAbilityDmg(out.selfAbilityDmg, "ult", 0.2);
    out.notes.push("学者4件：战技与终结技增伤");
  }
  if ((setPieces.get(102) ?? 0) >= 4) {
    // 野穗伴行的快枪手 4pc: Basic DMG +10%
    addAbilityDmg(out.selfAbilityDmg, "basic", 0.1);
  }
  if ((setPieces.get(107) ?? 0) >= 4) {
    // 熔岩锻铸的火匠 4pc: Skill DMG +12%, Fire DMG +12% after Ult
    addAbilityDmg(out.selfAbilityDmg, "skill", 0.12);
    out.selfGenericDmg += 0.08;
  }

  // --- Planar 2pc combat effects ---
  if ((setPieces.get(316) ?? 0) >= 2) {
    // 劫火莲灯铸炼宫 2pc: +40% BE when hitting Fire-weak enemy
    if (options.targetHasFireWeakness ?? build.element === "fire") {
      out.selfBreakEffect += 0.4;
      out.notes.push("劫火2件：命中火弱点击破特攻+40%");
    }
  }
  if ((setPieces.get(307) ?? 0) >= 2 && standing.speed >= 145) {
    // 盗贼公国塔利亚 2pc: SPD >= 145 -> extra +20% BE
    out.selfBreakEffect += 0.2;
    out.notes.push("塔利亚2件：速度达145额外击破特攻+20%");
  }
  if ((setPieces.get(308) ?? 0) >= 2 && standing.speed >= 120) {
    // 生命的翁瓦克 2pc: SPD >= 120 -> 40% initial action advance
    out.initialAdvance = Math.max(out.initialAdvance, 0.4);
    out.notes.push("翁瓦克2件：开局行动提前40%");
  }
  if ((setPieces.get(306) ?? 0) >= 2 && standing.critRate >= 0.5) {
    // 停转的萨尔索图 2pc: CR >= 50% -> Ult/FUA DMG +15%
    addAbilityDmg(out.selfAbilityDmg, "ult", 0.15);
    addAbilityDmg(out.selfAbilityDmg, "fua", 0.15);
    out.notes.push("萨尔索图2件：终结技与追击增伤+15%");
  }
  if ((setPieces.get(309) ?? 0) >= 2 && standing.critRate >= 0.7) {
    // 繁星竞技场 2pc: CR >= 70% -> Basic/Skill DMG +20%
    addAbilityDmg(out.selfAbilityDmg, "basic", 0.2);
    addAbilityDmg(out.selfAbilityDmg, "skill", 0.2);
    out.notes.push("繁星竞技场2件：普攻与战技增伤+20%");
  }
  if ((setPieces.get(311) ?? 0) >= 2) {
    // 苍穹战线格拉默 2pc: SPD >= 135/160 -> DMG +12%/18%
    if (standing.speed >= 160) out.selfGenericDmg += 0.18;
    else if (standing.speed >= 135) out.selfGenericDmg += 0.12;
  }
  if ((setPieces.get(310) ?? 0) >= 2 && standing.effectRes >= 0.3) {
    // 折断的龙骨 2pc: Effect RES >= 30% -> team CRIT DMG +10%
    out.teamCritDamage += 0.1;
    out.notes.push("龙骨2件：全队暴击伤害+10%");
  }
  if ((setPieces.get(302) ?? 0) >= 2 && standing.speed >= 120) {
    // 不老者的仙舟 2pc: SPD >= 120 -> team ATK +8%
    out.teamAtkPercent += 0.08;
    out.notes.push("仙舟2件：全队攻击力+8%");
  }
  if ((setPieces.get(315) ?? 0) >= 2) {
    // 奔狼的都蓝王朝 2pc: FUA stacks up to 25% FUA DMG + 25% CD (conservative 3 stacks)
    addAbilityDmg(out.selfAbilityDmg, "fua", 0.18);
    out.selfCritDamage += 0.15;
    out.notes.push("奔狼2件：追击叠层增伤与暴伤");
  }
  if ((setPieces.get(314) ?? 0) >= 2) {
    // 出云显世与高天神国 2pc: same path ally -> +12% CR
    out.selfCritRate += 0.12;
  }
  if ((setPieces.get(317) ?? 0) >= 2) {
    // 沉陆海域露莎卡 2pc: +12% ATK to 1st slot
    out.teamAtkPercent += 0.12;
    out.notes.push("露莎卡2件：一号位攻击力+12%");
  }

  // --- Light Cone combat effects ---
  const lc = build.lightCone;
  if (lc) {
    const s = lc.superimposition;
    switch (lc.templateId) {
      case 24000: {
        // 记一位星神的陨落: +8%~16% ATK per attack (max 4 stacks), +12%~24% DMG after break
        out.aeonAtkPerAttack = interpS1S5(0.08, 0.16, s);
        out.aeonBreakDmgBuff = interpS1S5(0.12, 0.24, s);
        out.notes.push(
          `星神陨落(叠${s})：攻击叠层攻击力+${Math.round(out.aeonAtkPerAttack * 400)}%（满4层）`,
        );
        break;
      }
      case 23025: {
        // 梦应归于何处: Routed -> +24%~40% Break DMG taken from wearer
        out.selfBreakVulnOnBreak = interpS1S5(0.24, 0.4, s);
        out.notes.push(
          `梦应归于何处(叠${s})：敌方受装备者击破伤害+${Math.round(out.selfBreakVulnOnBreak * 100)}%`,
        );
        break;
      }
      case 23032: {
        // 唯有香如故: Ult -> enemy DMG taken +10%~18%, extra +8%~16% if BE >= 150%
        const base = interpS1S5(0.1, 0.18, s);
        const extra = standing.breakEffect >= 1.5 ? interpS1S5(0.08, 0.16, s) : 0;
        out.enemyVulnOnUlt += base + extra;
        out.notes.push(`唯有香如故(叠${s})：终结技使敌方易伤+${Math.round((base + extra) * 100)}%`);
        break;
      }
      case 23035: {
        // 长路终有归途: On break -> enemy Break DMG taken +18%~30% x2 stacks
        out.enemyBreakVulnOnBreak += interpS1S5(0.18, 0.3, s);
        out.notes.push(
          `长路终有归途(叠${s})：击破叠层易伤+${Math.round(out.enemyBreakVulnOnBreak * 100)}%/层（最高2层）`,
        );
        break;
      }
      case 23050: {
        // 勿忘她的火焰: Break DMG +32%~72% for wearer + highest BE teammate
        out.teamBreakDmgBoostCarry += interpS1S5(0.32, 0.72, s);
        out.notes.push(
          `勿忘她的火焰(叠${s})：自身与击破最高队友击破增伤+${Math.round(out.teamBreakDmgBoostCarry * 100)}%`,
        );
        break;
      }
      case 23019: {
        // 镜中故我: Ult -> team DMG +24%~40%, +1 SP if BE >= 150%; wave start team +10~20 energy
        out.teamGenericDmgOnUlt += interpS1S5(0.24, 0.4, s);
        out.teamStartEnergy += interpS1S5(10, 20, s);
        out.extraSpOnUlt = standing.breakEffect >= 1.5;
        out.notes.push(
          `镜中故我(叠${s})：开局全队回能+${Math.round(out.teamStartEnergy)}，终结技全队增伤+${Math.round(out.teamGenericDmgOnUlt * 100)}%`,
        );
        break;
      }
      case 21015: {
        // 决心如汗珠般闪耀: hit -> DEF -12%~16%
        out.enemyDefDown += interpS1S5(0.12, 0.16, s);
        out.notes.push(`决心如汗珠般闪耀(叠${s})：敌方减防${Math.round(out.enemyDefDown * 100)}%`);
        break;
      }
      case 21018: {
        // 舞！舞！舞！: Ult -> team advance 16%~24%
        out.dddTeamAdvanceOnUlt = interpS1S5(0.16, 0.24, s);
        out.notes.push(
          `舞！舞！舞！(叠${s})：终结技全队拉条${Math.round(out.dddTeamAdvanceOnUlt * 100)}%`,
        );
        break;
      }
      case 21004: {
        // 记忆中的模样: attack -> +4~8 energy
        out.extraEnergyOnAttack += interpS1S5(4, 8, s);
        out.notes.push(`记忆中的模样(叠${s})：攻击额外回能+${Math.round(out.extraEnergyOnAttack)}`);
        break;
      }
      case 23000: {
        // 银河铁道之夜: +9%~15% ATK per enemy, +30%~50% DMG on break
        const targets = Math.min(5, options.targetCount ?? 3);
        out.selfAtkPercent += interpS1S5(0.09, 0.15, s) * targets;
        out.selfGenericDmg += interpS1S5(0.3, 0.5, s) * 0.5;
        out.notes.push(`银河铁道之夜(叠${s})：按${targets}目标计攻击力加成与破韧增伤`);
        break;
      }
      case 23024: {
        // 行于流逝的岸: DMG +24%~40%, Ult extra +24%~40%
        const dmg = interpS1S5(0.24, 0.4, s);
        out.selfGenericDmg += dmg;
        addAbilityDmg(out.selfAbilityDmg, "ult", dmg);
        out.notes.push(`行于流逝的岸(叠${s})：全增伤与终结技额外增伤`);
        break;
      }
      case 23031: {
        // 我将，巡征追猎: Ult ignores 27%~39% x2 DEF
        out.selfDefPen += interpS1S5(0.27, 0.39, s) * 1.5;
        out.notes.push(`我将，巡征追猎(叠${s})：终结技无视高额防御`);
        break;
      }
      case 23026: {
        // 夜色流光溢彩: Ult -> self ATK +48%~96%, team DMG +24%~40%
        out.selfAtkPercent += interpS1S5(0.48, 0.96, s);
        out.teamGenericDmgOnUlt += interpS1S5(0.24, 0.4, s);
        out.notes.push(`夜色流光溢彩(叠${s})：终结技全队增伤与自身加攻`);
        break;
      }
      case 23034: {
        // 回到大地的飞行: Skill/Ult +6~8 energy, ally +45%~72% DMG (3 stacks)
        out.extraEnergyOnAttack += interpS1S5(6, 8, s);
        out.teamGenericDmgOnUlt += interpS1S5(0.45, 0.72, s) * 0.7;
        out.notes.push(`回到大地的飞行(叠${s})：回能与圣咏叠层增伤`);
        break;
      }
      case 23037: {
        // 向着不可追问处: Ult -> Skill & Ult DMG +60%~100%
        const bonus = interpS1S5(0.6, 1.0, s);
        addAbilityDmg(out.selfAbilityDmg, "skill", bonus);
        addAbilityDmg(out.selfAbilityDmg, "ult", bonus);
        out.notes.push(`向着不可追问处(叠${s})：战技与终结技增伤+${Math.round(bonus * 100)}%`);
        break;
      }
      case 21020: {
        // 天才们的休憩: CRIT DMG +24%~48% (averaged uptime)
        out.selfCritDamage += interpS1S5(0.24, 0.48, s) * 0.6;
        break;
      }
      default:
        break;
    }
  }

  return out;
}

export function normalizeElement(raw: string | undefined): CombatElement {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "物理" || s === "physical") return "physical";
  if (s === "火" || s === "fire") return "fire";
  if (s === "冰" || s === "ice") return "ice";
  if (s === "雷" || s === "lightning" || s === "thunder") return "lightning";
  if (s === "风" || s === "wind") return "wind";
  if (s === "量子" || s === "quantum") return "quantum";
  if (s === "虚数" || s === "imaginary") return "imaginary";
  return "physical";
}
