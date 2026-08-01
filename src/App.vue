<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Button from "primevue/button";

const appWindow = getCurrentWindow();
const isMaximized = ref(false);

async function minimizeWindow() {
  await appWindow.minimize();
}

async function toggleMaximize() {
  if (isMaximized.value) {
    await appWindow.unmaximize();
    isMaximized.value = false;
  } else {
    await appWindow.maximize();
    isMaximized.value = true;
  }
}

async function closeWindow() {
  await appWindow.close();
}

import Checkbox from "primevue/checkbox";
import Drawer from "primevue/drawer";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import { buildPlanApi } from "@/shared/api/build-plan";
import { captureApi } from "@/shared/api/capture";
import { directReadApi } from "@/shared/api/direct-read";
import { inventoryApi } from "@/shared/api/inventory";
import { systemApi } from "@/shared/api/system";
import { useRuntimeStore } from "@/app/stores/runtime";
import AppNavigation, { type AppView } from "@/app/AppNavigation.vue";
import ExpressPassage from "@/features/capture/ExpressPassage.vue";
import { characterSkillEntries } from "@/features/inventory/character-skills";
import { buildInventoryFilter, createInventoryFilterForm } from "@/features/inventory/filter";
import {
  calculateStandingStats,
  formatStandingStat,
  isMaxStandingEquipment,
} from "@/features/inventory/standing-stats";
import { primaryTraceNodes } from "@/features/inventory/trace-stats";
import relicCatalogueJson from "./data/relic-sets.json";
import characterCatalogueJson from "./data/characters.json";
import lightConeCatalogueJson from "./data/light-cones.json";
import type {
  CharacterFilter,
  CharacterCatalogue,
  CharacterCatalogueEntry,
  CharacterBuildPlan,
  BuildRecommendation,
  CharacterListItem,
  DirectReadSnapshot,
  InventoryDetail,
  InventoryKind,
  InventoryListItem,
  InventorySummary,
  LightConeFilter,
  LightConeCatalogue,
  LightConeListItem,
  OcrImageResult,
  OcrModelConfig,
  PagedResult,
  RelicFilter,
  RelicListItem,
  RelicSetCatalogue,
  RelicSetCatalogueEntry,
  RelicSetOption,
  SystemCapabilities,
} from "./types";

type ViewName = AppView;
type RelicDetailData = {
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
  locked: boolean;
  discard: boolean;
  updatedAt: number;
  substats?: Array<{ kind: string; key: string; value: number; count: number }>;
};
type LightConeDetailData = {
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
};
type CharacterDetailData = {
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
};

const activeView = ref<ViewName>("capture");
const capabilities = ref<SystemCapabilities | null>(null);
const { direct, summary, busy, error, notice } = storeToRefs(useRuntimeStore());

const modelConfig = ref<OcrModelConfig>({
  detectionModel: "models/text_detection.onnx",
  recognitionModel: "models/text_recognition.onnx",
  characterDictionary: "models/character_dict.txt",
});
const ocrResult = ref<OcrImageResult | null>(null);
const screenshotPreviewUrl = ref<string | null>(null);
const cropSurface = ref<HTMLElement | null>(null);
const cropDragging = ref(false);
const screenshotFullscreen = ref(false);
const cropSelection = reactive({ startX: 0, startY: 0, endX: 0, endY: 0 });
const cropBox = computed(() => ({
  left: Math.min(cropSelection.startX, cropSelection.endX),
  top: Math.min(cropSelection.startY, cropSelection.endY),
  width: Math.abs(cropSelection.endX - cropSelection.startX),
  height: Math.abs(cropSelection.endY - cropSelection.startY),
}));
const hasCropSelection = computed(() => cropBox.value.width >= 12 && cropBox.value.height >= 12);

const inventoryKind = ref<InventoryKind>("relic");
const result = ref<PagedResult<InventoryListItem>>({
  items: [],
  total: 0,
  page: 1,
  pageSize: 50,
});
const selectedIds = ref<Set<number>>(new Set());
const detail = ref<InventoryDetail | null>(null);
const detailLoading = ref(false);
const filterOpen = ref(false);
const buildOpen = ref(false);
const buildLoading = ref(false);
const buildRecommendation = ref<BuildRecommendation | null>(null);
const relicCatalogue = relicCatalogueJson as RelicSetCatalogue;
const characterCatalogue = characterCatalogueJson as CharacterCatalogue;
const lightConeCatalogue = lightConeCatalogueJson as LightConeCatalogue;
const characterAvatars = new Map(
  characterCatalogue.characters.map((character) => [character.name, character.image]),
);
const characterElements = new Map(
  characterCatalogue.characters.map((character) => [character.name, character.element]),
);
const relicPieceImages = new Map(
  relicCatalogue.sets.flatMap((set) =>
    (set.pieces || []).map((piece) => [`${set.id}_${piece.slot}`, piece.image] as const),
  ),
);
const lightConeImages = new Map(
  lightConeCatalogue.lightCones.map((lightCone) => [lightCone.id, lightCone.image]),
);
const lightConeRarities = new Map(
  lightConeCatalogue.lightCones.map((lightCone) => [lightCone.id, lightCone.rarity]),
);
const lightConePaths = new Map(
  lightConeCatalogue.lightCones.map((lightCone) => [lightCone.id, lightCone.path]),
);
const lightConeBaseStats = new Map(
  lightConeCatalogue.lightCones.map((lightCone) => [lightCone.id, lightCone.baseStats]),
);

function getDetailRelicImage(detail: RelicDetailData): string | undefined {
  return relicPieceImages.get(`${detail.setId}_${detail.slot}`);
}

const relicSetOptions = ref<RelicSetOption[]>(
  relicCatalogue.sets.map((set) => ({ setId: set.id, name: set.name, kind: set.kind })),
);
const includeEquipped = ref(false);
const buildDeleteArmed = ref(false);
const draggedTargetIndex = ref<number | null>(null);
const dragTargetIndex = ref<number | null>(null);
const buildPlan = reactive<CharacterBuildPlan>({
  characterId: 0,
  cavernMode: "fourPiece",
  cavernSetA: 0,
  cavernSetB: null,
  planarSetId: 0,
  mainStats: { Head: [], Hands: [], Body: [], Feet: [], PlanarSphere: [], LinkRope: [] },
  targets: [],
});

const filters = reactive(createInventoryFilterForm());

const substatCountOptions = [
  { label: "不限", value: "" },
  ...[0, 1, 2, 3, 4, 5].map((value) => ({ label: `${value} 次`, value })),
];

const relicSlots = [
  { value: "Head", label: "头部" },
  { value: "Hands", label: "手部" },
  { value: "Body", label: "躯干" },
  { value: "Feet", label: "脚部" },
  { value: "PlanarSphere", label: "位面球" },
  { value: "LinkRope", label: "连结绳" },
];
const relicSubStats = [
  "HP",
  "HP%",
  "ATK",
  "ATK%",
  "DEF",
  "DEF%",
  "SPD",
  "CRIT Rate",
  "CRIT DMG",
  "Effect Hit Rate",
  "Effect RES",
  "Break Effect",
];
const relicMainStats: Record<string, string[]> = {
  Head: ["HP"],
  Hands: ["ATK"],
  Body: [
    "HP%",
    "ATK%",
    "DEF%",
    "CRIT Rate",
    "CRIT DMG",
    "Outgoing Healing Boost",
    "Effect Hit Rate",
  ],
  Feet: ["HP%", "ATK%", "DEF%", "SPD"],
  PlanarSphere: [
    "HP%",
    "ATK%",
    "DEF%",
    "Physical DMG Boost",
    "Fire DMG Boost",
    "Ice DMG Boost",
    "Lightning DMG Boost",
    "Wind DMG Boost",
    "Quantum DMG Boost",
    "Imaginary DMG Boost",
  ],
  LinkRope: ["HP%", "ATK%", "DEF%", "Break Effect", "Energy Regeneration Rate"],
};
const statLabels: Record<string, string> = {
  HP: "生命值",
  "HP%": "生命百分比",
  ATK: "攻击力",
  "ATK%": "攻击百分比",
  DEF: "防御力",
  "DEF%": "防御百分比",
  SPD: "速度",
  "CRIT Rate": "暴击率",
  "CRIT DMG": "暴击伤害",
  "Effect Hit Rate": "效果命中",
  "Effect RES": "效果抵抗",
  "Break Effect": "击破特攻",
  "Outgoing Healing Boost": "治疗量加成",
  "Energy Regeneration Rate": "能量恢复效率",
  "Physical DMG Boost": "物理伤害提高",
  "Fire DMG Boost": "火属性伤害提高",
  "Ice DMG Boost": "冰属性伤害提高",
  "Lightning DMG Boost": "雷属性伤害提高",
  "Wind DMG Boost": "风属性伤害提高",
  "Quantum DMG Boost": "量子属性伤害提高",
  "Imaginary DMG Boost": "虚数属性伤害提高",
};
const cavernSetOptions = computed(() =>
  relicSetOptions.value.filter((set) => set.kind === "cavern"),
);
const planarSetOptions = computed(() =>
  relicSetOptions.value.filter((set) => set.kind === "planar"),
);
const catalogueGroups = computed(() => ({
  cavern: relicCatalogue.sets.filter((set) => set.kind === "cavern"),
  planar: relicCatalogue.sets.filter((set) => set.kind === "planar"),
}));

const availableMainStats = computed(() => {
  const slots = filters.slots.length ? filters.slots : relicSlots.map((slot) => slot.value);
  return [...new Set(slots.flatMap((slot) => relicMainStats[slot] ?? []))];
});
const catalogueTab = ref<"cavern" | "planar" | "character">("cavern");
const selectedCatalogueCharacter = ref<CharacterCatalogueEntry | null>(null);
const traceSettingsStorageKey = "starrail-auto-tools.trace-disabled.v1";
const disabledTraceNodes = ref<Record<string, number[]>>(loadDisabledTraceNodes());
const detailRelic = computed<RelicDetailData | null>(() =>
  detail.value?.kind === "relic" ? (detail.value.data as unknown as RelicDetailData) : null,
);
const detailCharacter = computed<CharacterDetailData | null>(() =>
  detail.value?.kind === "character" ? (detail.value.data as unknown as CharacterDetailData) : null,
);
const detailLightCone = computed<LightConeDetailData | null>(() =>
  detail.value?.kind === "lightCone" ? (detail.value.data as unknown as LightConeDetailData) : null,
);
const detailCharacterCatalogue = computed(() => {
  if (!detailCharacter.value) return null;
  return characterCatalogue.characters.find((character) => character.name === detailCharacter.value?.name) ?? null;
});
const detailCharacterTraceStats = computed(() => {
  return primaryTraceNodes(detailCharacterCatalogue.value?.traceStats ?? []);
});
const selectedDetailTraceStats = computed(() => {
  if (!detailCharacter.value) return [];
  return detailCharacterTraceStats.value
    .filter((trace) => traceNodeEnabled(detailCharacter.value!.characterId, trace.id))
    .flatMap((trace) => trace.stats);
});
const detailCharacterStaticSetEffects = computed(() => {
  const relics = detailCharacter.value?.equippedRelics ?? [];
  const pieceCounts = new Map<number, number>();
  for (const relic of relics) {
    pieceCounts.set(relic.setId, (pieceCounts.get(relic.setId) ?? 0) + 1);
  }
  return relicCatalogue.sets
    .filter((set) => (pieceCounts.get(set.id) ?? 0) >= 2)
    .map((set) => set.effects.twoPiece)
    .filter(Boolean);
});
const characterStandingStats = computed(() => {
  const character = detailCharacter.value;
  const catalogue = detailCharacterCatalogue.value;
  const lightCone = character?.equippedLightCone ?? null;
  if (!character || !catalogue?.baseStats) {
    return { available: false, reason: "该角色的满级基础属性尚未同步。", stats: [] };
  }
  if (!lightCone) {
    return { available: false, reason: "未装备光锥，无法汇总完整站街属性。", stats: [] };
  }
  const lightConeBase = lightConeBaseStats.get(lightCone.templateId);
  if (!lightConeBase) {
    return { available: false, reason: "该光锥的满级基础属性尚未同步。", stats: [] };
  }
  if (!isMaxStandingEquipment(character, lightCone)) {
    return { available: false, reason: "角色与已装备光锥需均为 Lv.80、满突破后展示。", stats: [] };
  }
  return {
    available: true,
    reason: "",
    stats: calculateStandingStats({
      characterBase: catalogue.baseStats,
      lightConeBase,
      relics: character.equippedRelics ?? [],
      traces: selectedDetailTraceStats.value,
      setEffects: detailCharacterStaticSetEffects.value,
    }),
  };
});
const activeFilterCount = computed(() => {
  const kind = inventoryKind.value;
  let activeFilters: any[] = [];
  if (kind === "relic") {
    activeFilters = [
      filters.slots.length,
      filters.mainStats.length,
      filters.subStats.length,
      filters.minSubstatCount,
      filters.maxSubstatCount,
      filters.locked,
      filters.discard,
      filters.equipped,
    ];
  } else if (kind === "lightCone") {
    activeFilters = [filters.superimposition.length, filters.locked, filters.equipped];
  } else if (kind === "character") {
    activeFilters = [filters.path.length, filters.eidolon.length, filters.element.length];
  }
  return activeFilters.filter(Boolean).length;
});

let unlistenDirect: UnlistenFn | undefined;
let unlistenInventory: UnlistenFn | undefined;
let detailRequestId = 0;
let targetDragPreview: HTMLElement | undefined;
let targetDragCleanup: (() => void) | undefined;

const directRunning = computed(() =>
  ["starting", "waitingForLogin", "connected", "syncing", "ready"].includes(direct.value.phase),
);

const phaseLabel = computed(() => {
  const labels: Record<DirectReadSnapshot["phase"], string> = {
    unsupported: "当前平台不可用",
    starting: "正在启动",
    waitingForLogin: "等待登录",
    connected: "已连接",
    syncing: "同步中",
    ready: "实时监听",
    stopped: "已停止",
    error: "需要处理",
  };
  return labels[direct.value.phase];
});

const phaseCode = computed(() =>
  direct.value.phase.replaceAll(/[A-Z]/g, (v) => `-${v.toLowerCase()}`),
);
const pageCount = computed(() =>
  Math.max(1, Math.ceil(result.value.total / result.value.pageSize)),
);
const allSelected = computed(
  () =>
    result.value.items.length > 0 &&
    result.value.items.every((item) => selectedIds.value.has(idFor(item))),
);

const kindTitle = computed(() => {
  if (inventoryKind.value === "relic") return "遗器档案";
  if (inventoryKind.value === "lightCone") return "光锥档案";
  return "角色档案";
});

function currentFilter(): RelicFilter | LightConeFilter | CharacterFilter {
  return buildInventoryFilter(
    inventoryKind.value,
    filters,
    result.value.page,
    result.value.pageSize,
  );
}

async function loadInitialState() {
  try {
    [capabilities.value, direct.value, summary.value] = await Promise.all([
      systemApi.capabilities(),
      directReadApi.snapshot(),
      inventoryApi.summary(),
    ]);
  } catch (cause) {
    error.value = String(cause);
  }
}

async function toggleDirectRead() {
  busy.value = true;
  error.value = "";
  try {
    direct.value = directRunning.value ? await directReadApi.stop() : await directReadApi.start();
  } catch (cause) {
    error.value = String(cause);
  } finally {
    busy.value = false;
  }
}

async function switchAccount() {
  if (!window.confirm("这会清空当前本地数据并写入新账号数据，是否继续？")) return;
  busy.value = true;
  try {
    direct.value = await directReadApi.confirmAccountSwitch();
    summary.value = await inventoryApi.summary();
    notice.value = "账号数据已切换";
  } catch (cause) {
    error.value = String(cause);
  } finally {
    busy.value = false;
  }
}

async function runOcrScreenshot() {
  busy.value = true;
  error.value = "";
  notice.value = "正在进入框选截图模式…";
  ocrResult.value = null;
  const appWindow = getCurrentWindow();
  try {
    notice.value = "正在隐藏工具箱并读取当前桌面…";
    await appWindow.hide();
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    const imageBytes = await Promise.race([
      captureApi.captureDesktop(),
      new Promise<never>((_, reject) =>
        window.setTimeout(
          () =>
            reject(
              new Error(
                "系统截图在 8 秒内没有返回；请检查 macOS 的“屏幕录制”权限，或重新启动应用后再试。",
              ),
            ),
          8000,
        ),
      ),
    ]);
    if (!imageBytes.length) throw new Error("系统截图返回了空图片");
    const image = new Blob([new Uint8Array(imageBytes)], { type: "image/png" });
    await appWindow.show();
    screenshotPreviewUrl.value = URL.createObjectURL(image);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    notice.value = "请拖拽虚线框选需要识别的区域";
    screenshotFullscreen.value = true;
    await appWindow.setFullscreen(true);
  } catch (cause) {
    await appWindow.show();
    await closeCropPicker(false);
    error.value = `无法进入截图模式：${String(cause)}`;
  } finally {
    busy.value = false;
  }
}

function cropPoint(event: PointerEvent) {
  const bounds = cropSurface.value?.getBoundingClientRect();
  if (!bounds) return { x: 0, y: 0 };
  return {
    x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
    y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)),
  };
}

function startCropSelection(event: PointerEvent) {
  const point = cropPoint(event);
  cropSelection.startX = point.x;
  cropSelection.startY = point.y;
  cropSelection.endX = point.x;
  cropSelection.endY = point.y;
  cropDragging.value = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function updateCropSelection(event: PointerEvent) {
  if (!cropDragging.value) return;
  const point = cropPoint(event);
  cropSelection.endX = point.x;
  cropSelection.endY = point.y;
}

function endCropSelection(event: PointerEvent) {
  updateCropSelection(event);
  cropDragging.value = false;
}

function resetCropSelection() {
  cropSelection.startX = 0;
  cropSelection.startY = 0;
  cropSelection.endX = 0;
  cropSelection.endY = 0;
}

async function closeCropPicker(cancelled = true) {
  if (screenshotPreviewUrl.value) URL.revokeObjectURL(screenshotPreviewUrl.value);
  screenshotPreviewUrl.value = null;
  cropDragging.value = false;
  resetCropSelection();
  if (screenshotFullscreen.value) {
    screenshotFullscreen.value = false;
    await getCurrentWindow().setFullscreen(false);
  }
  if (cancelled) notice.value = "已取消截图";
}

async function recognizeCrop() {
  const previewUrl = screenshotPreviewUrl.value;
  const surface = cropSurface.value;
  if (!previewUrl || !surface || !hasCropSelection.value) {
    error.value = "请拖拽框选需要识别的区域";
    return;
  }

  busy.value = true;
  error.value = "";
  try {
    const source = await createImageBitmap(await (await fetch(previewUrl)).blob());
    const bounds = surface.getBoundingClientRect();
    const scaleX = source.width / bounds.width;
    const scaleY = source.height / bounds.height;
    const area = cropBox.value;
    const sourceX = Math.round(area.left * scaleX);
    const sourceY = Math.round(area.top * scaleY);
    const sourceWidth = Math.max(1, Math.round(area.width * scaleX));
    const sourceHeight = Math.max(1, Math.round(area.height * scaleY));
    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    canvas
      .getContext("2d")
      ?.drawImage(
        source,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        sourceWidth,
        sourceHeight,
      );
    source.close();
    const image = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("截图裁剪失败"))),
        "image/png",
      );
    });
    await closeCropPicker(false);
    notice.value = "正在本地识别框选区域…";
    ocrResult.value = await captureApi.recognizeScreenshot(
      Array.from(new Uint8Array(await image.arrayBuffer())),
      modelConfig.value,
    );
    notice.value = "区域已识别，临时图片已清理";
  } catch (cause) {
    error.value = String(cause);
  } finally {
    busy.value = false;
  }
}

const isAppending = ref(false);

async function loadInventory(append = false) {
  if (activeView.value !== "archive") return;
  busy.value = true;
  if (append) isAppending.value = true;
  else error.value = "";
  try {
    const filter = currentFilter();
    let res;
    if (inventoryKind.value === "relic") {
      res = await inventoryApi.listRelics(filter as RelicFilter);
    } else if (inventoryKind.value === "lightCone") {
      res = await inventoryApi.listLightCones(filter as LightConeFilter);
    } else {
      res = await inventoryApi.listCharacters(filter as CharacterFilter);
    }

    if (append) {
      result.value = {
        ...res,
        items: [...result.value.items, ...res.items],
      };
    } else {
      result.value = res;
      selectedIds.value = new Set();
    }
  } catch (cause) {
    error.value = String(cause);
  } finally {
    busy.value = false;
    isAppending.value = false;
  }
}

function onTableScroll(e: Event) {
  const target = e.target as HTMLElement;
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 50) {
    if (!busy.value && result.value.items.length < result.value.total) {
      result.value.page += 1;
      void loadInventory(true);
    }
  }
}

function resetFilters() {
  Object.assign(filters, {
    search: "",
    slots: [],
    rarities: [],
    minLevel: "",
    maxLevel: "",
    mainStats: [],
    subStats: [],
    minSubstatCount: "",
    maxSubstatCount: "",
    locked: "",
    discard: "",
    equipped: "",
    minAscension: "",
    superimposition: [],
    path: [],
    eidolon: [],
    element: [],
  });
  result.value.page = 1;
  void loadInventory();
}

function applyFilters() {
  result.value.page = 1;
  filterOpen.value = false;
  void loadInventory();
}

function switchKind(kind: InventoryKind) {
  inventoryKind.value = kind;
  result.value = { items: [], total: 0, page: 1, pageSize: 50 };
  selectedIds.value = new Set();
  closeDetail();
  void loadInventory();
}

function idFor(item: InventoryListItem): number {
  return "characterId" in item ? item.characterId : item.itemId;
}

function toggleSelected(id: number) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function toggleAll() {
  selectedIds.value = allSelected.value ? new Set() : new Set(result.value.items.map(idFor));
}

async function openDetail(item: InventoryListItem) {
  const requestId = ++detailRequestId;
  detail.value = null;
  detailLoading.value = true;
  try {
    const nextDetail = await inventoryApi.detail(inventoryKind.value, idFor(item));
    if (requestId === detailRequestId) {
      detail.value = nextDetail;
    }
  } catch (cause) {
    if (requestId === detailRequestId) {
      error.value = String(cause);
    }
  } finally {
    if (requestId === detailRequestId) {
      detailLoading.value = false;
    }
  }
}

function closeDetail() {
  detailRequestId += 1;
  detail.value = null;
  detailLoading.value = false;
}

function openCharacterBaseStats(character: CharacterCatalogueEntry) {
  selectedCatalogueCharacter.value = character;
}

function closeCharacterBaseStats() {
  selectedCatalogueCharacter.value = null;
}

function loadDisabledTraceNodes(): Record<string, number[]> {
  try {
    const saved = window.localStorage.getItem(traceSettingsStorageKey);
    const parsed = saved ? JSON.parse(saved) : {};
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function traceNodeEnabled(characterId: number, traceId: number): boolean {
  return !disabledTraceNodes.value[String(characterId)]?.includes(traceId);
}

function toggleTraceNode(characterId: number, traceId: number) {
  const key = String(characterId);
  const current = new Set(disabledTraceNodes.value[key] ?? []);
  if (current.has(traceId)) current.delete(traceId);
  else current.add(traceId);
  disabledTraceNodes.value = { ...disabledTraceNodes.value, [key]: [...current] };
  window.localStorage.setItem(traceSettingsStorageKey, JSON.stringify(disabledTraceNodes.value));
}

function formatTraceStat(value: number): string {
  return Math.abs(value) < 1 ? `+${(value * 100).toFixed(1).replace(/\.0$/, "")}%` : `+${value}`;
}

function formatBaseStat(value: number): number {
  return Math.floor(value + 1e-6);
}

function closeDrawerOnEscape(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.isComposing) return;

  if (selectedCatalogueCharacter.value) {
    closeCharacterBaseStats();
    return;
  }

  if (detail.value || detailLoading.value) {
    closeDetail();
    return;
  }

  if (buildOpen.value) closeBuild();
}

function resetBuildPlan(characterId: number) {
  Object.assign(buildPlan, {
    characterId,
    cavernMode: "fourPiece",
    cavernSetA: 0,
    cavernSetB: null,
    planarSetId: 0,
    mainStats: Object.fromEntries(relicSlots.map((slot) => [slot.value, []])),
    targets: [],
  });
}

async function openBuild(item: CharacterListItem) {
  buildOpen.value = true;
  buildLoading.value = true;
  buildRecommendation.value = null;
  includeEquipped.value = false;
  buildDeleteArmed.value = false;
  try {
    const saved = await buildPlanApi.get(item.characterId);
    resetBuildPlan(item.characterId);
    if (saved) Object.assign(buildPlan, saved);
  } catch (cause) {
    error.value = String(cause);
  } finally {
    buildLoading.value = false;
  }
}

function closeBuild() {
  buildOpen.value = false;
  buildRecommendation.value = null;
  buildDeleteArmed.value = false;
}

function addBuildTarget() {
  if (buildPlan.targets.length >= 3) return;
  buildPlan.targets.push({
    statKey: "CRIT DMG",
    target: 160,
    priority: buildPlan.targets.length + 1,
    minimum: 140,
  });
}

function removeBuildTarget(index: number) {
  buildPlan.targets.splice(index, 1);
}

function copyTargetRowValues(source: HTMLElement, preview: HTMLElement) {
  const sourceFields = source.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    "input, select",
  );
  const previewFields = preview.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    "input, select",
  );
  sourceFields.forEach((field, fieldIndex) => {
    const previewField = previewFields[fieldIndex];
    if (previewField) previewField.value = field.value;
  });
}

function beginBuildTargetDrag(event: PointerEvent, index: number) {
  if (event.button !== 0) return;
  event.preventDefault();
  targetDragCleanup?.();
  draggedTargetIndex.value = index;
  dragTargetIndex.value = index;
  const row = (event.currentTarget as HTMLElement).closest(".target-row") as HTMLElement | null;
  if (!row) return;
  const preview = row.cloneNode(true) as HTMLElement;
  const bounds = row.getBoundingClientRect();
  preview.classList.add("target-drag-preview");
  // The preview is rendered outside the grid, so it needs an explicit trailing
  // allowance for its own padding and the remove action.
  preview.style.width = `${bounds.width + 56}px`;
  copyTargetRowValues(row, preview);
  document.body.append(preview);
  targetDragPreview = preview;
  const offsetX = Math.min(48, Math.max(16, event.clientX - bounds.left));
  const offsetY = Math.min(20, Math.max(12, event.clientY - bounds.top));
  const move = (moveEvent: PointerEvent) => {
    const previewBounds = preview.getBoundingClientRect();
    const left = Math.max(
      12,
      Math.min(moveEvent.clientX - offsetX, window.innerWidth - previewBounds.width - 12),
    );
    const top = Math.max(
      12,
      Math.min(moveEvent.clientY - offsetY, window.innerHeight - previewBounds.height - 12),
    );
    preview.style.left = `${left}px`;
    preview.style.top = `${top}px`;
    const target = document
      .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
      ?.closest<HTMLElement>(".target-row");
    const targetIndex = Number(target?.dataset.targetIndex);
    if (!Number.isNaN(targetIndex)) dragTargetIndex.value = targetIndex;
  };
  const finish = () => {
    const from = draggedTargetIndex.value;
    const to = dragTargetIndex.value;
    draggedTargetIndex.value = null;
    dragTargetIndex.value = null;
    targetDragPreview?.remove();
    targetDragPreview = undefined;
    targetDragCleanup = undefined;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
    if (from === null || to === null || from === to) return;
    const [target] = buildPlan.targets.splice(from, 1);
    buildPlan.targets.splice(to, 0, target);
  };
  targetDragCleanup = finish;
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish, { once: true });
  window.addEventListener("pointercancel", finish, { once: true });
  move(event);
}

async function saveBuildPlan() {
  if (!buildPlan.characterId || !buildPlan.targets.length) {
    error.value = "请至少设置一条属性目标";
    return;
  }
  buildLoading.value = true;
  try {
    buildPlan.targets.forEach((target, index) => {
      target.priority = index + 1;
    });
    await buildPlanApi.save(JSON.parse(JSON.stringify(buildPlan)));
    notice.value = "毕业方案已保存";
    await calculateBuild();
  } catch (cause) {
    error.value = String(cause);
  } finally {
    buildLoading.value = false;
  }
}

async function calculateBuild() {
  buildLoading.value = true;
  try {
    buildRecommendation.value = await buildPlanApi.recommend(
      buildPlan.characterId,
      includeEquipped.value,
    );
  } catch (cause) {
    error.value = String(cause);
  } finally {
    buildLoading.value = false;
  }
}

async function deleteBuildPlan() {
  if (!buildPlan.characterId) return;
  if (!buildDeleteArmed.value) {
    buildDeleteArmed.value = true;
    notice.value = "再次点击“删除方案”确认删除";
    return;
  }
  buildLoading.value = true;
  try {
    await buildPlanApi.delete(buildPlan.characterId);
    resetBuildPlan(buildPlan.characterId);
    buildRecommendation.value = null;
    buildDeleteArmed.value = false;
    notice.value = "毕业方案已删除";
  } catch (cause) {
    error.value = String(cause);
  } finally {
    buildLoading.value = false;
  }
}

function progressPercent(progress: { current: number; target: number }) {
  return Math.min(100, Math.round((progress.current / Math.max(progress.target, 1)) * 100));
}

async function deleteSelected() {
  const ids = [...selectedIds.value];
  if (!ids.length) return;
  if (
    !window.confirm(
      `确定删除选中的 ${ids.length} 条本地记录？下次完整同步时，游戏中仍存在的数据会恢复。`,
    )
  )
    return;
  busy.value = true;
  try {
    await inventoryApi.deleteItems(inventoryKind.value, ids);
    summary.value = await inventoryApi.summary();
    await loadInventory();
    notice.value = `已删除 ${ids.length} 条本地记录`;
  } catch (cause) {
    error.value = String(cause);
  } finally {
    busy.value = false;
  }
}

async function clearCurrent() {
  const label =
    inventoryKind.value === "relic"
      ? "遗器"
      : inventoryKind.value === "lightCone"
        ? "光锥"
        : "角色";
  if (!window.confirm(`确定清空全部${label}本地记录？下次完整同步时会从游戏恢复。`)) return;
  busy.value = true;
  try {
    summary.value = await inventoryApi.clear(inventoryKind.value);
    await loadInventory();
    notice.value = `${label}本地记录已清空`;
  } catch (cause) {
    error.value = String(cause);
  } finally {
    busy.value = false;
  }
}

async function clearAll() {
  if (
    !window.confirm(
      "确定清空遗器、光锥、角色及当前账号标识？下次完整同步时，游戏中仍存在的数据会重新录入。",
    )
  )
    return;
  busy.value = true;
  try {
    summary.value = await inventoryApi.clear(null);
    direct.value = await directReadApi.snapshot();
    await loadInventory();
    notice.value = "全部本地数据已清空";
  } catch (cause) {
    error.value = String(cause);
  } finally {
    busy.value = false;
  }
}

async function exportData() {
  busy.value = true;
  try {
    const path = await inventoryApi.export();
    if (path) notice.value = `数据已导出：${path}`;
  } catch (cause) {
    error.value = String(cause);
  } finally {
    busy.value = false;
  }
}

async function importData() {
  busy.value = true;
  try {
    const imported = await inventoryApi.import();
    if (imported) {
      summary.value = imported.summary;
      await loadInventory();
      notice.value = `已导入 ${imported.summary.relics} 件遗器、${imported.summary.lightCones} 件光锥、${imported.summary.characters} 名角色${imported.warnings.length ? `；${imported.warnings.join("、")}` : ""}`;
    }
  } catch (cause) {
    error.value = String(cause);
  } finally {
    busy.value = false;
  }
}

function goPage(page: number) {
  if (page < 1 || page > pageCount.value) return;
  result.value.page = page;
  void loadInventory();
}

function formatTime(value: number | null): string {
  if (!value) return "尚未同步";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function slotLabel(slot: string): string {
  const slots: Record<string, string> = {
    Head: "头部",
    Hands: "手部",
    Body: "躯干",
    Feet: "脚部",
    PlanarSphere: "位面球",
    LinkRope: "连结绳",
  };
  return slots[slot] ?? slot;
}

function statLabel(stat: string): string {
  return statLabels[stat] ?? stat;
}

function formatStatValue(stat: string, value: number): string {
  const percentStats = new Set([
    "HP%",
    "ATK%",
    "DEF%",
    "CRIT Rate",
    "CRIT DMG",
    "Effect Hit Rate",
    "Effect RES",
    "Break Effect",
    "Outgoing Healing Boost",
    "Energy Regeneration Rate",
    "Physical DMG Boost",
    "Fire DMG Boost",
    "Ice DMG Boost",
    "Lightning DMG Boost",
    "Wind DMG Boost",
    "Quantum DMG Boost",
    "Imaginary DMG Boost",
  ]);
  return `${value.toFixed(1)}${percentStats.has(stat) ? "%" : ""}`;
}

function pathLabel(path: string): string {
  const paths: Record<string, string> = {
    Destruction: "毁灭",
    Hunt: "巡猎",
    Erudition: "智识",
    Harmony: "同谐",
    Nihility: "虚无",
    Preservation: "存护",
    Abundance: "丰饶",
    Remembrance: "记忆",
  };
  return paths[path] ?? path;
}

function pathIcon(path: string): string {
  const icons: Record<string, string> = {
    Destruction: "⚔",
    Hunt: "◎",
    Erudition: "✧",
    Harmony: "🎵",
    Nihility: "🌙",
    Preservation: "⛨",
    Abundance: "✿",
    Remembrance: "❄",
  };
  return icons[path] ?? "✧";
}

const avatarColors = ["#1ea2e8", "#e84a4a", "#8740e5", "#33b061", "#f0a21d", "#e0427f"];
function avatarColor(name: string): string {
  if (!name) return avatarColors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function characterAvatar(name: string): string | null {
  return characterAvatars.get(name) ?? null;
}

function getCharacterElement(name: string): string | null {
  return characterElements.get(name) ?? null;
}

function relicPieceImage(item: RelicListItem): string | null {
  return relicPieceImages.get(`${item.setId}_${item.slot}`) ?? null;
}

function lightConeImage(item: LightConeListItem): string | null {
  return lightConeImages.get(item.templateId) ?? null;
}

function itemTitle(item: InventoryListItem): string {
  return item.name;
}

function detailJson(): string {
  return detail.value ? JSON.stringify(detail.value.data, null, 2) : "";
}

watch(activeView, (view) => {
  if (view === "archive") {
    result.value.page = 1;
    void loadInventory();
  }
});

watch(availableMainStats, (options) => {
  filters.mainStats = filters.mainStats.filter((stat) => options.includes(stat));
});

onMounted(async () => {
  window.addEventListener("keydown", closeDrawerOnEscape);
  await loadInitialState();
  unlistenDirect = await listen<DirectReadSnapshot>("direct-read://status", (event) => {
    direct.value = event.payload;
  });
  unlistenInventory = await listen<InventorySummary>("inventory://changed", (event) => {
    summary.value = event.payload;
    if (activeView.value === "archive") void loadInventory();
  });
});

onUnmounted(() => {
  window.removeEventListener("keydown", closeDrawerOnEscape);
  unlistenDirect?.();
  unlistenInventory?.();
  targetDragCleanup?.();
});
</script>

<template>
  <div class="app-stage">
    <div class="orbit orbit-one" />
    <div class="orbit orbit-two" />

    <main class="app-shell">
      <div class="shell-header" data-tauri-drag-region="deep">
        <header class="topbar">
          <div class="brand">
            <img src="/logo/android-chrome-192x192.png" alt="Logo" class="brand-logo" />
            <div>
              <p class="eyebrow">STARRAIL · AUTO TOOLS</p>
              <h1>星穹数据航站</h1>
            </div>
          </div>
          <div class="topbar-right" style="-webkit-app-region: no-drag">
            <div class="window-controls">
              <button class="win-btn minimize" @click="minimizeWindow" title="最小化">
                <svg viewBox="0 0 10 10" width="10" height="10">
                  <rect y="4.5" width="10" height="1" fill="currentColor" />
                </svg>
              </button>
              <button
                class="win-btn maximize"
                @click="toggleMaximize"
                :title="isMaximized ? '还原' : '最大化'"
              >
                <svg v-if="!isMaximized" viewBox="0 0 10 10" width="10" height="10">
                  <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
                </svg>
                <svg v-else viewBox="0 0 10 10" width="10" height="10">
                  <rect x="2" y="0.5" width="7.5" height="7.5" fill="none" stroke="currentColor" />
                  <rect x="0.5" y="2" width="7.5" height="7.5" fill="none" stroke="currentColor" />
                </svg>
              </button>
              <button class="win-btn close" @click="closeWindow" title="关闭">
                <svg viewBox="0 0 10 10" width="10" height="10">
                  <line
                    x1="0.5"
                    y1="0.5"
                    x2="9.5"
                    y2="9.5"
                    stroke="currentColor"
                    stroke-width="1"
                  />
                  <line
                    x1="9.5"
                    y1="0.5"
                    x2="0.5"
                    y2="9.5"
                    stroke="currentColor"
                    stroke-width="1"
                  />
                </svg>
              </button>
            </div>
          </div>
        </header>
      </div>

      <AppNavigation v-model:active-view="activeView" :summary="summary" />

      <section v-if="activeView === 'capture'" class="capture-workspace">
        <article class="panel direct-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">GAME DATA SYNC</p>
              <h2>游戏数据直读</h2>
              <p class="panel-description">
                在进入游戏前开启监听，登录后自动归档遗器、光锥与角色。
              </p>
            </div>
          </div>

          <div :class="['signal-vessel', { running: directRunning }]">
            <div class="nebula nebula-1"></div>
            <div class="nebula nebula-2"></div>
            <div class="nebula nebula-3"></div>

            <div class="stellar-bg">
              <div class="star-far sf1"></div>
              <div class="star-far sf2"></div>
              <div class="star-far sf3"></div>
              <div class="star-far sf4"></div>
              <div class="star-far sf5"></div>
              <div class="star-far sf6"></div>
              <div class="star-far sf7"></div>
              <div class="star-far sf8"></div>
              <div class="star-far sf9"></div>
              <div class="star-far sf10"></div>

              <div class="star s1"></div>
              <div class="star s2"></div>
              <div class="star s3"></div>
              <div class="star s4"></div>
              <div class="star s5"></div>

              <div class="star-bright sb1"></div>
              <div class="star-bright sb2"></div>
              <div class="star-bright sb3"></div>

              <div class="grid-lines"></div>

              <div class="meteor m1"></div>
              <div class="meteor m2"></div>
              <div class="meteor m3"></div>
            </div>

            <ExpressPassage />

            <div class="orbit-system">
              <div class="orbit-track track-inner">
                <div class="satellite sat-march7"></div>
              </div>
              <div class="orbit-track track-middle">
                <div class="satellite sat-danheng"></div>
                <div class="satellite sat-himeko"></div>
              </div>
              <div class="orbit-track track-outer">
                <div class="satellite sat-welt"></div>
                <div class="satellite sat-bronya"></div>
                <div class="satellite sat-seele"></div>
              </div>

              <div class="astral-core">
                <div class="core-diamond" aria-label="数据星体">
                  <img src="/illustrations/soft-planet-core.png" alt="" class="planet-core-image" />
                </div>
              </div>
            </div>

            <div class="visual-status">
              <span :class="['status-dot', { pulse: directRunning }]"></span>
              <span class="status-text">{{
                direct.phase === "ready" ? "LIVE" : direct.phase.toUpperCase()
              }}</span>
            </div>
          </div>

          <div class="capture-counts">
            <div>
              <span>遗器</span><b>{{ direct.relics }}</b
              ><small>RELICS</small>
            </div>
            <div>
              <span>光锥</span><b>{{ direct.lightCones }}</b
              ><small>LIGHT CONES</small>
            </div>
            <div>
              <span>角色</span><b>{{ direct.characters }}</b
              ><small>CHARACTERS</small>
            </div>
          </div>

          <div v-if="direct.requiresAccountSwitch" class="account-warning">
            <div>
              <strong>检测到不同账号</strong>
              <p>当前数据与本次登录不一致。切换将清空现有本地档案。</p>
            </div>
            <Button type="button" severity="danger" :disabled="busy" @click="switchAccount"
              >确认切换</Button
            >
          </div>

          <Button
            class="primary-action"
            :disabled="busy || direct.phase === 'unsupported'"
            @click="toggleDirectRead"
          >
            <span class="action-symbol" aria-hidden="true">
              <span v-if="directRunning">■</span>
              <svg
                v-else
                t="1785488611476"
                class="icon"
                viewBox="0 0 1024 1024"
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                p-id="24598"
                width="14"
                height="14"
              >
                <path
                  d="M893.035 463.821679C839.00765 429.699141 210.584253 28.759328 179.305261 8.854514 139.495634-16.737389 99.686007 17.385148 99.686007 57.194775v909.934329c0 45.496716 42.653172 68.245075 76.775709 48.340262 45.496716-28.435448 676.763657-429.375262 716.573284-454.967165 34.122537-22.748358 34.122537-76.775709 0-96.680522z"
                  fill="currentColor"
                  p-id="24599"
                ></path>
              </svg>
            </span>
            <span class="action-text-wrapper">
              <small>GAME DATA SYNC</small>
              {{ directRunning ? "停止实时监听" : "启动游戏数据直读" }}
            </span>
          </Button>
          <p class="privilege-note">
            游戏数据直读仅支持 Windows；启动后请从游戏的登录界面重新登录。
          </p>
        </article>

        <div class="capture-side">
          <article class="panel sync-panel">
            <div class="panel-heading compact">
              <div>
                <p class="eyebrow">DATA MANAGEMENT</p>
                <h2>数据管理</h2>
              </div>
              <span class="record-dot" />
            </div>
            <div class="sync-ledger">
              <div>
                <span>最近同步</span><strong>{{ formatTime(summary.lastSyncAt) }}</strong>
              </div>
              <div>
                <span>已归档数据</span
                ><strong>{{ summary.relics + summary.lightCones + summary.characters }} 条</strong>
              </div>
            </div>
            <Button class="capture-action-btn" type="button" :disabled="busy" @click="exportData">
              <svg
                class="crop-icon"
                viewBox="0 0 1024 1024"
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                width="1.2em"
                height="1.2em"
              >
                <path
                  d="M0 841.142857m66.742857 0l890.514286 0q66.742857 0 66.742857 66.742857l0 49.371429q0 66.742857-66.742857 66.742857l-890.514286 0q-66.742857 0-66.742857-66.742857l0-49.371429q0-66.742857 66.742857-66.742857Z"
                  fill="currentColor"
                ></path>
                <path
                  d="M900.937143 249.234286L600.137143 3.84a16.457143 16.457143 0 0 0-26.88 12.617143v91.428571a16.64 16.64 0 0 1-14.994286 16.274286c-389.485714 38.4-438.857143 358.4-441.234286 509.805714a16.457143 16.457143 0 0 0 31.268572 7.314286c73.142857-150.674286 227.84-230.4 407.771428-237.714286a16.64 16.64 0 0 1 17.188572 16.64v88.137143a16.457143 16.457143 0 0 0 26.88 12.8L900.937143 274.285714a16.64 16.64 0 0 0 0-25.051428z"
                  fill="currentColor"
                ></path>
              </svg>
              <span>导出数据</span>
            </Button>
          </article>

          <article class="panel ocr-panel">
            <div class="panel-heading compact">
              <div>
                <p class="eyebrow">SCREENSHOT RECOGNITION</p>
                <h2>截图识别</h2>
              </div>
              <span class="local-badge">本地识别</span>
            </div>
            <div v-if="ocrResult" class="ocr-output">
              <div class="output-meta">
                <span>{{ ocrResult.regions.length }} 个文本区域</span>
                <span>{{ ocrResult.elapsedMs }} ms</span>
              </div>
              <p v-for="(region, index) in ocrResult.regions" :key="index">
                {{ region.text }}
              </p>
            </div>
            <div v-else class="empty-output">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="empty-image-icon"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              <p>识别结果仅供核对</p>
              <small>点击下方按钮开始截图</small>
            </div>

            <Button class="capture-action-btn" :disabled="busy" @click="runOcrScreenshot">
              <svg
                class="crop-icon"
                viewBox="0 0 1024 1024"
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                width="1.2em"
                height="1.2em"
              >
                <path
                  d="M119.579981 119.560026l185.746448 0c16.074094 0 29.283953-13.134135 29.283953-29.322839 0-16.303314-13.113669-29.321816-29.283953-29.321816l-215.107149 0c-8.037047 0-15.34857 3.282766-20.655436 8.590656-5.383614 5.307889-8.629541 12.619412-8.629541 20.694321L60.934303 305.306474c0 16.074094 13.134135 29.283953 29.321816 29.283953 16.303314 0 29.322839-13.114692 29.322839-29.283953L119.578957 119.560026zM901.51076 119.560026 715.764312 119.560026c-16.093537 0-29.283953-13.134135-29.283953-29.322839 0-16.303314 13.114692-29.321816 29.283953-29.321816l215.107149 0c8.037047 0 15.34857 3.282766 20.655436 8.590656 5.384637 5.307889 8.629541 12.619412 8.629541 20.694321L960.156438 305.306474c0 16.074094-13.134135 29.283953-29.321816 29.283953-16.303314 0-29.322839-13.114692-29.322839-29.283953L901.511783 119.560026zM119.579981 901.489782l185.746448 0c16.074094 0 29.283953 13.133112 29.283953 29.321816 0 16.303314-13.113669 29.321816-29.283953 29.321816l-215.107149 0c-8.037047 0-15.34857-3.28379-20.655436-8.590656-5.383614-5.306866-8.629541-12.619412-8.629541-20.694321L60.934303 715.744357c0-16.075117 13.134135-29.286 29.321816-29.286 16.303314 0 29.322839 13.114692 29.322839 29.286L119.578957 901.489782zM901.51076 901.489782 715.764312 901.489782c-16.093537 0-29.283953 13.133112-29.283953 29.321816 0 16.303314 13.114692 29.321816 29.283953 29.321816l215.107149 0c8.037047 0 15.34857-3.28379 20.655436-8.590656 5.384637-5.306866 8.629541-12.619412 8.629541-20.694321L960.156438 715.744357c0-16.075117-13.134135-29.286-29.321816-29.286-16.303314 0-29.322839 13.114692-29.322839 29.286L901.511783 901.489782z"
                  fill="currentColor"
                ></path>
              </svg>
              <span>{{ busy ? "正在截图 / 识别" : "截图并框选" }}</span>
            </Button>
          </article>
        </div>
      </section>

      <section v-else-if="activeView === 'archive'" class="archive-workspace">
        <aside class="panel archive-sidebar">
          <p class="eyebrow">DATA MANAGEMENT</p>
          <h2>数据管理</h2>
          <p class="sidebar-copy">结构化索引为后续遗器评分与配装分析准备。</p>
          <div class="kind-switcher">
            <button
              v-for="entry in [
                { kind: 'relic', label: '遗器', code: 'RELIC', count: summary.relics },
                { kind: 'lightCone', label: '光锥', code: 'CONE', count: summary.lightCones },
                { kind: 'character', label: '角色', code: 'AVATAR', count: summary.characters },
              ]"
              :key="entry.kind"
              :class="{ active: inventoryKind === entry.kind }"
              type="button"
              @click="switchKind(entry.kind as InventoryKind)"
            >
              <span
                ><small>{{ entry.code }}</small
                >{{ entry.label }}</span
              >
              <b>{{ entry.count }}</b>
            </button>
          </div>
          <div class="archive-meta">
            <span>最近同步</span><strong>{{ formatTime(summary.lastSyncAt) }}</strong>
          </div>
          <Button class="capture-action-btn" type="button" :disabled="busy" @click="exportData">
            <svg
              class="crop-icon"
              viewBox="0 0 1024 1024"
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              width="1.2em"
              height="1.2em"
            >
              <path
                d="M0 841.142857m66.742857 0l890.514286 0q66.742857 0 66.742857 66.742857l0 49.371429q0 66.742857-66.742857 66.742857l-890.514286 0q-66.742857 0-66.742857-66.742857l0-49.371429q0-66.742857 66.742857-66.742857Z"
                fill="currentColor"
              ></path>
              <path
                d="M900.937143 249.234286L600.137143 3.84a16.457143 16.457143 0 0 0-26.88 12.617143v91.428571a16.64 16.64 0 0 1-14.994286 16.274286c-389.485714 38.4-438.857143 358.4-441.234286 509.805714a16.457143 16.457143 0 0 0 31.268572 7.314286c73.142857-150.674286 227.84-230.4 407.771428-237.714286a16.64 16.64 0 0 1 17.188572 16.64v88.137143a16.457143 16.457143 0 0 0 26.88 12.8L900.937143 274.285714a16.64 16.64 0 0 0 0-25.051428z"
                fill="currentColor"
              ></path>
            </svg>
            <span>导出数据</span>
          </Button>
          <Button class="capture-action-btn" type="button" :disabled="busy" @click="importData">
            <svg
              class="crop-icon"
              viewBox="0 0 1024 1024"
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              width="1.2em"
              height="1.2em"
            >
              <path
                d="M0 841.264833m66.698336 0l889.920264 0q66.698336 0 66.698336 66.698336l0 49.338495q0 66.698336-66.698336 66.698336l-889.920264 0q-66.698336 0-66.698336-66.698336l0-49.338495q0-66.698336 66.698336-66.698336Z"
                fill="currentColor"
              ></path>
              <path
                d="M571.412868 698.000462L798.18721 420.973948a19.187193 19.187193 0 0 0-14.984284-31.430448h-99.590666C683.61226 66.102254 395.987107 8.357941 240.84495 0.683064a18.273517 18.273517 0 0 0-10.050434 36.547033c115.30589 61.947222 166.106267 167.202678 172.136528 332.212534A19.187193 19.187193 0 0 1 383.743851 388.812559h-79.672533a19.187193 19.187193 0 0 0-14.801548 32.161389l226.774342 277.757455a36.547033 36.547033 0 0 0 55.368756-0.730941z"
                fill="currentColor"
              ></path>
            </svg>
            <span>导入 JSON</span>
          </Button>
        </aside>

        <article class="panel archive-main">
          <header class="archive-heading">
            <div>
              <p class="eyebrow">FILTER RESULTS</p>
              <h2>{{ kindTitle }}</h2>
            </div>
            <div class="archive-actions" style="align-items: center">
              <label class="quick-search">
                <span class="visually-hidden">关键词</span>
                <svg viewBox="0 0 1024 1024">
                  <path
                    d="M909.6 854.5L649.9 594.8C690.2 542.7 712 479 712 412c0-80.2-31.3-155.6-87.9-212.1-56.6-56.7-132-87.9-212.1-87.9s-155.5 31.3-212.1 87.9C143.2 256.5 112 331.8 112 412c0 80.1 31.3 155.5 87.9 212.1C256.5 680.8 331.8 712 412 712c67 0 130.6-21.8 182.7-62l259.7 259.6a40.2 40.2 0 0 0 56.9 0l0.3-0.3a40.2 40.2 0 0 0-2-54.8zM412 640c-125.9 0-228-102.1-228-228S286.1 184 412 184s228 102.1 228 228-102.1 228-228 228z"
                    fill="currentColor"
                  ></path>
                </svg>
                <InputText
                  v-model="filters.search"
                  placeholder="搜索名称或套装"
                  @keyup.enter="applyFilters"
                />
              </label>
              <Button class="filter-toggle" type="button" outlined @click="filterOpen = true">
                <svg viewBox="0 0 1024 1024" width="1em" height="1em">
                  <path
                    d="M790.698667 171.690667A60.0064 60.0064 0 0 0 735.744 136.533333h-539.306667c-23.893333 0-45.056 13.482667-55.125333 35.157334-10.069333 21.674667-6.826667 46.421333 8.533333 64.682666L339.626667 461.824v301.738667c0 28.501333 16.896 54.101333 43.178666 65.194666l136.021334 58.197334c6.656 2.901333 13.653333 4.266667 20.821333 4.266666 10.24 0 20.309333-2.901333 29.013333-8.704a52.565333 52.565333 0 0 0 23.722667-44.032V461.824l189.781333-225.450667c15.36-18.261333 18.602667-43.008 8.533334-64.682666zM524.117333 436.906667v378.026666L409.6 766.122667c-1.024-0.512-1.706667-1.365333-1.706667-2.56V436.906667L212.650667 204.8h507.050666L524.117333 436.906667zM853.333333 745.130667h-110.592c-18.773333 0-34.133333 15.36-34.133333 34.133333s15.36 34.133333 34.133333 34.133333H853.333333c18.773333 0 34.133333-15.36 34.133334-34.133333s-15.36-34.133333-34.133334-34.133333zM853.333333 597.504h-110.592c-18.773333 0-34.133333 15.36-34.133333 34.133333s15.36 34.133333 34.133333 34.133334H853.333333c18.773333 0 34.133333-15.36 34.133334-34.133334s-15.36-34.133333-34.133334-34.133333z"
                    fill="currentColor"
                  ></path>
                  <path
                    d="M708.608 484.181333c0 18.773333 15.36 34.133333 34.133333 34.133334H853.333333c18.773333 0 34.133333-15.36 34.133334-34.133334s-15.36-34.133333-34.133334-34.133333h-110.592a34.133333 34.133333 0 0 0-34.133333 34.133333z"
                    fill="currentColor"
                  ></path>
                </svg>
                <span>筛选</span>
                <b v-if="activeFilterCount">{{ activeFilterCount }}</b>
              </Button>
              <Button
                v-if="activeFilterCount"
                class="clear-filter"
                type="button"
                text
                @click="resetFilters"
                >清除筛选</Button
              >
              <span class="toolbar-spacer"></span>
              <span class="result-count">{{ result.total }} 条记录</span>
            </div>
          </header>

          <Drawer v-model:visible="filterOpen" position="right" class="filter-drawer">
            <form @submit.prevent="applyFilters">
              <header class="filter-drawer-heading">
                <div class="filter-drawer-title-row">
                  <h2>筛选条件</h2>
                  <Button class="filter-reset-btn" type="button" text @click="resetFilters">
                    <svg viewBox="0 0 24 24" width="1.2em" height="1.2em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="1 4 1 10 7 10"></polyline>
                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                    </svg>
                    重置
                  </Button>
                </div>
                <small>可多选 · 未选即不限</small>
              </header>
              <div class="filter-scroll">
                <template v-if="inventoryKind === 'relic'">
                  <fieldset class="filter-group filter-group-wide">
                    <legend>部位 <em>可多选</em></legend>
                    <div class="filter-chips">
                      <label v-for="slot in relicSlots" :key="slot.value" class="filter-chip">
                        <input
                          v-model="filters.slots"
                          type="checkbox"
                          :value="slot.value"
                        />
                        <span>
                          {{ slot.label }}
                          <svg v-if="filters.slots.includes(slot.value)" class="filter-chip-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </span>
                      </label>
                    </div>
                  </fieldset>

                  <fieldset class="filter-group filter-group-wide">
                    <legend>主词条 <em>随部位更新 · 可多选</em></legend>
                    <div class="filter-chips">
                      <label v-for="stat in availableMainStats" :key="stat" class="filter-chip">
                        <input v-model="filters.mainStats" type="checkbox" :value="stat" />
                        <span>
                          {{ statLabel(stat) }}
                          <svg v-if="filters.mainStats.includes(stat)" class="filter-chip-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </span>
                      </label>
                    </div>
                  </fieldset>
                  <fieldset class="filter-group filter-group-wide">
                    <legend>副词条 <em>可多选</em></legend>
                    <div class="filter-chips">
                      <label v-for="stat in relicSubStats" :key="stat" class="filter-chip">
                        <input v-model="filters.subStats" type="checkbox" :value="stat" />
                        <span>
                          {{ statLabel(stat) }}
                          <svg v-if="filters.subStats.includes(stat)" class="filter-chip-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </span>
                      </label>
                    </div>
                  </fieldset>
                  <fieldset class="filter-group filter-group-wide">
                    <legend>副词条强化次数</legend>
                    <div class="filter-range">
                      <label
                        ><span>最少</span
                        ><Select
                          v-model="filters.minSubstatCount"
                          :options="substatCountOptions"
                          option-label="label"
                          option-value="value"
                          placeholder="不限"
                      /></label>
                      <label
                        ><span>最多</span
                        ><Select
                          v-model="filters.maxSubstatCount"
                          :options="substatCountOptions"
                          option-label="label"
                          option-value="value"
                          placeholder="不限"
                      /></label>
                    </div>
                  </fieldset>
                  <label
                    ><span>锁定</span>
                    <Select
                      v-model="filters.locked"
                      :options="[
                        { label: '全部', value: '' },
                        { label: '已锁定', value: 'true' },
                        { label: '未锁定', value: 'false' },
                      ]"
                      option-label="label"
                      option-value="value"
                      placeholder="全部"
                    />
                  </label>
                  <label
                    ><span>弃置</span>
                    <Select
                      v-model="filters.discard"
                      :options="[
                        { label: '全部', value: '' },
                        { label: '已标记', value: 'true' },
                        { label: '未标记', value: 'false' },
                      ]"
                      option-label="label"
                      option-value="value"
                      placeholder="全部"
                    />
                  </label>
                </template>
                <template v-else-if="inventoryKind === 'lightCone'">
                  <fieldset class="filter-group filter-group-wide">
                    <legend>叠影 <a href="#" class="filter-select-all" @click.prevent="filters.superimposition = [1, 2, 3, 4, 5]">全选</a></legend>
                    <div class="filter-chips filter-grid-4">
                      <label v-for="s in 5" :key="s" class="filter-chip">
                        <input v-model="filters.superimposition" type="checkbox" :value="s" />
                        <span>
                          {{ s }} 阶
                          <svg v-if="filters.superimposition.includes(s)" class="filter-chip-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </span>
                      </label>
                    </div>
                  </fieldset>
                  <label
                    ><span>锁定</span>
                    <Select
                      v-model="filters.locked"
                      :options="[
                        { label: '全部', value: '' },
                        { label: '已锁定', value: 'true' },
                        { label: '未锁定', value: 'false' },
                      ]"
                      option-label="label"
                      option-value="value"
                      placeholder="全部"
                    />
                  </label>
                </template>
                <template v-else>
                  <fieldset class="filter-group filter-group-wide">
                    <legend>命途 <em class="filter-count">{{ filters.path.length || 8 }} 个</em></legend>
                    <div class="filter-chips filter-grid-3">
                      <label
                        v-for="path in [
                          { label: '毁灭', value: 'Destruction' },
                          { label: '巡猎', value: 'Hunt' },
                          { label: '智识', value: 'Erudition' },
                          { label: '同谐', value: 'Harmony' },
                          { label: '虚无', value: 'Nihility' },
                          { label: '存护', value: 'Preservation' },
                          { label: '丰饶', value: 'Abundance' },
                          { label: '记忆', value: 'Remembrance' },
                        ]"
                        :key="path.value"
                        class="filter-chip filter-path-chip"
                      >
                        <input v-model="filters.path" type="checkbox" :value="path.value" />
                        <span>
                          <img
                            :src="`/character-icons/paths/${path.label}.webp`"
                            class="filter-chip-img"
                            alt=""
                          />
                          {{ path.label }}
                          <svg v-if="filters.path.includes(path.value)" class="filter-chip-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </span>
                      </label>
                    </div>
                  </fieldset>

                  <fieldset class="filter-group filter-group-wide">
                    <legend>星魂 <a href="#" class="filter-select-all" @click.prevent="filters.eidolon = [0, 1, 2, 3, 4, 5, 6]">全选</a></legend>
                    <div class="filter-chips filter-grid-4">
                      <label v-for="e in 7" :key="e" class="filter-chip">
                        <input v-model="filters.eidolon" type="checkbox" :value="e - 1" />
                        <span>
                          {{ e - 1 }} 魂
                          <svg v-if="filters.eidolon.includes(e - 1)" class="filter-chip-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </span>
                      </label>
                    </div>
                  </fieldset>

                  <fieldset class="filter-group filter-group-wide">
                    <legend>元素</legend>
                    <div class="filter-chips filter-grid-3">
                      <label
                        v-for="element in [
                          { label: '物理', color: '#888888' },
                          { label: '火', color: '#f44336' },
                          { label: '冰', color: '#29b6f6' },
                          { label: '雷', color: '#ab47bc' },
                          { label: '风', color: '#26a69a' },
                          { label: '量子', color: '#26c6da' },
                          { label: '虚数', color: '#ffa726' },
                        ]"
                        :key="element.label"
                        class="filter-chip filter-element-chip"
                      >
                        <input v-model="filters.element" type="checkbox" :value="element.label" />
                        <span>
                          <i class="filter-element-dot" :style="{ backgroundColor: element.color }"></i>
                          {{ element.label }}
                          <svg v-if="filters.element.includes(element.label)" class="filter-chip-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </span>
                      </label>
                    </div>
                  </fieldset>
                </template>
                <label v-if="inventoryKind !== 'character'"
                  ><span>装备状态</span>
                  <Select
                    v-model="filters.equipped"
                    :options="[
                      { label: '全部', value: '' },
                      { label: '已装备', value: 'true' },
                      { label: '未装备', value: 'false' },
                    ]"
                    option-label="label"
                    option-value="value"
                    placeholder="全部"
                  />
                </label>
              </div>
              <div class="filter-actions">
                <Button class="filter-reset" type="button" outlined @click="resetFilters"
                  >重置全部</Button
                >
                <Button class="filter-submit" type="submit" :disabled="busy">查看结果</Button>
              </div>
            </form>
          </Drawer>

          <div class="table-shell" @scroll="onTableScroll">
            <table
              v-if="inventoryKind !== 'character'"
              :class="['inventory-table', `inventory-table--${inventoryKind}`]"
            >
              <colgroup>
                <col class="inventory-col-select" />
                <col class="inventory-col-name" />
                <col class="inventory-col-level" />
                <col class="inventory-col-primary" />
                <col class="inventory-col-secondary" />
                <col v-if="inventoryKind === 'relic'" class="inventory-col-equipped" />
                <col class="inventory-col-action" />
              </colgroup>
              <thead>
                <tr>
                  <th class="check-cell">
                    <Checkbox binary :model-value="allSelected" @update:model-value="toggleAll" />
                  </th>
                  <th>名称</th>
                  <template v-if="inventoryKind === 'relic'">
                    <th>等级</th>
                    <th>主词条</th>
                    <th>副词条</th>
                    <th>装备角色</th>
                  </template>
                  <template v-else-if="inventoryKind === 'lightCone'">
                    <th>等级</th>
                    <th>叠影</th>
                    <th>装备角色</th>
                  </template>
                  <th class="detail-cell">详情</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in result.items" :key="idFor(item)">
                  <td class="check-cell">
                    <Checkbox
                      binary
                      :model-value="selectedIds.has(idFor(item))"
                      @update:model-value="toggleSelected(idFor(item))"
                    />
                  </td>
                  <td>
                    <template v-if="inventoryKind === 'relic'">
                      <div class="relic-name-cell">
                        <div class="relic-icon-box">
                          <img
                            v-if="relicPieceImage(item as RelicListItem)"
                            :src="relicPieceImage(item as RelicListItem)!"
                            :alt="slotLabel((item as RelicListItem).slot)"
                            class="relic-piece-image"
                          />
                          <span v-else class="relic-icon-star">☆</span>
                        </div>
                        <div class="relic-name-info">
                          <strong class="item-name">{{ itemTitle(item) }}</strong>
                          <small class="relic-subtitle"
                            >{{ (item as RelicListItem).setName }} ·
                            {{ slotLabel((item as RelicListItem).slot) }}</small
                          >
                        </div>
                      </div>
                    </template>
                    <template v-else-if="inventoryKind === 'lightCone'">
                      <div class="relic-name-cell">
                        <div class="relic-icon-box">
                          <img
                            v-if="lightConeImage(item as LightConeListItem)"
                            :src="lightConeImage(item as LightConeListItem)!"
                            :alt="itemTitle(item)"
                            class="light-cone-image"
                          />
                          <span v-else class="relic-icon-star">☆</span>
                        </div>
                        <div class="relic-name-info">
                          <strong class="item-name">{{ itemTitle(item) }}</strong>
                        </div>
                      </div>
                    </template>
                    <template v-else>
                      <strong class="item-name">{{ itemTitle(item) }}</strong>
                    </template>
                  </td>
                  <template v-if="inventoryKind === 'relic'">
                    <td>
                      <span
                        :class="[
                          'relic-level-badge',
                          { 'is-max': (item as RelicListItem).level === 15 },
                        ]"
                        >+{{ (item as RelicListItem).level }}</span
                      >
                    </td>
                    <td>
                      <div class="relic-main-stat">
                        <span class="stat-name">{{
                          statLabel((item as RelicListItem).mainStat)
                        }}</span>
                        <strong class="stat-value">{{
                          formatStatValue(
                            (item as RelicListItem).mainStat,
                            (item as RelicListItem).mainStatValue,
                          )
                        }}</strong>
                      </div>
                    </td>
                    <td>
                      <div class="relic-substats-grid">
                        <span
                          v-for="stat in (item as RelicListItem).substats"
                          :key="stat.key"
                          :class="['relic-substat-item', `hit-${stat.count}`]"
                        >
                          <span class="substat-name">{{ statLabel(stat.key) }}</span>
                          <strong class="substat-value">{{
                            formatStatValue(stat.key, stat.value)
                          }}</strong>
                          <i v-if="stat.count >= 3" class="hit-count-badge">{{
                            stat.count === 5 ? "MAX" : `+${stat.count}`
                          }}</i>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        v-if="(item as RelicListItem).location"
                        :class="[
                          'relic-equip-tag',
                          'element-' + getCharacterElement((item as RelicListItem).location),
                        ]"
                      >
                        {{ (item as RelicListItem).location }}
                      </span>
                      <span v-else class="relic-equip-tag unequipped">未装备</span>
                    </td>
                  </template>
                  <template v-else-if="inventoryKind === 'lightCone'">
                    <td>
                      <b>Lv.{{ (item as LightConeListItem).level }}</b>
                    </td>
                    <td>
                      <span
                        :class="[
                          'relic-substat-item',
                          'light-cone-superimposition',
                          `hit-${(item as LightConeListItem).superimposition}`,
                        ]"
                      >
                        <span class="substat-name">叠影</span>
                        <strong class="substat-value">{{
                          (item as LightConeListItem).superimposition
                        }}</strong>
                      </span>
                    </td>
                    <td>
                      <span
                        v-if="(item as LightConeListItem).location"
                        :class="[
                          'relic-equip-tag',
                          'element-' + getCharacterElement((item as LightConeListItem).location),
                        ]"
                      >
                        {{ (item as LightConeListItem).location }}
                      </span>
                      <span v-else class="relic-equip-tag unequipped">未装备</span>
                    </td>
                  </template>
                  <td class="detail-cell">
                    <Button class="row-action" type="button" text @click="openDetail(item)"
                      >查看</Button
                    >
                  </td>
                </tr>
                <tr v-if="!result.items.length">
                  <td :colspan="inventoryKind === 'lightCone' ? 6 : 7" class="table-empty">
                    <span>◇</span>
                    <strong>{{ busy ? "正在检索数据库…" : "没有符合条件的数据" }}</strong>
                    <small>启动游戏数据直读并重新登录后，档案会自动出现</small>
                  </td>
                </tr>
              </tbody>
            </table>

            <div v-else class="character-card-grid">
              <div
                v-for="item in result.items"
                :key="idFor(item)"
                class="character-card"
                @click="openDetail(item)"
              >
                <div class="character-card-header">
                  <img
                    v-if="characterAvatar(item.name)"
                    class="character-card-avatar"
                    :src="characterAvatar(item.name)!"
                    :alt="`${item.name} 头像`"
                  />
                  <div
                    v-else
                    class="character-card-avatar-fallback"
                    :style="{ background: avatarColor(item.name) }"
                  >
                    {{ item.name.charAt(0) }}
                  </div>
                  <div class="character-path">
                    <span class="path-icon">{{ pathIcon((item as CharacterListItem).path) }}</span>
                    <span class="path-text">{{ pathLabel((item as CharacterListItem).path) }}</span>
                  </div>
                  <div class="character-name">{{ item.name }}</div>
                  <div class="character-stars">★★★★★</div>
                </div>
                <div class="character-card-stats">
                  <div class="stat-col">
                    <span class="stat-label">等级</span>
                    <strong class="stat-val">Lv.{{ (item as CharacterListItem).level }}</strong>
                  </div>
                  <div class="stat-col">
                    <span class="stat-label">星魂</span>
                    <strong
                      :class="[
                        'stat-val',
                        { 'is-active': (item as CharacterListItem).eidolon > 0 },
                      ]"
                    >
                      E{{ (item as CharacterListItem).eidolon }}
                    </strong>
                  </div>
                </div>
                <div class="character-card-actions">
                  <button
                    class="character-build-action"
                    type="button"
                    @click.stop="openBuild(item as CharacterListItem)"
                  >
                    培养方案 / 毕业目标
                  </button>
                </div>
              </div>
              <div v-if="!result.items.length" class="table-empty">
                <span>◇</span>
                <strong>{{ busy ? "正在检索数据库…" : "没有符合条件的数据" }}</strong>
                <small>启动游戏数据直读并重新登录后，档案会自动出现</small>
              </div>
            </div>
            <div v-if="isAppending" class="loading-more">
              <span class="loading-spinner">↻</span> 加载更多数据中...
            </div>
          </div>
        </article>
      </section>

      <section v-else class="catalogue-workspace">
        <header class="catalogue-heading" style="align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 24px; margin-bottom: 24px;">
          <div>
            <p class="eyebrow">LOCAL REFERENCE DATA</p>
            <div style="display: flex; align-items: baseline; gap: 12px;">
              <h2 style="margin: 0;">遗器与位面饰品图鉴</h2>
            </div>
          </div>
          <div class="catalogue-tabs" style="display: flex; gap: 8px;">
            <button
              v-for="tab in [
                { key: 'cavern', label: '遗器', code: 'CAVERN', count: catalogueGroups.cavern.length, unit: '套' },
                { key: 'planar', label: '位面饰品', code: 'PLANAR', count: catalogueGroups.planar.length, unit: '套' },
                { key: 'character', label: '角色', code: 'AVATAR', count: characterCatalogue.characters.length, unit: '名' }
              ]"
              :key="tab.key"
              :class="['catalogue-tab-btn', { active: catalogueTab === tab.key }]"
              type="button"
              @click="catalogueTab = tab.key"
              :style="{
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                gap: '16px',
                padding: '8px 16px', 
                border: catalogueTab === tab.key ? '1px solid transparent' : '1px solid var(--line)', 
                borderRadius: '8px', 
                background: catalogueTab === tab.key ? 'var(--p-primary-color)' : 'transparent', 
                color: catalogueTab === tab.key ? '#fff' : 'inherit',
                cursor: 'pointer', 
                textAlign: 'left', 
                transition: 'all 0.2s',
                minWidth: '150px'
              }"
            >
              <span style="display: flex; flex-direction: column; gap: 2px;">
                <small style="font-size: 10px; opacity: 0.6; letter-spacing: 0.05em; line-height: 1;">{{ tab.code }}</small>
                <span style="font-weight: 500;">{{ tab.label }}</span>
              </span>
              <b style="font-size: 16px; font-weight: 600;">{{ tab.count }} <small style="font-size: 12px; font-weight: normal; opacity: 0.8;">{{ tab.unit }}</small></b>
            </button>
          </div>
        </header>
        <div
          v-if="relicCatalogue.sets.length || characterCatalogue.characters.length"
          class="catalogue-groups"
        >
          <section
            v-show="catalogueTab === 'cavern' && catalogueGroups.cavern.length"
            class="catalogue-group"
          >
            <div class="catalogue-grid">
              <article
                v-for="set in catalogueGroups.cavern"
                :key="set.id"
                class="catalogue-card"
              >
                <img v-if="set.image" :src="set.image" :alt="set.name" />
                <span v-else class="catalogue-placeholder">◇</span>
                <div>
                  <small>#{{ set.id }}</small>
                  <h4>{{ set.name }}</h4>
                  <p><b>2 件</b>{{ set.effects.twoPiece }}</p>
                  <p v-if="set.effects.fourPiece"><b>4 件</b>{{ set.effects.fourPiece }}</p>
                </div>
              </article>
            </div>
          </section>
          
          <section
            v-show="catalogueTab === 'planar' && catalogueGroups.planar.length"
            class="catalogue-group"
          >
            <div class="catalogue-grid">
              <article
                v-for="set in catalogueGroups.planar"
                :key="set.id"
                class="catalogue-card"
              >
                <img v-if="set.image" :src="set.image" :alt="set.name" />
                <span v-else class="catalogue-placeholder">◇</span>
                <div>
                  <small>#{{ set.id }}</small>
                  <h4>{{ set.name }}</h4>
                  <p><b>2 件</b>{{ set.effects.twoPiece }}</p>
                  <p v-if="set.effects.fourPiece"><b>4 件</b>{{ set.effects.fourPiece }}</p>
                </div>
              </article>
            </div>
          </section>
          <section v-show="catalogueTab === 'character'" class="catalogue-group character-catalogue-group">
            <div v-if="characterCatalogue.characters.length" class="character-catalogue-grid">
              <button
                v-for="character in characterCatalogue.characters"
                :key="character.slug"
                class="character-catalogue-card"
                type="button"
                aria-haspopup="dialog"
                :aria-label="`查看${character.name}的 80 级基础属性`"
                @click="openCharacterBaseStats(character)"
              >
                <div
                  v-if="character.image"
                  class="character-catalogue-portrait"
                  :style="
                    character.backgroundImage
                      ? { backgroundImage: `url(${character.backgroundImage})` }
                      : undefined
                  "
                >
                  <img class="character-image" :src="character.image" :alt="character.name" />
                  <div class="character-icons">
                    <img
                      v-if="character.elementIcon"
                      :src="character.elementIcon"
                      alt=""
                      class="element-icon"
                    />
                    <img
                      v-if="character.pathIcon"
                      :src="character.pathIcon"
                      alt=""
                      class="path-icon"
                    />
                  </div>
                </div>
                <span v-else>◇</span>
                <div class="character-info">
                  <h4>{{ character.name }}</h4>
                  <div class="character-text-tags">
                    <span class="tag-element">{{ character.element }}</span>
                    <span class="tag-divider"></span>
                    <span class="tag-path">{{ character.path }}</span>
                  </div>
                </div>
              </button>
            </div>
            <p v-else class="catalogue-source-note">角色目录将在下一次运行同步命令后显示。</p>
          </section>
        </div>
        <div v-else class="catalogue-empty">
          <span>◇</span><strong>图鉴内容暂未准备好</strong>
          <p>当前版本暂时无法展示遗器、饰品和角色图鉴。你的本地背包与游戏数据使用不受影响。</p>
        </div>
      </section>

      <footer class="app-footer">
        <span>StarRail-Auto-Tools</span>
        <div class="footer-meta">
          <span class="platform-label">{{ capabilities?.platform ?? "SYSTEM" }}</span>
          <div :class="['runtime-pill', `tone-${phaseCode}`]">
            <span :class="['status-dot', { active: directRunning }]" />
            {{ phaseLabel }}
          </div>
        </div>
      </footer>
    </main>

    <div
      v-if="selectedCatalogueCharacter"
      class="catalogue-character-modal-backdrop"
      @click.self="closeCharacterBaseStats"
    >
      <section
        class="catalogue-character-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="`${selectedCatalogueCharacter.name}的基础属性`"
      >
        <button
          class="catalogue-character-modal-close"
          type="button"
          aria-label="关闭基础属性"
          @click="closeCharacterBaseStats"
        >
          ×
        </button>
        <div
          class="catalogue-character-modal-hero"
          :style="
            selectedCatalogueCharacter.backgroundImage
              ? { backgroundImage: `url(${selectedCatalogueCharacter.backgroundImage})` }
              : undefined
          "
        >
          <img
            v-if="selectedCatalogueCharacter.image"
            :src="selectedCatalogueCharacter.image"
            :alt="selectedCatalogueCharacter.name"
          />
          <div class="catalogue-character-modal-title">
            <p>BASELINE PROFILE</p>
            <h2>{{ selectedCatalogueCharacter.name }}</h2>
            <span>{{ selectedCatalogueCharacter.element }} · {{ selectedCatalogueCharacter.path }}</span>
          </div>
        </div>
        <div class="catalogue-character-modal-body">
          <header>
            <div>
              <p class="eyebrow">LEVEL 80 · MAX ASCENSION</p>
              <h3>基础属性</h3>
            </div>
            <small>满级</small>
          </header>
          <div v-if="selectedCatalogueCharacter.baseStats" class="base-stat-grid">
            <div>
              <span>生命值</span><b>{{ formatBaseStat(selectedCatalogueCharacter.baseStats.hp) }}</b><small>HP</small>
            </div>
            <div><span>攻击力</span><b>{{ formatBaseStat(selectedCatalogueCharacter.baseStats.attack) }}</b><small>ATK</small></div>
            <div><span>防御力</span><b>{{ formatBaseStat(selectedCatalogueCharacter.baseStats.defense) }}</b><small>DEF</small></div>
            <div><span>速度</span><b>{{ formatBaseStat(selectedCatalogueCharacter.baseStats.speed) }}</b><small>SPD</small></div>
            <div><span>嘲讽</span><b>{{ formatBaseStat(selectedCatalogueCharacter.baseStats.taunt) }}</b><small>TAUNT</small></div>
          </div>
          <p v-else class="base-stat-empty">该角色的基础属性尚未同步。</p>
          <footer>不含光锥、遗器、行迹、星魂和战斗内增益</footer>
        </div>
      </section>
    </div>

    <div v-if="screenshotPreviewUrl" class="crop-backdrop" @click.self="closeCropPicker()">
      <section class="crop-picker" aria-label="截图区域选择">
        <header class="crop-picker-header">
          <div>
            <p class="eyebrow">SELECT OCR REGION</p>
            <h2>框选识别区域</h2>
          </div>
          <button type="button" aria-label="取消截图" @click="closeCropPicker()">×</button>
        </header>
        <p>拖拽框选遗器、光锥或角色详情。框外内容不会发送给 OCR。</p>
        <div
          ref="cropSurface"
          class="crop-surface"
          @pointerdown="startCropSelection"
          @pointermove="updateCropSelection"
          @pointerup="endCropSelection"
          @pointercancel="endCropSelection"
        >
          <img :src="screenshotPreviewUrl" alt="待框选的截图" draggable="false" />
          <span
            v-if="hasCropSelection"
            class="crop-box"
            :style="{
              left: `${cropBox.left}px`,
              top: `${cropBox.top}px`,
              width: `${cropBox.width}px`,
              height: `${cropBox.height}px`,
            }"
          />
          <div
            v-if="hasCropSelection"
            class="crop-toolbar"
            :style="{
              left: `${cropBox.left + cropBox.width + 10}px`,
              top: `${cropBox.top + cropBox.height + 10}px`,
            }"
            @pointerdown.stop
          >
            <button type="button" title="确认识别" :disabled="busy" @click="recognizeCrop">
              ✓
            </button>
            <button type="button" title="重新框选" @click="resetCropSelection">↻</button>
            <button type="button" title="取消截图" @click="closeCropPicker()">×</button>
          </div>
        </div>
        <footer class="crop-picker-actions">
          <span v-if="hasCropSelection"
            >已选择 {{ Math.round(cropBox.width) }} × {{ Math.round(cropBox.height) }} px</span
          >
          <span v-else>拖拽鼠标开始框选</span>
        </footer>
      </section>
    </div>

    <div v-if="buildOpen" class="detail-backdrop build-backdrop" @click.self="closeBuild">
      <aside class="detail-drawer build-drawer">
        <header>
          <div>
            <p class="eyebrow">BUILD BLUEPRINT</p>
            <h2>培养方案 / 毕业目标</h2>
            <small>属性统计包含已换算的主词条与同步的副词条。</small>
          </div>
          <button type="button" aria-label="关闭培养方案" @click="closeBuild">×</button>
        </header>
        <div v-if="buildLoading" class="detail-loading">正在计算毕业方案…</div>
        <div v-else class="build-scroll">
          <section class="build-section">
            <h3>套装结构</h3>
            <div class="build-grid">
              <label
                ><span>四件遗器区</span
                ><Select
                  v-model="buildPlan.cavernMode"
                  :options="[
                    { label: '指定 4 件套', value: 'fourPiece' },
                    { label: '指定 2 件 + 2 件', value: 'twoPlusTwo' },
                  ]"
                  option-label="label"
                  option-value="value"
              /></label>
              <label
                ><span>{{ buildPlan.cavernMode === "fourPiece" ? "四件套" : "第一组 2 件套" }}</span
                ><Select
                  v-model="buildPlan.cavernSetA"
                  :options="cavernSetOptions"
                  option-label="name"
                  option-value="setId"
              /></label>
              <label v-if="buildPlan.cavernMode === 'twoPlusTwo'"
                ><span>第二组 2 件套</span
                ><Select
                  v-model="buildPlan.cavernSetB"
                  :options="cavernSetOptions"
                  option-label="name"
                  option-value="setId"
              /></label>
              <label
                ><span>位面饰品 2 件套</span
                ><Select
                  v-model="buildPlan.planarSetId"
                  :options="planarSetOptions"
                  option-label="name"
                  option-value="setId"
              /></label>
            </div>
          </section>

          <section class="build-section">
            <h3>各部位允许主词条</h3>
            <div class="main-stat-grid">
              <fieldset v-for="slot in relicSlots" :key="slot.value">
                <legend>{{ slot.label }}</legend>
                <label
                  v-for="stat in relicMainStats[slot.value] ?? []"
                  :key="stat"
                  class="filter-chip"
                  ><input
                    v-model="buildPlan.mainStats[slot.value]"
                    type="checkbox"
                    :value="stat"
                  /><span>{{ statLabel(stat) }}</span></label
                >
              </fieldset>
            </div>
          </section>

          <section class="build-section">
            <div class="build-section-heading">
              <h3>属性目标 <small>按顺序决定优先级</small></h3>
              <button
                type="button"
                class="row-action"
                :disabled="buildPlan.targets.length >= 3"
                @click="addBuildTarget"
              >
                + 添加
              </button>
            </div>
            <div class="target-column-headings" aria-hidden="true">
              <span /><span /><span>属性</span><span>目标</span><span>最低标准</span><span />
            </div>
            <div
              v-for="(target, index) in buildPlan.targets"
              :key="target.statKey"
              :data-target-index="index"
              :class="[
                'target-row',
                {
                  dragging: draggedTargetIndex === index,
                  'drag-over':
                    draggedTargetIndex !== null &&
                    dragTargetIndex === index &&
                    draggedTargetIndex !== index,
                },
              ]"
            >
              <span
                class="drag-handle"
                title="按住拖拽以调整优先级"
                @pointerdown="beginBuildTargetDrag($event, index)"
                >⠿</span
              ><b>P{{ index + 1 }}</b
              ><Select
                v-model="target.statKey"
                :options="relicSubStats.map((stat) => ({ label: statLabel(stat), value: stat }))"
                option-label="label"
                option-value="value"
                aria-label="属性"
              />
              <label aria-label="目标"><InputNumber v-model="target.target" :min="0" /></label>
              <label aria-label="最低标准"
                ><InputNumber v-model="target.minimum" :min="0" :max="target.target"
              /></label>
              <Button
                class="target-remove"
                type="button"
                severity="danger"
                text
                aria-label="删除属性目标"
                @click="removeBuildTarget(index)"
                >×</Button
              >
            </div>
          </section>

          <section v-if="buildRecommendation" class="build-section build-results">
            <h3>当前进度</h3>
            <div
              v-for="progress in buildRecommendation.current"
              :key="progress.statKey"
              class="progress-row"
            >
              <div>
                <b>{{ statLabel(progress.statKey) }}</b
                ><span>{{ progress.current.toFixed(1) }} / {{ progress.target }}</span>
              </div>
              <i><em :style="{ width: `${progressPercent(progress)}%` }" /></i
              ><small v-if="progress.gap">缺 {{ progress.gap.toFixed(1) }}</small
              ><small v-else>已达标</small>
            </div>
            <h3>推荐组合</h3>
            <p class="build-message">{{ buildRecommendation.message }}</p>
            <div v-if="buildRecommendation.recommended" class="recommend-list">
              <div v-for="item in buildRecommendation.recommended" :key="item.itemId">
                <b>{{ slotLabel(item.slot) }}</b
                ><span>{{ item.name }} · {{ statLabel(item.mainStat) }}</span
                ><small v-if="item.borrowed">借用：{{ item.location }}</small>
              </div>
            </div>
            <div v-if="buildRecommendation.recommendedProgress" class="recommended-summary">
              <span
                v-for="progress in buildRecommendation.recommendedProgress"
                :key="progress.statKey"
                >{{ statLabel(progress.statKey) }} {{ progress.current.toFixed(1)
                }}<b v-if="progress.gap"> · 缺 {{ progress.gap.toFixed(1) }}</b></span
              >
            </div>
          </section>
        </div>
        <footer class="build-actions">
          <label class="include-equipped"
            ><Checkbox v-model="includeEquipped" binary /> 纳入已装备遗器</label
          ><span /><Button
            :class="['filter-reset', { 'confirm-delete': buildDeleteArmed }]"
            type="button"
            outlined
            @click="deleteBuildPlan"
            >{{ buildDeleteArmed ? "再次点击确认" : "删除方案" }}</Button
          ><Button class="filter-submit" type="button" @click="saveBuildPlan">保存并计算</Button
          ><Button
            class="filter-submit"
            type="button"
            :disabled="!buildPlan.characterId"
            @click="calculateBuild"
            >重新计算</Button
          >
        </footer>
      </aside>
    </div>

    <div v-if="detail || detailLoading" class="detail-backdrop" @click.self="closeDetail">
      <aside
        :class="[
          'detail-drawer',
          { 'relic-detail-drawer': detailRelic, 'character-detail-drawer': detailCharacter, 'lightcone-detail-drawer': detailLightCone },
        ]"
      >
        <header>
          <div>
            <p class="eyebrow">
              {{
                detailRelic
                  ? "RELIC ANALYSIS"
                  : detailCharacter
                    ? "CHARACTER DOSSIER"
                    : detailLightCone
                      ? "LIGHT CONE DATA"
                      : "RECORD DETAIL"
              }}
            </p>
            <h2>
              {{ detailRelic ? "遗器档案详情" : detailCharacter ? "角色档案详情" : detailLightCone ? "光锥档案详情" : "结构化详情" }}
            </h2>
          </div>
          <button type="button" aria-label="关闭详情" @click="closeDetail">×</button>
        </header>
        <div class="detail-drawer-content">
          <div v-if="detailLoading" class="detail-loading">正在读取 SQLite 记录…</div>
          <section v-else-if="detailRelic" class="relic-detail-card">
          <div class="relic-detail-identity">
            <div :class="['detail-icon-box', `rarity-${detailRelic.rarity}`]">
              <img
                v-if="getDetailRelicImage(detailRelic)"
                :src="getDetailRelicImage(detailRelic)!"
                :alt="slotLabel(detailRelic.slot)"
                class="detail-piece-image"
              />
              <span v-else>{{ slotLabel(detailRelic.slot).slice(0, 1) }}</span>
            </div>
            <div class="detail-identity-text">
              <p class="detail-set-name">{{ detailRelic.setName }}</p>
              <h3>{{ detailRelic.name }}</h3>
              <div class="detail-tags">
                <span class="detail-slot-tag">{{ slotLabel(detailRelic.slot) }}</span>
                <span class="detail-id-tag">#{{ detailRelic.itemId }}</span>
              </div>
            </div>
            <b :class="['detail-relic-level', { 'is-max': detailRelic.level === 15 }]"
              >+{{ detailRelic.level }}</b
            >
          </div>

          <div class="detail-rarity-stars" :aria-label="`${detailRelic.rarity} 星`">
            <i v-for="n in detailRelic.rarity" :key="n">✦</i>
          </div>

          <section class="detail-main-stat">
            <div class="stat-header">
              <p>主属性 <span>MAIN STAT</span></p>
            </div>
            <div class="stat-body">
              <strong>{{ statLabel(detailRelic.mainStat) }}</strong>
              <b>+{{ formatStatValue(detailRelic.mainStat, detailRelic.mainStatValue) }}</b>
            </div>
          </section>

          <section class="detail-substats">
            <header>
              <div>
                <p class="eyebrow">SUB STATS</p>
                <h3>副属性</h3>
              </div>
              <small>{{ detailRelic.substats?.length ?? 0 }} / 4</small>
            </header>
            <div v-if="detailRelic.substats?.length" class="detail-substat-list">
              <div
                v-for="(stat, index) in detailRelic.substats"
                :key="`${stat.kind}-${index}`"
                :class="[
                  'detail-substat-row',
                  `hit-${stat.count}`,
                  { auxiliary: stat.kind !== 'normal' },
                ]"
              >
                <span class="detail-substat-name">{{ statLabel(stat.key) }}</span>
                <b class="detail-substat-value">+{{ formatStatValue(stat.key, stat.value) }}</b>
                <div class="detail-substat-meta">
                  <i v-if="stat.count > 0" class="detail-hit-badge">{{
                    stat.count === 5 ? "MAX" : `+${stat.count}`
                  }}</i>
                  <em v-if="stat.kind !== 'normal'">{{
                    stat.kind === "reroll" ? "重铸" : "预览"
                  }}</em>
                </div>
              </div>
            </div>
            <div v-else class="detail-empty-substats">
              <p>该遗器尚未记录副属性数据。</p>
            </div>
          </section>

          <footer class="relic-detail-footer">
            <div>
              <span>装备归属</span><b>{{ detailRelic.location || "未装备" }}</b>
            </div>
            <div>
              <span>状态</span
              ><b>{{
                detailRelic.locked ? "已锁定" : detailRelic.discard ? "已标记弃置" : "正常"
              }}</b>
            </div>
            <div>
              <span>更新于</span><b>{{ formatTime(detailRelic.updatedAt) }}</b>
            </div>
          </footer>
          </section>
          <section v-else-if="detailCharacter" class="character-detail-card">
          <div class="character-identity">
            <img
              v-if="characterAvatar(detailCharacter.name)"
              class="character-detail-avatar"
              :src="characterAvatar(detailCharacter.name)!"
              :alt="`${detailCharacter.name} 头像`"
            />
            <div v-else class="path-seal">{{ pathLabel(detailCharacter.path).slice(0, 1) }}</div>
            <div>
              <p>{{ pathLabel(detailCharacter.path) }} · PATH</p>
              <h3>{{ detailCharacter.name }}</h3>
            </div>
            <b>Lv.{{ detailCharacter.level }}</b>
          </div>
          <div class="character-metrics">
            <div>
              <span>突破</span><b>{{ detailCharacter.ascension }}</b>
            </div>
            <div>
              <span>星魂</span><b>{{ detailCharacter.eidolon }}</b>
            </div>
            <div>
              <span>能力版本</span><b>V{{ detailCharacter.abilityVersion }}</b>
            </div>
          </div>
          <section class="character-data-section standing-stat-section">
            <header>
              <div>
                <p class="eyebrow">STATIC PROFILE</p>
                <h3>站街属性</h3>
              </div>
              <small v-if="characterStandingStats.available">
                遗器 {{ detailCharacter.equippedRelics?.length ?? 0 }} 件 · 行迹 {{ selectedDetailTraceStats.length }} 条 · 静态套装 {{ detailCharacterStaticSetEffects.length }} 项
              </small>
              <small v-else>满级后可计算</small>
            </header>
            <div v-if="characterStandingStats.available" class="standing-stat-grid">
              <div v-for="stat in characterStandingStats.stats" :key="stat.key">
                <span>{{ stat.label }}</span><b>{{ formatStandingStat(stat) }}</b>
              </div>
            </div>
            <p v-else class="standing-stat-unavailable">{{ characterStandingStats.reason }}</p>
            <footer>已计入基础属性、光锥三围、遗器主/副属性、无条件 2 件套与当前勾选行迹；不计条件式套装、光锥技能、星魂和战斗增益。</footer>
          </section>
          <section class="character-data-section">
            <header>
              <div>
                <p class="eyebrow">SKILL LEVELS</p>
                <h3>技能等级</h3>
              </div>
              <small>{{ characterSkillEntries(detailCharacter.skills).length }} 项</small>
            </header>
            <div v-if="characterSkillEntries(detailCharacter.skills).length" class="character-data-grid">
              <div v-for="skill in characterSkillEntries(detailCharacter.skills)" :key="skill.key">
                <span>{{ skill.label }}</span><b>{{ skill.value }}</b>
              </div>
            </div>
            <p v-else class="empty-substats">未同步技能数据。</p>
          </section>

          <section v-if="detailCharacterTraceStats.length" class="character-data-section trace-stat-section">
            <header>
              <div>
                <p class="eyebrow">TRACE ATTRIBUTES</p>
                <h3>行迹属性</h3>
              </div>
              <small>默认全选 · 可取消</small>
            </header>
            <div class="trace-stat-list">
              <button
                v-for="trace in detailCharacterTraceStats"
                :key="trace.id"
                type="button"
                :class="{ disabled: !traceNodeEnabled(detailCharacter.characterId, trace.id) }"
                :aria-pressed="traceNodeEnabled(detailCharacter.characterId, trace.id)"
                @click="toggleTraceNode(detailCharacter.characterId, trace.id)"
              >
                <span><b>{{ trace.name }}</b><small>{{ trace.stats.map((stat) => stat.key).join(' · ') }}</small></span>
                <em>{{ trace.stats.map((stat) => formatTraceStat(stat.value)).join(' / ') }}</em>
              </button>
            </div>
          </section>
          
          <section v-if="detailCharacter.memosprite" class="memosprite-note">
            <header>
              <div>
                <p class="eyebrow">MEMOSPRITE SKILLS</p>
                <h3>忆灵技能等级</h3>
              </div>
              <small>{{ characterSkillEntries(detailCharacter.memosprite).length }} 项</small>
            </header>
            <div class="character-data-grid">
              <div
                v-for="skill in characterSkillEntries(detailCharacter.memosprite)"
                :key="skill.key"
              >
                <span>{{ skill.label }}</span><b>{{ skill.value }}</b>
              </div>
            </div>
          </section>
          
          <footer class="relic-detail-footer">
            <div>
              <span>更新于</span><b>{{ formatTime(detailCharacter.updatedAt) }}</b>
            </div>
            <div><span>数据来源</span><b>游戏同步</b></div>
          </footer>
          </section>
          <section v-else-if="detailLightCone" class="character-detail-card">
          <div class="character-identity">
            <img
              v-if="lightConeImages.get(detailLightCone.templateId)"
              class="lightcone-detail-avatar"
              :src="lightConeImages.get(detailLightCone.templateId)!"
              :alt="detailLightCone.name"
            />
            <div v-else class="path-seal">{{ pathLabel(lightConePaths.get(detailLightCone.templateId) || '').slice(0, 1) }}</div>
            <div>
              <p>{{ pathLabel(lightConePaths.get(detailLightCone.templateId) || '') }} · PATH</p>
              <h3>{{ detailLightCone.name }}</h3>
            </div>
            <b :class="{'is-max': detailLightCone.level === 80}">Lv.{{ detailLightCone.level }}</b>
          </div>

          <div class="detail-rarity-stars" :aria-label="`${lightConeRarities.get(detailLightCone.templateId) || 5} 星`">
            <i v-for="n in (lightConeRarities.get(detailLightCone.templateId) || 5)" :key="n">✦</i>
          </div>

          <div class="character-metrics">
            <div>
              <span>突破</span><b>{{ detailLightCone.ascension }}</b>
            </div>
            <div>
              <span>叠影</span><b>{{ detailLightCone.superimposition }}</b>
            </div>
            <div>
              <span>状态</span><b>{{ detailLightCone.locked ? "已锁定" : "正常" }}</b>
            </div>
          </div>

          <section
            v-if="lightConeBaseStats.get(detailLightCone.templateId)"
            class="character-data-section"
          >
            <header>
              <div>
                <p class="eyebrow">LEVEL 80 · MAX ASCENSION</p>
                <h3>基础属性</h3>
              </div>
              <small>满级</small>
            </header>
            <div class="lightcone-base-stat-grid">
              <div>
                <span>生命值</span><b>{{ formatBaseStat(lightConeBaseStats.get(detailLightCone.templateId)!.hp) }}</b>
              </div>
              <div>
                <span>攻击力</span><b>{{ formatBaseStat(lightConeBaseStats.get(detailLightCone.templateId)!.attack) }}</b>
              </div>
              <div>
                <span>防御力</span><b>{{ formatBaseStat(lightConeBaseStats.get(detailLightCone.templateId)!.defense) }}</b>
              </div>
            </div>
          </section>
          
          <footer class="relic-detail-footer">
            <div>
              <span>装备归属</span><b>{{ detailLightCone.location || "未装备" }}</b>
            </div>
            <div>
              <span>更新于</span><b>{{ formatTime(detailLightCone.updatedAt) }}</b>
            </div>
            <div><span>数据来源</span><b>{{ detailLightCone.source === 'network' ? '游戏同步' : '识别导入' }}</b></div>
          </footer>
          </section>
          <pre v-else>{{ detailJson() }}</pre>
        </div>
      </aside>
    </div>

    <div v-if="error" class="toast error-toast" role="alert" @click="error = ''">
      <span class="toast-symbol">!</span>
      <div>
        <strong>任务未完成</strong>
        <p>{{ error }}</p>
      </div>
    </div>
    <div v-if="notice" class="toast notice-toast" role="status" @click="notice = ''">
      <span class="toast-symbol">✓</span>
      <div>
        <strong>{{ busy ? "正在处理" : "操作完成" }}</strong>
        <p>{{ notice }}</p>
      </div>
    </div>
  </div>
</template>
