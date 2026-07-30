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
  path?: string;
  minLevel?: number;
  maxLevel?: number;
  minAscension?: number;
  eidolon?: number;
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
  location: string;
  locked: boolean;
  discard: boolean;
  source: string;
  updatedAt: number;
}

export interface LightConeListItem {
  itemId: number;
  templateId: number;
  name: string;
  level: number;
  ascension: number;
  superimposition: number;
  location: string;
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

export type InventoryListItem =
  | RelicListItem
  | LightConeListItem
  | CharacterListItem;

export interface InventoryDetail {
  kind: InventoryKind;
  data: Record<string, unknown>;
}
