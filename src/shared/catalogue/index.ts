import relicsJson from "@/data/relic-sets.json";
import charactersJson from "@/data/characters.json";
import lightConesJson from "@/data/light-cones.json";
import type {
  CharacterCatalogue,
  CharacterCatalogueEntry,
  LightConeCatalogue,
  RelicSetCatalogue,
} from "@/types";
import { pathLabel } from "./relic-options";

export const relicCatalogue = relicsJson as RelicSetCatalogue;
export const characterCatalogue = charactersJson as CharacterCatalogue;
export const lightConeCatalogue = lightConesJson as LightConeCatalogue;

/** Game character ID embedded in catalogue trace node IDs (`floor(traceId / 1000)`). */
export function catalogueCharacterId(entry: CharacterCatalogueEntry): number | null {
  const traceId = entry.traceStats?.[0]?.id;
  return typeof traceId === "number" ? Math.floor(traceId / 1000) : null;
}

export const characterById = new Map(
  characterCatalogue.characters.flatMap((item) => {
    const id = catalogueCharacterId(item);
    return id === null ? [] : [[id, item] as const];
  }),
);

/**
 * Name-only lookup. Ambiguous for multi-path characters (开拓者 / 三月七);
 * prefer {@link resolveCharacterCatalogue} when path or characterId is known.
 */
export const characterByName = new Map(
  characterCatalogue.characters.map((item) => [item.name, item]),
);

const characterByNamePath = new Map(
  characterCatalogue.characters.map((item) => [`${item.name}\0${item.path}`, item]),
);

export interface ResolveCharacterCatalogueInput {
  characterId?: number | null;
  name: string;
  /** Inventory English path (Destruction) or catalogue Chinese path (毁灭). */
  path?: string | null;
}

/**
 * Resolve the correct catalogue entry for multi-path protagonists.
 * Priority: characterId → name+path → name-only fallback.
 */
export function resolveCharacterCatalogue(
  input: ResolveCharacterCatalogueInput,
): CharacterCatalogueEntry | undefined {
  if (input.characterId != null) {
    const byId = characterById.get(input.characterId);
    if (byId) return byId;
  }
  if (input.path) {
    const zhPath = pathLabel(input.path);
    const byNamePath = characterByNamePath.get(`${input.name}\0${zhPath}`);
    if (byNamePath) return byNamePath;
  }
  return characterByName.get(input.name);
}

/** Display names that map to multiple path variants in the catalogue. */
const multiPathDisplayNames = new Set(
  characterCatalogue.characters
    .map((item) => item.name)
    .filter((name, _, names) => names.filter((other) => other === name).length > 1),
);

export interface CharacterDisplayNameInput {
  name: string;
  characterId?: number | null;
  /** Inventory English path (Destruction) or catalogue Chinese path (毁灭). */
  path?: string | null;
}

/**
 * List label for characters.
 * Multi-path protagonists append the path so 开拓者 / 三月七 variants stay distinct
 * (e.g. `开拓者·同谐`, `三月七·巡猎`).
 */
export function characterDisplayName(input: CharacterDisplayNameInput): string {
  const name = input.name?.trim() ?? "";
  if (!name || !multiPathDisplayNames.has(name)) return name;
  if (input.path) return `${name}·${pathLabel(input.path)}`;
  // Path suffix requires a concrete owner id or path; name-only lookup is ambiguous.
  if (input.characterId == null) return name;
  const entry = resolveCharacterCatalogue({
    characterId: input.characterId,
    name,
  });
  if (!entry?.path) return name;
  return `${name}·${pathLabel(entry.path)}`;
}

/**
 * List/detail label for equipped owner.
 * Multi-path protagonists append the path so 开拓者 / 三月七 variants stay distinct.
 */
export function equippedCharacterLabel(
  location: string,
  equippedCharacterId?: number | null,
): string {
  return characterDisplayName({
    name: location,
    characterId: equippedCharacterId,
  });
}

/** Path icon asset under `public/character-icons/paths/`. */
export function pathIconSrc(path: string): string {
  return `/character-icons/paths/${pathLabel(path)}.webp`;
}

export const relicPieceImages = new Map(
  relicCatalogue.sets.flatMap((set) =>
    (set.pieces ?? []).map((piece) => [`${set.id}_${piece.slot}`, piece.image] as const),
  ),
);
export const lightConeById = new Map(lightConeCatalogue.lightCones.map((item) => [item.id, item]));

export const relicImage = (setId: number, slot: string): string | undefined =>
  relicPieceImages.get(`${setId}_${slot}`);
