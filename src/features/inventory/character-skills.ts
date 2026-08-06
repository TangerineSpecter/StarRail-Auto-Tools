export type SkillEntry = {
  key: string;
  label: string;
  value: string;
};

const skillLabels: Record<string, string> = {
  basic: "普通攻击",
  skill: "战技",
  talent: "天赋",
  ult: "终结技",
  elation: "欢愉技",
  remembrance: "记忆技",
  memo: "忆灵技能",
  memosprite: "忆灵技能",
  technique: "秘技",
  special: "特殊技能",
};

export function characterSkillEntries(
  skills: Record<string, unknown> | null | undefined,
): SkillEntry[] {
  if (!skills) return [];

  return Object.entries(skills).map(([key, value]) => ({
    key,
    label: skillLabels[key] ?? key,
    value: formatSkillValue(value),
  }));
}

function formatSkillValue(value: unknown): string {
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (typeof value === "boolean") return value ? "已激活" : "未激活";
  if (Array.isArray(value)) return `${value.length} 项`;
  return "已同步";
}
