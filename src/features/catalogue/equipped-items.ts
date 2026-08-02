/** Inventory fields needed to render the equipped items shown in the character catalogue. */
export interface CatalogueEquippedRelic {
  itemId: number;
  setId: number;
  name: string;
  slot: string;
  level: number;
  mainStat: string;
  mainStatValue: number;
}

export interface CatalogueEquippedLightCone {
  templateId: number;
  name: string;
  level: number;
  superimposition: number;
}

export interface CatalogueCharacterEquipment {
  characterId: number;
  equippedRelics?: CatalogueEquippedRelic[];
  equippedLightCone?: CatalogueEquippedLightCone | null;
}
