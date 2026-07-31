export interface SystemCapabilities {
  platform: string;
  windowCapture: boolean;
  localOcr: boolean;
  note: string;
}

export interface OcrModelConfig {
  detectionModel: string;
  recognitionModel: string;
  characterDictionary: string;
}

export interface OcrTextRegion {
  text: string;
}

export interface OcrImageResult {
  imagePath: string;
  regions: OcrTextRegion[];
  elapsedMs: number;
}

export type DirectReadPhase =
  | "unsupported"
  | "starting"
  | "waitingForLogin"
  | "connected"
  | "syncing"
  | "ready"
  | "stopped"
  | "error";

export interface DirectReadSnapshot {
  phase: DirectReadPhase;
  message: string;
  startedAt: number | null;
  lastSyncAt: number | null;
  relics: number;
  lightCones: number;
  characters: number;
  protocolVersion: string;
  currentUid: number | null;
  incomingUid: number | null;
  requiresAccountSwitch: boolean;
}

export interface InventorySummary {
  relics: number;
  lightCones: number;
  characters: number;
  lastSyncAt: number | null;
  protocolVersion: string;
}

export interface InventoryImportResult {
  summary: InventorySummary;
  warnings: string[];
}

export type InventoryKind = "relic" | "lightCone" | "character";

export interface PageQuery {
  page: number;
  pageSize: number;
}

export interface PagedResult<T> extends PageQuery {
  items: T[];
  total: number;
}

export interface RelicFilter extends PageQuery {
  search?: string;
  slots?: string[];
  rarities?: number[];
  minLevel?: number;
  maxLevel?: number;
  mainStats?: string[];
  subStats?: string[];
  minSubstatCount?: number;
  maxSubstatCount?: number;
  locked?: boolean;
  discard?: boolean;
  equipped?: boolean;
}

export interface LightConeFilter extends PageQuery {
  search?: string;
  minLevel?: number;
  maxLevel?: number;
  minAscension?: number;
  superimposition?: number;
  locked?: boolean;
  equipped?: boolean;
}

export interface CharacterFilter extends PageQuery {
  search?: string;
  path?: string[];
  minLevel?: number;
  maxLevel?: number;
  minAscension?: number;
  eidolon?: number[];
}

export interface RelicSubstatItem {
  kind: string;
  position: number;
  key: string;
  value: number;
  count: number;
  step: number;
}

export interface RelicListItem {
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
  equippedCharacterId: number | null;
  locked: boolean;
  discard: boolean;
  source: string;
  updatedAt: number;
  substats: RelicSubstatItem[];
}

export interface LightConeListItem {
  itemId: number;
  templateId: number;
  name: string;
  level: number;
  ascension: number;
  superimposition: number;
  location: string;
  equippedCharacterId: number | null;
  locked: boolean;
  source: string;
  updatedAt: number;
}

export interface CharacterListItem {
  characterId: number;
  name: string;
  path: string;
  level: number;
  ascension: number;
  eidolon: number;
  abilityVersion: number;
  source: string;
  updatedAt: number;
}

export type InventoryListItem = RelicListItem | LightConeListItem | CharacterListItem;

export interface InventoryDetail {
  kind: InventoryKind;
  data: Record<string, unknown>;
}

export interface BuildTarget {
  statKey: string;
  target: number;
  priority: number;
  minimum: number;
}

export interface CharacterBuildPlan {
  characterId: number;
  cavernMode: "fourPiece" | "twoPlusTwo";
  cavernSetA: number;
  cavernSetB: number | null;
  planarSetId: number;
  mainStats: Record<string, string[]>;
  targets: BuildTarget[];
}

export type RelicSetKind = "cavern" | "planar";
export interface RelicSetOption {
  setId: number;
  name: string;
  kind: RelicSetKind;
}
export interface RelicSetCatalogueEntry {
  id: number;
  name: string;
  kind: RelicSetKind;
  effects: { twoPiece: string; fourPiece: string };
  image: string | null;
  pieces?: Array<{
    /** Head, Hands, Body, Feet, PlanarSphere, or LinkRope. */
    slot: string;
    image: string;
  }>;
}
export interface RelicSetCatalogue {
  schemaVersion: number;
  source: { name: string; url: string; syncedAt: string | null };
  sets: RelicSetCatalogueEntry[];
}
export interface CharacterCatalogueEntry {
  slug: string;
  name: string;
  element: string;
  path: string;
  image: string | null;
  backgroundImage?: string;
  elementIcon?: string;
  pathIcon?: string;
}
export interface CharacterCatalogue {
  schemaVersion: number;
  source: { name: string; url: string; syncedAt: string | null };
  characters: CharacterCatalogueEntry[];
}
export interface LightConeCatalogueEntry {
  id: number;
  name: string;
  rarity: number;
  path: string;
  image: string | null;
}
export interface LightConeCatalogue {
  schemaVersion: number;
  source: { name: string; url: string; syncedAt: string | null };
  lightCones: LightConeCatalogueEntry[];
}
export interface BuildProgress {
  statKey: string;
  current: number;
  target: number;
  gap: number;
  minimum: number;
  priority: number;
}
export interface BuildRelicChoice {
  itemId: number;
  name: string;
  slot: string;
  setId: number;
  mainStat: string;
  location: string;
  borrowed: boolean;
}
export interface BuildRecommendation {
  current: BuildProgress[];
  recommended: BuildRelicChoice[] | null;
  recommendedProgress: BuildProgress[] | null;
  message: string;
}
