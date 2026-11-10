import {
  characters,
  characterDetail,
  dashboard,
  lightCones,
  relics,
  teams,
} from "./mobile-fixtures";
import { characterById, lightConeById } from "@/shared/catalogue";
import type { SyncSettings } from "@/types";

export const mobileDemoStorageKey = "starrail-mobile-demo";
export function demoEnabled(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(mobileDemoStorageKey) !== "real";
}
const settings: SyncSettings = {
  protocol: "webdav",
  webdav: { serverUrl: "", remotePath: "/StarRailTools/", username: "", password: "" },
  ftp: { host: "", port: 21, remotePath: "/", username: "", password: "", secure: false },
  sftp: { host: "", port: 22, remotePath: "/", username: "", password: "", privateKeyPath: "" },
};
type Row = Record<string, unknown>;
function page(rows: Row[], filter: Row = {}) {
  const items = rows.filter((row) => {
    const name = String(row.name ?? "");
    if (filter.search && !`${name} ${row.location ?? ""}`.includes(String(filter.search)))
      return false;
    const cone = lightConeById.get(Number(row.templateId));
    const character = characterById.get(Number(row.characterId));
    const fields = {
      ...row,
      rarity: row.rarity ?? cone?.rarity ?? character?.rarity,
      path: row.path ?? cone?.path,
    };
    for (const [key, field] of Object.entries({
      slots: "slot",
      rarities: "rarity",
      mainStats: "mainStat",
      superimposition: "superimposition",
      path: "path",
      eidolon: "eidolon",
      names: "name",
    })) {
      const choices = filter[key];
      if (
        Array.isArray(choices) &&
        choices.length &&
        !choices.includes(fields[field as keyof typeof fields])
      )
        return false;
    }
    for (const field of ["locked", "discard", "hasBuildPlan"]) {
      if (typeof filter[field] === "boolean" && row[field] !== filter[field]) return false;
    }
    if (
      typeof filter.equipped === "boolean" &&
      Boolean(row.equippedCharacterId) !== filter.equipped
    )
      return false;
    if (
      Array.isArray(filter.subStats) &&
      !filter.subStats.every((key) =>
        (row.substats as Row[] | undefined)?.some((s) => s.key === key),
      )
    )
      return false;
    const count = (row.substats as unknown[] | undefined)?.length ?? 0;
    for (const [key, value, minimum] of [
      ["minLevel", Number(row.level), true],
      ["maxLevel", Number(row.level), false],
      ["minAscension", Number(row.ascension), true],
      ["minSubstatCount", count, true],
      ["maxSubstatCount", count, false],
    ] as const) {
      if (
        typeof filter[key] === "number" &&
        (minimum ? value < Number(filter[key]) : value > Number(filter[key]))
      )
        return false;
    }
    return true;
  });
  const current = Math.max(1, Number(filter.page) || 1);
  const size = Math.max(1, Number(filter.pageSize) || 50);
  return {
    items: items.slice((current - 1) * size, current * size),
    total: items.length,
    page: current,
    pageSize: size,
  };
}

/** Only native layout queries may escape the demo adapter. Demo actions never write user data. */
export function mobileMock(command: string, args: Row = {}): { value: unknown } | undefined {
  const filter = args.filter as Row | undefined;
  let value: unknown;
  switch (command) {
    case "get_mobile_layout_regions":
      return undefined;
    case "get_inventory_summary":
      value = {
        relics: relics.length,
        lightCones: lightCones.length,
        characters: characters.length,
      };
      break;
    case "list_relics":
      value = page(relics as unknown as Row[], filter);
      break;
    case "list_characters":
      value = page(characters as unknown as Row[], filter);
      break;
    case "list_light_cones":
      value = page(lightCones as unknown as Row[], filter);
      break;
    case "list_teams":
      value = page(teams as unknown as Row[], filter);
      break;
    case "get_team":
      value = teams.find((t) => t.teamId === args.teamId);
      break;
    case "get_inventory_detail": {
      const data =
        args.kind === "character"
          ? characterDetail(Number(args.id))
          : (args.kind === "relic" ? relics : lightCones).find((r) => r.itemId === args.id);
      if (!data) throw new Error("示例物品不存在");
      value = { kind: args.kind, data };
      break;
    }
    case "get_build_dashboard":
    case "list_relic_set_farming_profiles":
      value = dashboard;
      break;
    case "get_character_build_plan":
      value = dashboard.find((d) => d.plan.characterId === args.characterId)?.plan ?? null;
      break;
    case "get_inventory_equipment_counts":
      value = {
        relics: [...new Set(relics.map((r) => r.setId))].map((setId) => ({
          setId,
          count: relics.filter((r) => r.setId === setId).length,
        })),
        lightCones: lightCones.map((c) => ({ templateId: c.templateId, count: 1 })),
      };
      break;
    case "list_relic_set_target_counts":
      value = [...new Set(dashboard.flatMap((d) => [d.plan.cavernSetA, d.plan.planarSetId]))].map(
        (setId) => ({
          setId,
          count: dashboard.filter((d) => [d.plan.cavernSetA, d.plan.planarSetId].includes(setId))
            .length,
        }),
      );
      break;
    case "list_relic_set_recommended_characters":
      value = dashboard
        .filter((d) => [d.plan.cavernSetA, d.plan.planarSetId].includes(Number(args.setId)))
        .map((d) => ({
          characterId: d.character.characterId,
          name: d.character.name,
          mainStats: d.plan.mainStats,
          effectiveSubstats: d.plan.effectiveSubstats,
        }));
      break;
    case "get_sync_settings":
      value = settings;
      break;
    default:
      throw new Error("当前为示例数据模式，此操作需先点击顶部“示例数据”切换到真实数据。");
  }
  return { value: structuredClone(value) };
}
