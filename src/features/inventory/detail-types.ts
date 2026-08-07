import type { RelicSubstatItem } from "@/types";

export interface RelicDetailData {
  itemId: number;
  setId: number;
  name: string;
  setName: string;
  slot: string;
  rarity: number;
  level: number;
  mainStat: string;
  mainStatValue: number;
  location: string;
  equippedCharacterId?: number | null;
  locked: boolean;
  discard: boolean;
  updatedAt: number;
  substats?: RelicSubstatItem[];
}
export interface LightConeDetailData {
  itemId: number;
  templateId: number;
  name: string;
  level: number;
  ascension: number;
  superimposition: number;
  location: string;
  equippedCharacterId?: number | null;
  locked: boolean;
  source: string;
  updatedAt: number;
}
export interface CharacterDetailData {
  characterId: number;
  name: string;
  path: string;
  level: number;
  ascension: number;
  eidolon: number;
  skills: Record<string, unknown>;
  traces: Record<string, unknown>;
  memosprite?: Record<string, unknown> | null;
  equippedRelics?: RelicDetailData[];
  equippedLightCone?: LightConeDetailData | null;
  abilityVersion: number;
  updatedAt: number;
}
