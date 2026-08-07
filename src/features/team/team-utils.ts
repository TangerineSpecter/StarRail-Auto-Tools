import { characterDisplayName, resolveCharacterCatalogue } from "@/shared/catalogue";
import { pathLabel } from "@/shared/catalogue/relic-options";
import type { CharacterListItem, Team, TeamInput, TeamMember } from "@/types";

export const TEAM_SLOT_COUNT = 4;
export const MAX_TEAM_NAME_LEN = 64;
export const MAX_TEAM_NOTE_LEN = 500;

/** Inventory English path values used by character filter chips. */
export const TEAM_PATH_OPTIONS = [
  { label: "毁灭", value: "Destruction" },
  { label: "巡猎", value: "Hunt" },
  { label: "智识", value: "Erudition" },
  { label: "同谐", value: "Harmony" },
  { label: "虚无", value: "Nihility" },
  { label: "存护", value: "Preservation" },
  { label: "丰饶", value: "Abundance" },
  { label: "记忆", value: "Remembrance" },
  { label: "欢愉", value: "Elation" },
] as const;

export const TEAM_ELEMENT_OPTIONS = [
  { label: "物理", color: "#888888" },
  { label: "火", color: "#f44336" },
  { label: "冰", color: "#29b6f6" },
  { label: "雷", color: "#ab47bc" },
  { label: "风", color: "#26a69a" },
  { label: "量子", color: "#26c6da" },
  { label: "虚数", color: "#ffa726" },
] as const;

export interface TeamCharacterFilter {
  search: string;
  paths: string[];
  elements: string[];
  excludeIds: number[];
}

export function emptyCharacterIds(): Array<number | null> {
  return Array.from({ length: TEAM_SLOT_COUNT }, () => null);
}

export function characterIdsFromTeam(team: Team | null | undefined): Array<number | null> {
  const ids = emptyCharacterIds();
  if (!team) return ids;
  for (let index = 0; index < TEAM_SLOT_COUNT; index += 1) {
    ids[index] = team.members[index]?.characterId ?? null;
  }
  return ids;
}

/** Normalize draft for save: trim/clamp text and enforce 4 slots. */
export function normalizeTeamInput(input: {
  teamId?: number | null;
  name: string;
  note: string;
  characterIds: Array<number | null | undefined>;
}): { ok: true; value: TeamInput } | { ok: false; error: string } {
  const name = input.name.trim().slice(0, MAX_TEAM_NAME_LEN);
  if (!name) return { ok: false, error: "配队名称不能为空" };
  const note = input.note.trim().slice(0, MAX_TEAM_NOTE_LEN);
  const characterIds = emptyCharacterIds();
  const seen = new Set<number>();
  for (let index = 0; index < TEAM_SLOT_COUNT; index += 1) {
    const id = input.characterIds[index] ?? null;
    if (id == null) continue;
    if (seen.has(id)) return { ok: false, error: "同一配队内不能重复选择同一角色" };
    seen.add(id);
    characterIds[index] = id;
  }
  return {
    ok: true,
    value: {
      teamId: input.teamId ?? null,
      name,
      note,
      characterIds,
    },
  };
}

export function memberInitial(member: Pick<TeamMember, "name"> | null | undefined): string {
  return member?.name?.slice(0, 1) || "?";
}

export function gradeClass(grade?: string): string {
  if (!grade) return "grade-default";
  const upper = grade.toUpperCase();
  if (upper === "SS") return "grade-ss";
  if (upper.startsWith("S")) return "grade-s";
  if (upper.startsWith("A")) return "grade-a";
  if (upper.startsWith("B")) return "grade-b";
  if (upper.startsWith("C") || upper.startsWith("D")) return "grade-c";
  return "grade-default";
}

export function filledSlotCount(team: Pick<Team, "members">): number {
  return team.members.filter(Boolean).length;
}

function characterElement(item: Pick<CharacterListItem, "characterId" | "name" | "path">) {
  return (
    resolveCharacterCatalogue({
      characterId: item.characterId,
      name: item.name,
      path: item.path,
    })?.element ?? null
  );
}

function matchesPath(item: Pick<CharacterListItem, "path">, paths: string[]) {
  if (!paths.length) return true;
  const inventoryPath = item.path;
  const zh = pathLabel(inventoryPath);
  return paths.some((path) => path === inventoryPath || path === zh || pathLabel(path) === zh);
}

function matchesSearch(
  item: Pick<CharacterListItem, "characterId" | "name" | "path">,
  search: string,
) {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  const label = characterDisplayName({
    characterId: item.characterId,
    name: item.name,
    path: item.path,
  }).toLowerCase();
  const pathZh = pathLabel(item.path).toLowerCase();
  const element = characterElement(item)?.toLowerCase() ?? "";
  return (
    item.name.toLowerCase().includes(term) ||
    label.includes(term) ||
    pathZh.includes(term) ||
    item.path.toLowerCase().includes(term) ||
    element.includes(term)
  );
}

/** Client-side filter for the team character picker (search / path / element). */
export function filterTeamCharacters(
  items: CharacterListItem[],
  filter: TeamCharacterFilter,
): CharacterListItem[] {
  const excluded = new Set(filter.excludeIds);
  return items.filter((item) => {
    if (excluded.has(item.characterId)) return false;
    if (!matchesSearch(item, filter.search)) return false;
    if (!matchesPath(item, filter.paths)) return false;
    if (filter.elements.length) {
      const element = characterElement(item);
      if (!element || !filter.elements.includes(element)) return false;
    }
    return true;
  });
}

export function toggleFilterValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
