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
  /** User-authored team compositions stored locally. */
  teams: number;
  lastSyncAt: number | null;
  protocolVersion: string;
}

export interface InventoryImportResult {
  summary: InventorySummary;
  warnings: string[];
}

export interface WebDavSettings {
  serverUrl: string;
  remotePath: string;
  username: string;
  password: string;
}

export type InventoryKind = "relic" | "lightCone" | "character";

/** Data-management sidebar mode: inventory kinds plus local team compositions. */
export type ArchiveView = InventoryKind | "team";

/** Cached build-quality summary (derived client-side, stored in SQLite). */
export interface CharacterBuildScore {
  characterId: number;
  letterGrade: string;
  potentialPct: number;
  completionPct: number;
  relicCount: number;
  /** True when scored with a saved build plan. */
  hasPlan: boolean;
  computedAt: number;
}

export interface TeamMember {
  characterId: number;
  name: string;
  path: string;
  level: number;
  /** False when the character row is missing from inventory. */
  owned: boolean;
  /** Persisted score when available. */
  score?: CharacterBuildScore | null;
}

export interface Team {
  teamId: number;
  name: string;
  note: string;
  /** Always length 4; empty slots are null. */
  members: Array<TeamMember | null>;
  createdAt: number;
  updatedAt: number;
}

export interface TeamInput {
  teamId?: number | null;
  name: string;
  note: string;
  /** Must be length 4. */
  characterIds: Array<number | null>;
}

export interface TeamFilter extends PageQuery {
  search?: string;
}

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
  superimposition?: number[];
  locked?: boolean;
  equipped?: boolean;
}

export interface CharacterFilter extends PageQuery {
  search?: string;
  names?: string[];
  path?: string[];
  minLevel?: number;
  maxLevel?: number;
  minAscension?: number;
  eidolon?: number[];
  hasBuildPlan?: boolean;
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

export interface RelicMainStatScanResult extends PagedResult<RelicListItem> {
  planCount: number;
  /** Per-slot union of main stats allowed by saved build plans. */
  allowedMainStats: Record<string, string[]>;
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
  hasBuildPlan: boolean;
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
  effectiveSubstats: string[];
  /** Optional free-text note shown on the graduation dashboard. */
  note: string;
  /**
   * Per-plan substat weights for Stat Score / Estimated TBP (0–1, typically 0.25 steps).
   * Persisted with the build plan (WebDAV-backed). Empty object → infer from effectiveSubstats.
   */
  substatWeights: Record<string, number>;
  /** Minimum relic potential % counted as quality-pass on the graduation dashboard (default 40). */
  minPotentialPct: number;
  /** Optional SPD breakpoint target for the SPD helper (0 = unset). */
  spdTarget: number;
}

export interface BuildPlanExcelImportResult {
  imported: number;
}

export interface BuildDashboardEntry {
  plan: CharacterBuildPlan;
  character: BuildDashboardCharacter;
  displayOrder: number;
  pinned: boolean;
}

/** A character whose saved build plan targets a relic or planar ornament set. */
export interface RelicSetRecommendedCharacter {
  characterId: number;
  name: string;
  mainStats: Record<string, string[]>;
  effectiveSubstats: string[];
}

export interface BuildDashboardSubstat {
  kind: string;
  key: string;
  value: number;
  count: number;
  step?: number;
}

export interface BuildDashboardRelic {
  setId: number;
  slot?: string;
  mainStat: string;
  mainStatValue: number;
  substats?: BuildDashboardSubstat[];
}

export interface BuildDashboardLightCone {
  templateId: number;
  /** 背包中的光锥名称；图鉴缺失时可用于展示。 */
  name?: string;
  level: number;
  ascension: number;
  superimposition?: number;
}

export interface BuildDashboardCharacter {
  characterId: number;
  name: string;
  level: number;
  ascension: number;
  equippedRelics?: BuildDashboardRelic[];
  equippedLightCone?: BuildDashboardLightCone | null;
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
  rarity?: number;
  /** 角色在 80 级、满突破时的未装备基础面板。 */
  baseStats?: {
    hp: number;
    attack: number;
    defense: number;
    speed: number;
    taunt: number;
  };
  /** 角色行迹中可直接计入静态面板的属性节点。 */
  traceStats?: Array<{
    id: number;
    name: string;
    stats: Array<{ key: string; value: number }>;
  }>;
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
export interface LightConeSkill {
  name: string;
  /** 叠影 1–5 对应的技能描述（已填入数值）。 */
  effects: string[];
}

export interface LightConeCatalogueEntry {
  id: number;
  name: string;
  rarity: number;
  path: string;
  /** 光锥在 80 级、满突破时的基础面板。 */
  baseStats?: {
    hp: number;
    attack: number;
    defense: number;
  };
  /** 光锥技能与各叠影效果文案，用于展示和无条件站街加成解析。 */
  skill?: LightConeSkill;
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
