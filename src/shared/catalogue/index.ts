import relicsJson from "@/data/relic-sets.json";
import charactersJson from "@/data/characters.json";
import lightConesJson from "@/data/light-cones.json";
import type { CharacterCatalogue, LightConeCatalogue, RelicSetCatalogue } from "@/types";

export const relicCatalogue = relicsJson as RelicSetCatalogue;
export const characterCatalogue = charactersJson as CharacterCatalogue;
export const lightConeCatalogue = lightConesJson as LightConeCatalogue;

export const characterByName = new Map(
  characterCatalogue.characters.map((item) => [item.name, item]),
);
export const relicPieceImages = new Map(
  relicCatalogue.sets.flatMap((set) =>
    (set.pieces ?? []).map((piece) => [`${set.id}_${piece.slot}`, piece.image] as const),
  ),
);
export const lightConeById = new Map(lightConeCatalogue.lightCones.map((item) => [item.id, item]));

export const relicImage = (setId: number, slot: string): string | undefined =>
  relicPieceImages.get(`${setId}_${slot}`);
