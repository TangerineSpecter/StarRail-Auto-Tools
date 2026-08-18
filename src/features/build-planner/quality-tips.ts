/** Hover-tip copy for dashboard「部位合格状况」metrics. */

export function qualityMainStatTip(): string {
  return [
    "对照培养方案「各部位允许主词条」。",
    "已装备遗器的主属性命中该部位目标即算正确。",
    "头 / 手由游戏固定为生命 / 攻击。",
    "某部位未勾选目标时不扣分。",
    "分母是已装备件数。",
  ].join("");
}

export function qualityPassCountTip(minPotentialPct: number): string {
  return [
    `对照方案「质量门槛（潜力%）」，当前为 ${minPotentialPct}%。`,
    "一件遗器同时满足主属性未判错、词条潜力达到门槛，才算及格。",
    "可选部位主属性不符则没有字母评级，不计及格。",
    "分母是已装备件数。",
  ].join("");
}
