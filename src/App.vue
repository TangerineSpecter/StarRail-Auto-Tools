<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Drawer from "primevue/drawer";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Tag from "primevue/tag";
import { api } from "./services/tauri";
import relicCatalogueJson from "./data/relic-sets.json";
import characterCatalogueJson from "./data/characters.json";
import type {
  CharacterFilter,
  CharacterCatalogue,
  CharacterBuildPlan,
  BuildRecommendation,
  CharacterListItem,
  DirectReadSnapshot,
  InventoryDetail,
  InventoryKind,
  InventoryListItem,
  InventorySummary,
  LightConeFilter,
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

type ViewName = "capture" | "archive" | "catalogue";
type RelicDetailData = {
  itemId: number; name: string; setName: string; slot: string; rarity: number; level: number;
  mainStat: string; mainStatValue: number; location: string; locked: boolean; discard: boolean;
  updatedAt: number; substats?: Array<{ kind: string; key: string; value: number; count: number }>;
};
type CharacterDetailData = {
  characterId: number; name: string; path: string; level: number; ascension: number; eidolon: number;
  skills: Record<string, unknown>; traces: Record<string, unknown>; memosprite?: Record<string, unknown> | null;
  abilityVersion: number; updatedAt: number;
};

const emptyDirectSnapshot: DirectReadSnapshot = {
  phase: "unsupported",
  message: "正在读取运行状态…",
  startedAt: null,
  lastSyncAt: null,
  relics: 0,
  lightCones: 0,
  characters: 0,
  protocolVersion: "reliquary-v22.0.0 / HSR-4.4",
  currentUid: null,
  incomingUid: null,
  requiresAccountSwitch: false,
};

const emptySummary: InventorySummary = {
  relics: 0,
  lightCones: 0,
  characters: 0,
  lastSyncAt: null,
  protocolVersion: "reliquary-v22.0.0 / HSR-4.4",
};

const activeView = ref<ViewName>("capture");
const capabilities = ref<SystemCapabilities | null>(null);
const direct = ref<DirectReadSnapshot>(emptyDirectSnapshot);
const summary = ref<InventorySummary>(emptySummary);
const busy = ref(false);
const error = ref("");
const notice = ref("");

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
const characterAvatars = new Map(characterCatalogue.characters.map((character) => [character.name, character.image]));
const characterElements = new Map(characterCatalogue.characters.map((character) => [character.name, character.element]));
const relicPieceImages = new Map(
  relicCatalogue.sets.flatMap((set) =>
    (set.pieces || []).map((piece) => [`${set.id}_${piece.slot}`, piece.image] as const)
  )
);
const relicSetOptions = ref<RelicSetOption[]>(
  relicCatalogue.sets.map((set) => ({ setId: set.id, name: set.name, kind: set.kind })),
);
const includeEquipped = ref(false);
const buildDeleteArmed = ref(false);
const draggedTargetIndex = ref<number | null>(null);
const dragTargetIndex = ref<number | null>(null);
const buildPlan = reactive<CharacterBuildPlan>({
  characterId: 0, cavernMode: "fourPiece", cavernSetA: 0, cavernSetB: null,
  planarSetId: 0, mainStats: { Head: [], Hands: [], Body: [], Feet: [], PlanarSphere: [], LinkRope: [] }, targets: [],
});

const filters = reactive({
  search: "",
  slots: [] as string[],
  rarities: [] as number[],
  minLevel: "",
  maxLevel: "",
  mainStats: [] as string[],
  subStats: [] as string[],
  minSubstatCount: "",
  maxSubstatCount: "",
  locked: "",
  discard: "",
  equipped: "",
  minAscension: "",
  superimposition: "",
  path: "",
  eidolon: "",
});

const substatCountOptions = [
  { label: "不限", value: "" },
  ...[0, 1, 2, 3, 4, 5].map((value) => ({ label: `${value} 次`, value })),
];

const relicSlots = [
  { value: "Head", label: "头部" }, { value: "Hands", label: "手部" },
  { value: "Body", label: "躯干" }, { value: "Feet", label: "脚部" },
  { value: "PlanarSphere", label: "位面球" }, { value: "LinkRope", label: "连结绳" },
];
const relicSubStats = ["HP", "HP%", "ATK", "ATK%", "DEF", "DEF%", "SPD", "CRIT Rate", "CRIT DMG", "Effect Hit Rate", "Effect RES", "Break Effect"];
const relicMainStats: Record<string, string[]> = {
  Head: ["HP"], Hands: ["ATK"],
  Body: ["HP%", "ATK%", "DEF%", "CRIT Rate", "CRIT DMG", "Outgoing Healing Boost", "Effect Hit Rate"],
  Feet: ["HP%", "ATK%", "DEF%", "SPD"],
  PlanarSphere: ["HP%", "ATK%", "DEF%", "Physical DMG Boost", "Fire DMG Boost", "Ice DMG Boost", "Lightning DMG Boost", "Wind DMG Boost", "Quantum DMG Boost", "Imaginary DMG Boost"],
  LinkRope: ["HP%", "ATK%", "DEF%", "Break Effect", "Energy Regeneration Rate"],
};
const statLabels: Record<string, string> = {
  HP: "生命值", "HP%": "生命百分比", ATK: "攻击力", "ATK%": "攻击百分比",
  DEF: "防御力", "DEF%": "防御百分比", SPD: "速度", "CRIT Rate": "暴击率",
  "CRIT DMG": "暴击伤害", "Effect Hit Rate": "效果命中", "Effect RES": "效果抵抗",
  "Break Effect": "击破特攻", "Outgoing Healing Boost": "治疗量加成",
  "Energy Regeneration Rate": "能量恢复效率", "Physical DMG Boost": "物理伤害提高",
  "Fire DMG Boost": "火属性伤害提高", "Ice DMG Boost": "冰属性伤害提高",
  "Lightning DMG Boost": "雷属性伤害提高", "Wind DMG Boost": "风属性伤害提高",
  "Quantum DMG Boost": "量子属性伤害提高", "Imaginary DMG Boost": "虚数属性伤害提高",
};
const cavernSetOptions = computed(() => relicSetOptions.value.filter((set) => set.kind === "cavern"));
const planarSetOptions = computed(() => relicSetOptions.value.filter((set) => set.kind === "planar"));
const catalogueGroups = computed(() => ({
  cavern: relicCatalogue.sets.filter((set) => set.kind === "cavern"),
  planar: relicCatalogue.sets.filter((set) => set.kind === "planar"),
}));

const availableMainStats = computed(() => {
  const slots = filters.slots.length ? filters.slots : relicSlots.map((slot) => slot.value);
  return [...new Set(slots.flatMap((slot) => relicMainStats[slot] ?? []))];
});
const detailRelic = computed<RelicDetailData | null>(() =>
  detail.value?.kind === "relic" ? detail.value.data as unknown as RelicDetailData : null,
);
const detailCharacter = computed<CharacterDetailData | null>(() =>
  detail.value?.kind === "character" ? detail.value.data as unknown as CharacterDetailData : null,
);
const activeFilterCount = computed(() => [
  filters.slots.length,
  filters.rarities.length,
  filters.mainStats.length,
  filters.subStats.length,
  filters.minSubstatCount,
  filters.maxSubstatCount,
  filters.minLevel,
  filters.maxLevel,
  filters.locked,
  filters.discard,
  filters.equipped,
  filters.minAscension,
  filters.superimposition,
  filters.path,
  filters.eidolon,
].filter(Boolean).length);

let unlistenDirect: UnlistenFn | undefined;
let unlistenInventory: UnlistenFn | undefined;
let detailRequestId = 0;
let targetDragPreview: HTMLElement | undefined;
let targetDragCleanup: (() => void) | undefined;

const directRunning = computed(() =>
  ["starting", "waitingForLogin", "connected", "syncing", "ready"].includes(
    direct.value.phase,
  ),
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

const phaseCode = computed(() => direct.value.phase.replaceAll(/[A-Z]/g, (v) => `-${v.toLowerCase()}`));
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

function numberOrUndefined(value: string): number | undefined {
  const normalized = value.trim();
  return normalized === "" ? undefined : Number(normalized);
}

function boolOrUndefined(value: string): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== ""),
  ) as T;
}

function currentFilter():
  | RelicFilter
  | LightConeFilter
  | CharacterFilter {
  const page = result.value.page;
  const pageSize = result.value.pageSize;
  if (inventoryKind.value === "relic") {
    return compact({
      page,
      pageSize,
      search: filters.search.trim() || undefined,
      slots: filters.slots.length ? filters.slots : undefined,
      rarities: filters.rarities.length ? filters.rarities : undefined,
      mainStats: filters.mainStats.length ? filters.mainStats : undefined,
      subStats: filters.subStats.length ? filters.subStats : undefined,
      minSubstatCount: numberOrUndefined(filters.minSubstatCount),
      maxSubstatCount: numberOrUndefined(filters.maxSubstatCount),
      locked: boolOrUndefined(filters.locked),
      discard: boolOrUndefined(filters.discard),
      equipped: boolOrUndefined(filters.equipped),
    });
  }
  if (inventoryKind.value === "lightCone") {
    return compact({
      page,
      pageSize,
      search: filters.search.trim() || undefined,
      superimposition: numberOrUndefined(filters.superimposition),
      locked: boolOrUndefined(filters.locked),
      equipped: boolOrUndefined(filters.equipped),
    });
  }
  return compact({
    page,
    pageSize,
    search: filters.search.trim() || undefined,
    path: filters.path.trim() || undefined,
    eidolon: numberOrUndefined(filters.eidolon),
  });
}

async function loadInitialState() {
  try {
    [capabilities.value, direct.value, summary.value] = await Promise.all([
      api.capabilities(),
      api.directReadSnapshot(),
      api.inventorySummary(),
    ]);
  } catch (cause) {
    error.value = String(cause);
  }
}

async function toggleDirectRead() {
  busy.value = true;
  error.value = "";
  try {
    direct.value = directRunning.value
      ? await api.stopDirectRead()
      : await api.startDirectRead();
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
    direct.value = await api.confirmAccountSwitch();
    summary.value = await api.inventorySummary();
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
      api.captureDesktop(),
      new Promise<never>((_, reject) => window.setTimeout(
        () => reject(new Error("系统截图在 8 秒内没有返回；请检查 macOS 的“屏幕录制”权限，或重新启动应用后再试。")),
        8000,
      )),
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
    canvas.getContext("2d")?.drawImage(
      source, sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, sourceWidth, sourceHeight,
    );
    source.close();
    const image = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("截图裁剪失败")), "image/png");
    });
    await closeCropPicker(false);
    notice.value = "正在本地识别框选区域…";
    ocrResult.value = await api.recognizeScreenshot(
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
      res = await api.listRelics(filter as RelicFilter);
    } else if (inventoryKind.value === "lightCone") {
      res = await api.listLightCones(filter as LightConeFilter);
    } else {
      res = await api.listCharacters(filter as CharacterFilter);
    }
    
    if (append) {
      result.value = {
        ...res,
        items: [...result.value.items, ...res.items]
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
    superimposition: "",
    path: "",
    eidolon: "",
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
  next.has(id) ? next.delete(id) : next.add(id);
  selectedIds.value = next;
}

function toggleAll() {
  selectedIds.value = allSelected.value
    ? new Set()
    : new Set(result.value.items.map(idFor));
}

async function openDetail(item: InventoryListItem) {
  const requestId = ++detailRequestId;
  detail.value = null;
  detailLoading.value = true;
  try {
    const nextDetail = await api.inventoryDetail(
      inventoryKind.value,
      idFor(item),
    );
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

function resetBuildPlan(characterId: number) {
  Object.assign(buildPlan, {
    characterId,
    cavernMode: "fourPiece",
    cavernSetA: cavernSetOptions.value[0]?.setId ?? 0,
    cavernSetB: null,
    planarSetId: planarSetOptions.value[0]?.setId ?? 0,
    mainStats: Object.fromEntries(relicSlots.map((slot) => [slot.value, []])),
    targets: [
      { statKey: "SPD", target: 180, priority: 1, minimum: 180 },
      { statKey: "CRIT Rate", target: 80, priority: 2, minimum: 65 },
    ],
  });
}

async function openBuild(item: CharacterListItem) {
  buildOpen.value = true;
  buildLoading.value = true;
  buildRecommendation.value = null;
  includeEquipped.value = false;
  buildDeleteArmed.value = false;
  try {
    const saved = await api.characterBuildPlan(item.characterId);
    resetBuildPlan(item.characterId);
    if (saved) Object.assign(buildPlan, saved);
  } catch (cause) {
    error.value = String(cause);
  } finally {
    buildLoading.value = false;
  }
}

function closeBuild() { buildOpen.value = false; buildRecommendation.value = null; buildDeleteArmed.value = false; }

function addBuildTarget() {
  if (buildPlan.targets.length >= 3) return;
  buildPlan.targets.push({ statKey: "CRIT DMG", target: 160, priority: buildPlan.targets.length + 1, minimum: 140 });
}

function removeBuildTarget(index: number) { buildPlan.targets.splice(index, 1); }

function copyTargetRowValues(source: HTMLElement, preview: HTMLElement) {
  const sourceFields = source.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select");
  const previewFields = preview.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select");
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
    const left = Math.max(12, Math.min(moveEvent.clientX - offsetX, window.innerWidth - previewBounds.width - 12));
    const top = Math.max(12, Math.min(moveEvent.clientY - offsetY, window.innerHeight - previewBounds.height - 12));
    preview.style.left = `${left}px`;
    preview.style.top = `${top}px`;
    const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest<HTMLElement>(".target-row");
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
  if (!buildPlan.characterId || !buildPlan.targets.length) { error.value = "请至少设置一条属性目标"; return; }
  buildLoading.value = true;
  try {
    buildPlan.targets.forEach((target, index) => { target.priority = index + 1; });
    await api.saveCharacterBuildPlan(JSON.parse(JSON.stringify(buildPlan)));
    notice.value = "毕业方案已保存";
    await calculateBuild();
  } catch (cause) { error.value = String(cause); } finally { buildLoading.value = false; }
}

async function calculateBuild() {
  buildLoading.value = true;
  try { buildRecommendation.value = await api.recommendCharacterBuild(buildPlan.characterId, includeEquipped.value); }
  catch (cause) { error.value = String(cause); } finally { buildLoading.value = false; }
}

async function deleteBuildPlan() {
  if (!buildPlan.characterId) return;
  if (!buildDeleteArmed.value) {
    buildDeleteArmed.value = true;
    notice.value = "再次点击“删除方案”确认删除";
    return;
  }
  buildLoading.value = true;
  try { await api.deleteCharacterBuildPlan(buildPlan.characterId); resetBuildPlan(buildPlan.characterId); buildRecommendation.value = null; buildDeleteArmed.value = false; notice.value = "毕业方案已删除"; }
  catch (cause) { error.value = String(cause); } finally { buildLoading.value = false; }
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
  ) return;
  busy.value = true;
  try {
    await api.deleteInventoryItems(inventoryKind.value, ids);
    summary.value = await api.inventorySummary();
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
  if (
    !window.confirm(
      `确定清空全部${label}本地记录？下次完整同步时会从游戏恢复。`,
    )
  ) return;
  busy.value = true;
  try {
    summary.value = await api.clearInventory(inventoryKind.value);
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
  ) return;
  busy.value = true;
  try {
    summary.value = await api.clearInventory(null);
    direct.value = await api.directReadSnapshot();
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
    const path = await api.exportInventory();
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
    const imported = await api.importInventory();
    if (imported) {
      summary.value = imported;
      await loadInventory();
      notice.value = `已导入 ${imported.relics} 件遗器、${imported.lightCones} 件光锥、${imported.characters} 名角色`;
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
    "HP%", "ATK%", "DEF%", "CRIT Rate", "CRIT DMG", "Effect Hit Rate", "Effect RES",
    "Break Effect", "Outgoing Healing Boost", "Energy Regeneration Rate", "Physical DMG Boost",
    "Fire DMG Boost", "Ice DMG Boost", "Lightning DMG Boost", "Wind DMG Boost", "Quantum DMG Boost", "Imaginary DMG Boost",
  ]);
  return `${value.toFixed(1)}${percentStats.has(stat) ? "%" : ""}`;
}

function pathLabel(path: string): string {
  const paths: Record<string, string> = {
    Destruction: "毁灭", Hunt: "巡猎", Erudition: "智识", Harmony: "同谐",
    Nihility: "虚无", Preservation: "存护", Abundance: "丰饶", Remembrance: "记忆",
  };
  return paths[path] ?? path;
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

function recordEntries(value: Record<string, unknown> | null | undefined): Array<[string, string]> {
  if (!value) return [];
  return Object.entries(value).map(([key, item]) => {
    if (typeof item === "number" || typeof item === "string") return [key, String(item)];
    if (typeof item === "boolean") return [key, item ? "已激活" : "未激活"];
    if (Array.isArray(item)) return [key, `${item.length} 项`];
    return [key, "已同步"];
  });
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
  await loadInitialState();
  unlistenDirect = await listen<DirectReadSnapshot>(
    "direct-read://status",
    (event) => {
      direct.value = event.payload;
    },
  );
  unlistenInventory = await listen<InventorySummary>(
    "inventory://changed",
    (event) => {
      summary.value = event.payload;
      if (activeView.value === "archive") void loadInventory();
    },
  );
});

onUnmounted(() => {
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
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true"><i /></span>
          <div>
            <p class="eyebrow">STARRAIL · AUTO TOOLS</p>
            <h1>星穹数据航站</h1>
          </div>
        </div>
        <div class="topbar-meta">
          <span class="platform-label">{{ capabilities?.platform ?? "SYSTEM" }}</span>
          <div :class="['runtime-pill', `tone-${phaseCode}`]">
            <span :class="['status-dot', { active: directRunning }]" />
            {{ phaseLabel }}
          </div>
        </div>
      </header>

      <nav class="module-nav" aria-label="工具模块">
        <span class="module-index">{{ activeView === "capture" ? "01" : activeView === "archive" ? "02" : "03" }}</span>
        <button
          :class="['nav-item', { active: activeView === 'capture' }]"
          type="button"
          @click="activeView = 'capture'"
        >
          <small>ACQUISITION</small>
          数据录入
        </button>
        <span class="nav-divider" />
        <button
          :class="['nav-item', { active: activeView === 'archive' }]"
          type="button"
          @click="activeView = 'archive'"
        >
          <small>MANAGEMENT</small>
          数据管理
        </button>
        <span class="nav-divider" />
        <button
          :class="['nav-item', { active: activeView === 'catalogue' }]"
          type="button"
          @click="activeView = 'catalogue'"
        >
          <small>CATALOGUE</small>
          套装图鉴
        </button>
        <span class="route-line" aria-hidden="true"><i /><i /><i /></span>
        <div class="nav-counts">
          <span>遗器 <b>{{ summary.relics }}</b></span>
          <span>光锥 <b>{{ summary.lightCones }}</b></span>
          <span>角色 <b>{{ summary.characters }}</b></span>
        </div>
      </nav>

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
            <span :class="['stage-badge', `phase-${direct.phase}`]">{{ phaseLabel }}</span>
          </div>

          <div :class="['signal-vessel', { running: directRunning }]">
            <div class="signal-grid" />
            <div class="signal-ring ring-a" />
            <div class="signal-ring ring-b" />
            <div class="signal-core">
              <span>{{ directRunning ? "◈" : "◇" }}</span>
              <b>{{ direct.phase === "ready" ? "LIVE" : direct.phase.toUpperCase() }}</b>
            </div>
            <div class="signal-sweep" />
          </div>

          <div class="direct-message">
            <span class="message-index">SYS</span>
            <div>
              <strong>{{ direct.message }}</strong>
              <small>
                {{
                  direct.lastSyncAt
                    ? `上次同步 ${formatTime(direct.lastSyncAt)}`
                    : "请先启动工具，再从「点击进入游戏」界面登录"
                }}
              </small>
            </div>
          </div>

          <div class="capture-counts">
            <div><span>遗器</span><b>{{ direct.relics }}</b><small>RELICS</small></div>
            <div><span>光锥</span><b>{{ direct.lightCones }}</b><small>LIGHT CONES</small></div>
            <div><span>角色</span><b>{{ direct.characters }}</b><small>CHARACTERS</small></div>
          </div>

          <div v-if="direct.requiresAccountSwitch" class="account-warning">
            <div>
              <strong>检测到不同账号</strong>
              <p>当前数据与本次登录不一致。切换将清空现有本地档案。</p>
            </div>
            <Button type="button" severity="danger" :disabled="busy" @click="switchAccount">确认切换</Button>
          </div>

          <Button
            class="primary-action"
            :disabled="busy || direct.phase === 'unsupported'"
            @click="toggleDirectRead"
          >
            <span class="action-symbol" aria-hidden="true">{{ directRunning ? "■" : "▶" }}</span>
            <span>
              <small>GAME DATA SYNC</small>
              {{ directRunning ? "停止实时监听" : "启动游戏数据直读" }}
            </span>
            <i aria-hidden="true">→</i>
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
              <div><span>最近同步</span><strong>{{ formatTime(summary.lastSyncAt) }}</strong></div>
              <div><span>已归档数据</span><strong>{{ summary.relics + summary.lightCones + summary.characters }} 条</strong></div>
            </div>
            <Button class="secondary-action" type="button" outlined :disabled="busy" @click="exportData">
              <span>导出数据</span><i>↗</i>
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
            <p class="ocr-capture-note"><b>01</b> 点击后进入全屏框选模式；仅识别虚线框内的内容。</p>
            <Button class="secondary-action" outlined :disabled="busy" @click="runOcrScreenshot">
              <span>{{ busy ? "正在截图 / 识别" : "截图并框选" }}</span><i>◎</i>
            </Button>
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
              <span class="empty-symbol">◇</span>
              <p>识别结果仅供核对，暂不会写入数据管理</p>
              <small>点击“截图并框选”开始截图</small>
            </div>
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
              <span><small>{{ entry.code }}</small>{{ entry.label }}</span>
              <b>{{ entry.count }}</b>
            </button>
          </div>
          <div class="archive-meta"><span>最近同步</span><strong>{{ formatTime(summary.lastSyncAt) }}</strong></div>
          <Button class="secondary-action" type="button" outlined :disabled="busy" @click="exportData">
            <span>导出数据</span><i>↗</i>
          </Button>
          <Button class="secondary-action" type="button" outlined :disabled="busy" @click="importData">
            <span>导入 JSON</span><i>↙</i>
          </Button>
          <Button class="danger-action sidebar-clear" type="button" severity="danger" outlined :disabled="busy" @click="clearAll">清空全部数据</Button>
        </aside>

        <article class="panel archive-main">
          <header class="archive-heading">
            <div>
              <p class="eyebrow">FILTER RESULTS</p>
              <h2>{{ kindTitle }}</h2>
            </div>
            <div class="archive-actions">
              <Button
                class="danger-action"
                type="button"
                severity="danger"
                outlined
                :disabled="busy || selectedIds.size === 0"
                @click="deleteSelected"
              >
                删除所选 {{ selectedIds.size || "" }}
              </Button>
              <Button class="ghost-action" type="button" outlined :disabled="busy" @click="clearCurrent">
                清空本类
              </Button>
              <Button class="danger-action" type="button" severity="danger" outlined :disabled="busy" @click="clearAll">
                全部清空
              </Button>
            </div>
          </header>

          <div class="filter-toolbar">
            <label class="quick-search"><span class="visually-hidden">关键词</span><InputText v-model="filters.search" placeholder="搜索名称或套装" @keyup.enter="applyFilters" /></label>
            <Button class="filter-toggle" type="button" outlined @click="filterOpen = true">筛选条件 <b v-if="activeFilterCount">{{ activeFilterCount }}</b></Button>
            <Button v-if="activeFilterCount" class="clear-filter" type="button" text @click="resetFilters">清除筛选</Button>
            <span class="result-count">{{ result.total }} 条记录</span>
          </div>

          <Drawer v-model:visible="filterOpen" position="right" class="filter-drawer">
          <form @submit.prevent="applyFilters">
            <header class="filter-drawer-heading">
              <div><p class="eyebrow">FILTERS</p><h2>筛选条件</h2><small>选择需要的条件，未选择即代表不限。</small></div>
              <Button type="button" aria-label="关闭筛选" text @click="filterOpen = false">×</Button>
            </header>
            <div class="filter-scroll">
            <template v-if="inventoryKind === 'relic'">
              <fieldset class="filter-group filter-group-wide"><legend>部位 <em>可多选</em></legend><div class="filter-chips">
                <label v-for="slot in relicSlots" :key="slot.value" class="filter-chip"><input v-model="filters.slots" type="checkbox" :value="slot.value" /><span>{{ slot.label }}</span></label>
              </div></fieldset>
              <fieldset class="filter-group"><legend>星级 <em>可多选</em></legend><div class="filter-chips">
                <label v-for="rarity in [5, 4, 3, 2]" :key="rarity" class="filter-chip"><input v-model="filters.rarities" type="checkbox" :value="rarity" /><span>{{ rarity }} 星</span></label>
              </div></fieldset>
              <fieldset class="filter-group filter-group-wide"><legend>主词条 <em>随部位更新 · 可多选</em></legend><div class="filter-chips">
                <label v-for="stat in availableMainStats" :key="stat" class="filter-chip"><input v-model="filters.mainStats" type="checkbox" :value="stat" /><span>{{ statLabel(stat) }}</span></label>
              </div></fieldset>
              <fieldset class="filter-group filter-group-wide"><legend>副词条 <em>可多选</em></legend><div class="filter-chips">
                <label v-for="stat in relicSubStats" :key="stat" class="filter-chip"><input v-model="filters.subStats" type="checkbox" :value="stat" /><span>{{ statLabel(stat) }}</span></label>
              </div></fieldset>
              <fieldset class="filter-group filter-group-wide"><legend>副词条强化次数 <em>每 4 级增加一次 · 0–5 次</em></legend>
                <div class="filter-range">
                  <label><span>最少</span><Select v-model="filters.minSubstatCount" :options="substatCountOptions" option-label="label" option-value="value" /></label>
                  <label><span>最多</span><Select v-model="filters.maxSubstatCount" :options="substatCountOptions" option-label="label" option-value="value" /></label>
                </div>
              </fieldset>
              <label><span>锁定</span>
                <Select v-model="filters.locked" :options="[{ label: '全部', value: '' }, { label: '已锁定', value: 'true' }, { label: '未锁定', value: 'false' }]" option-label="label" option-value="value" />
              </label>
              <label><span>弃置</span>
                <Select v-model="filters.discard" :options="[{ label: '全部', value: '' }, { label: '已标记', value: 'true' }, { label: '未标记', value: 'false' }]" option-label="label" option-value="value" />
              </label>
            </template>
            <template v-else-if="inventoryKind === 'lightCone'">
              <label><span>叠影</span><Select v-model="filters.superimposition" :options="['', 1, 2, 3, 4, 5]" :option-label="(value) => value === '' ? '不限' : `${value} 阶`" /></label>
              <label><span>锁定</span>
                <Select v-model="filters.locked" :options="[{ label: '全部', value: '' }, { label: '已锁定', value: 'true' }, { label: '未锁定', value: 'false' }]" option-label="label" option-value="value" />
              </label>
            </template>
            <template v-else>
              <label><span>命途</span><Select v-model="filters.path" :options="[{ label: '全部命途', value: '' }, { label: '毁灭', value: 'Destruction' }, { label: '巡猎', value: 'Hunt' }, { label: '智识', value: 'Erudition' }, { label: '同谐', value: 'Harmony' }, { label: '虚无', value: 'Nihility' }, { label: '存护', value: 'Preservation' }, { label: '丰饶', value: 'Abundance' }, { label: '记忆', value: 'Remembrance' }]" option-label="label" option-value="value" /></label>
              <label><span>星魂</span><Select v-model="filters.eidolon" :options="['', 0, 1, 2, 3, 4, 5, 6]" :option-label="(value) => value === '' ? '不限' : `${value} 魂`" /></label>
            </template>
            <label v-if="inventoryKind !== 'character'"><span>装备状态</span>
              <Select v-model="filters.equipped" :options="[{ label: '全部', value: '' }, { label: '已装备', value: 'true' }, { label: '未装备', value: 'false' }]" option-label="label" option-value="value" />
            </label>
            </div>
            <div class="filter-actions">
              <Button class="filter-reset" type="button" outlined @click="resetFilters">重置全部</Button>
              <Button class="filter-submit" type="submit" :disabled="busy">查看结果</Button>
            </div>
          </form>
          </Drawer>

          <div class="table-shell" @scroll="onTableScroll">
            <table>
              <thead>
                <tr>
                  <th class="check-cell"><Checkbox binary :model-value="allSelected" @update:model-value="toggleAll" /></th>
                  <th>名称</th>
                  <template v-if="inventoryKind === 'relic'">
                    <th>等级</th><th>主词条</th><th>副词条</th><th>装备角色</th>
                  </template>
                  <template v-else-if="inventoryKind === 'lightCone'">
                    <th>等级</th><th>突破</th><th>叠影</th><th>装备角色</th><th>状态</th>
                  </template>
                  <template v-else>
                    <th>命途</th><th>等级</th><th>突破</th><th>星魂</th><th>能力版本</th>
                  </template>
                  <th class="detail-cell">详情</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in result.items" :key="idFor(item)">
                  <td class="check-cell">
                    <Checkbox binary :model-value="selectedIds.has(idFor(item))" @update:model-value="toggleSelected(idFor(item))" />
                  </td>
                  <td>
                    <template v-if="inventoryKind === 'relic'">
                      <div class="relic-name-cell">
                        <div class="relic-icon-box">
                          <img v-if="relicPieceImage(item as RelicListItem)" :src="relicPieceImage(item as RelicListItem)!" :alt="slotLabel((item as RelicListItem).slot)" class="relic-piece-image" />
                          <span v-else class="relic-icon-star">☆</span>
                        </div>
                        <div class="relic-name-info">
                          <strong class="item-name">{{ itemTitle(item) }}</strong>
                          <small class="relic-subtitle">{{ (item as RelicListItem).setName }} · {{ slotLabel((item as RelicListItem).slot) }}</small>
                        </div>
                      </div>
                    </template>
                    <template v-else>
                      <img v-if="inventoryKind === 'character' && characterAvatar((item as CharacterListItem).name)" class="character-table-avatar" :src="characterAvatar((item as CharacterListItem).name)!" :alt="`${item.name} 头像`" />
                      <strong class="item-name">{{ itemTitle(item) }}</strong>
                      <small class="item-id">#{{ idFor(item) }}</small>
                    </template>
                  </td>
                  <template v-if="inventoryKind === 'relic'">
                    <td>
                      <span :class="['relic-level-badge', { 'is-max': (item as RelicListItem).level === 15 }]">+{{ (item as RelicListItem).level }}</span>
                    </td>
                    <td>
                      <div class="relic-main-stat">
                        <span class="stat-name">{{ statLabel((item as RelicListItem).mainStat) }}</span>
                        <strong class="stat-value">{{ formatStatValue((item as RelicListItem).mainStat, (item as RelicListItem).mainStatValue) }}</strong>
                      </div>
                    </td>
                    <td>
                      <div class="relic-substats-grid">
                        <span v-for="stat in (item as RelicListItem).substats" :key="stat.key" :class="['relic-substat-item', `hit-${stat.count}`]">
                          <span class="substat-name">{{ statLabel(stat.key) }}</span>
                          <strong class="substat-value">{{ formatStatValue(stat.key, stat.value) }}</strong>
                          <i v-if="stat.count >= 3" class="hit-count-badge">{{ stat.count === 5 ? 'MAX' : `+${stat.count}` }}</i>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span v-if="(item as RelicListItem).location" :class="['relic-equip-tag', 'element-' + getCharacterElement((item as RelicListItem).location)]">
                        {{ (item as RelicListItem).location }}
                      </span>
                      <span v-else class="relic-equip-tag unequipped">未装备</span>
                    </td>
                  </template>
                  <template v-else-if="inventoryKind === 'lightCone'">
                    <td><b>Lv.{{ (item as LightConeListItem).level }}</b></td>
                    <td>{{ (item as LightConeListItem).ascension }}</td>
                    <td>叠影 {{ (item as LightConeListItem).superimposition }}</td>
                    <td>{{ (item as LightConeListItem).location || "—" }}</td>
                    <td><Tag v-if="(item as LightConeListItem).locked" value="锁定" class="data-tag" /></td>
                  </template>
                  <template v-else>
                    <td>{{ pathLabel((item as CharacterListItem).path) }}</td>
                    <td><b>Lv.{{ (item as CharacterListItem).level }}</b></td>
                    <td>{{ (item as CharacterListItem).ascension }}</td>
                    <td>{{ (item as CharacterListItem).eidolon }}</td>
                    <td>V{{ (item as CharacterListItem).abilityVersion }}</td>
                  </template>
                  <td class="detail-cell">
                    <Button class="row-action" type="button" text @click="openDetail(item)">查看</Button>
                    <Button v-if="inventoryKind === 'character'" class="row-action build-action" type="button" text @click="openBuild(item as CharacterListItem)">培养方案</Button>
                  </td>
                </tr>
                <tr v-if="!result.items.length">
                  <td colspan="8" class="table-empty">
                    <span>◇</span>
                    <strong>{{ busy ? "正在检索数据库…" : "没有符合条件的数据" }}</strong>
                    <small>启动游戏数据直读并重新登录后，档案会自动出现</small>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="isAppending" class="loading-more">
              <span class="loading-spinner">↻</span> 加载更多数据中...
            </div>
          </div>
        </article>
      </section>

      <section v-else class="catalogue-workspace">
        <header class="catalogue-heading">
          <div>
            <p class="eyebrow">LOCAL REFERENCE DATA</p>
            <h2>遗器与位面饰品图鉴</h2>
            <p>随客户端打包的公共数据，不依赖游戏登录或本地背包。</p>
          </div>
          <small v-if="relicCatalogue.source.syncedAt">更新：{{ new Date(relicCatalogue.source.syncedAt).toLocaleDateString("zh-CN") }}</small>
          <small v-else>尚未同步图鉴数据</small>
        </header>
        <div v-if="relicCatalogue.sets.length || characterCatalogue.characters.length" class="catalogue-groups">
          <section v-for="group in [{ key: 'cavern', title: '隧洞遗器' }, { key: 'planar', title: '位面饰品' }]" :key="group.key" v-show="catalogueGroups[group.key as keyof typeof catalogueGroups].length" class="catalogue-group">
            <h3>{{ group.title }} <small>{{ catalogueGroups[group.key as keyof typeof catalogueGroups].length }} 套</small></h3>
            <div class="catalogue-grid">
              <article v-for="set in catalogueGroups[group.key as keyof typeof catalogueGroups] as RelicSetCatalogueEntry[]" :key="set.id" class="catalogue-card">
                <img v-if="set.image" :src="set.image" :alt="set.name" />
                <span v-else class="catalogue-placeholder">◇</span>
                <div><small>#{{ set.id }}</small><h4>{{ set.name }}</h4><p><b>2 件</b>{{ set.effects.twoPiece }}</p><p v-if="set.effects.fourPiece"><b>4 件</b>{{ set.effects.fourPiece }}</p></div>
              </article>
            </div>
          </section>
          <section class="catalogue-group character-catalogue-group">
            <h3>角色基础信息 <small>{{ characterCatalogue.characters.length }} 名</small></h3>
            <div v-if="characterCatalogue.characters.length" class="character-catalogue-grid">
              <article v-for="character in characterCatalogue.characters" :key="character.slug" class="character-catalogue-card">
                <div v-if="character.image" class="character-catalogue-portrait" :style="character.backgroundImage ? { backgroundImage: `url(${character.backgroundImage})` } : undefined">
                  <img class="character-image" :src="character.image" :alt="character.name" />
                  <div class="character-icons">
                    <img v-if="character.elementIcon" :src="character.elementIcon" alt="" class="element-icon" />
                    <img v-if="character.pathIcon" :src="character.pathIcon" alt="" class="path-icon" />
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
              </article>
            </div>
            <p v-else class="catalogue-source-note">角色目录将在下一次运行同步命令后显示。</p>
          </section>
        </div>
        <div v-else class="catalogue-empty"><span>◇</span><strong>图鉴内容暂未准备好</strong><p>当前版本暂时无法展示遗器、饰品和角色图鉴。你的本地背包与游戏数据使用不受影响。</p></div>
      </section>

      <footer class="app-footer">
        <span>StarRail-Auto-Tools</span>
        <span>{{ capabilities?.note }}</span>
      </footer>
    </main>

    <div v-if="screenshotPreviewUrl" class="crop-backdrop" @click.self="closeCropPicker()">
      <section class="crop-picker" aria-label="截图区域选择">
        <header class="crop-picker-header">
          <div><p class="eyebrow">SELECT OCR REGION</p><h2>框选识别区域</h2></div>
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
          <span v-if="hasCropSelection" class="crop-box" :style="{ left: `${cropBox.left}px`, top: `${cropBox.top}px`, width: `${cropBox.width}px`, height: `${cropBox.height}px` }" />
          <div v-if="hasCropSelection" class="crop-toolbar" :style="{ left: `${cropBox.left + cropBox.width + 10}px`, top: `${cropBox.top + cropBox.height + 10}px` }" @pointerdown.stop>
            <button type="button" title="确认识别" :disabled="busy" @click="recognizeCrop">✓</button>
            <button type="button" title="重新框选" @click="resetCropSelection">↻</button>
            <button type="button" title="取消截图" @click="closeCropPicker()">×</button>
          </div>
        </div>
        <footer class="crop-picker-actions">
          <span v-if="hasCropSelection">已选择 {{ Math.round(cropBox.width) }} × {{ Math.round(cropBox.height) }} px</span>
          <span v-else>拖拽鼠标开始框选</span>
        </footer>
      </section>
    </div>

    <div v-if="buildOpen" class="detail-backdrop build-backdrop" @click.self="closeBuild">
      <aside class="detail-drawer build-drawer">
        <header>
          <div><p class="eyebrow">BUILD BLUEPRINT</p><h2>培养方案 / 毕业目标</h2><small>属性统计包含已换算的主词条与同步的副词条。</small></div>
          <button type="button" aria-label="关闭培养方案" @click="closeBuild">×</button>
        </header>
        <div v-if="buildLoading" class="detail-loading">正在计算毕业方案…</div>
        <div v-else class="build-scroll">
          <section class="build-section">
            <h3>套装结构</h3>
            <div class="build-grid">
              <label><span>四件遗器区</span><Select v-model="buildPlan.cavernMode" :options="[{ label: '指定 4 件套', value: 'fourPiece' }, { label: '指定 2 件 + 2 件', value: 'twoPlusTwo' }]" option-label="label" option-value="value" /></label>
              <label><span>{{ buildPlan.cavernMode === 'fourPiece' ? '四件套' : '第一组 2 件套' }}</span><Select v-model="buildPlan.cavernSetA" :options="cavernSetOptions" option-label="name" option-value="setId" /></label>
              <label v-if="buildPlan.cavernMode === 'twoPlusTwo'"><span>第二组 2 件套</span><Select v-model="buildPlan.cavernSetB" :options="cavernSetOptions" option-label="name" option-value="setId" /></label>
              <label><span>位面饰品 2 件套</span><Select v-model="buildPlan.planarSetId" :options="planarSetOptions" option-label="name" option-value="setId" /></label>
            </div>
          </section>

          <section class="build-section"><h3>各部位允许主词条</h3>
            <div class="main-stat-grid">
              <fieldset v-for="slot in relicSlots" :key="slot.value"><legend>{{ slot.label }}</legend>
                <label v-for="stat in (relicMainStats[slot.value] ?? [])" :key="stat" class="filter-chip"><input v-model="buildPlan.mainStats[slot.value]" type="checkbox" :value="stat" /><span>{{ statLabel(stat) }}</span></label>
              </fieldset>
            </div>
          </section>

          <section class="build-section"><div class="build-section-heading"><h3>属性目标 <small>按顺序决定优先级</small></h3><button type="button" class="row-action" :disabled="buildPlan.targets.length >= 3" @click="addBuildTarget">+ 添加</button></div>
            <div class="target-column-headings" aria-hidden="true"><span /><span /><span>属性</span><span>目标</span><span>最低标准</span><span /></div>
            <div v-for="(target, index) in buildPlan.targets" :key="target.statKey" :data-target-index="index" :class="['target-row', { dragging: draggedTargetIndex === index, 'drag-over': draggedTargetIndex !== null && dragTargetIndex === index && draggedTargetIndex !== index }]">
              <span class="drag-handle" title="按住拖拽以调整优先级" @pointerdown="beginBuildTargetDrag($event, index)">⠿</span><b>P{{ index + 1 }}</b><Select v-model="target.statKey" :options="relicSubStats.map((stat) => ({ label: statLabel(stat), value: stat }))" option-label="label" option-value="value" aria-label="属性" />
              <label aria-label="目标"><InputNumber v-model="target.target" :min="0" /></label>
              <label aria-label="最低标准"><InputNumber v-model="target.minimum" :min="0" :max="target.target" /></label>
              <Button class="target-remove" type="button" severity="danger" text aria-label="删除属性目标" @click="removeBuildTarget(index)">×</Button>
            </div>
          </section>

          <section v-if="buildRecommendation" class="build-section build-results"><h3>当前进度</h3>
            <div v-for="progress in buildRecommendation.current" :key="progress.statKey" class="progress-row"><div><b>{{ statLabel(progress.statKey) }}</b><span>{{ progress.current.toFixed(1) }} / {{ progress.target }}</span></div><i><em :style="{ width: `${progressPercent(progress)}%` }" /></i><small v-if="progress.gap">缺 {{ progress.gap.toFixed(1) }}</small><small v-else>已达标</small></div>
            <h3>推荐组合</h3><p class="build-message">{{ buildRecommendation.message }}</p>
            <div v-if="buildRecommendation.recommended" class="recommend-list"><div v-for="item in buildRecommendation.recommended" :key="item.itemId"><b>{{ slotLabel(item.slot) }}</b><span>{{ item.name }} · {{ statLabel(item.mainStat) }}</span><small v-if="item.borrowed">借用：{{ item.location }}</small></div></div>
            <div v-if="buildRecommendation.recommendedProgress" class="recommended-summary"><span v-for="progress in buildRecommendation.recommendedProgress" :key="progress.statKey">{{ statLabel(progress.statKey) }} {{ progress.current.toFixed(1) }}<b v-if="progress.gap"> · 缺 {{ progress.gap.toFixed(1) }}</b></span></div>
          </section>
        </div>
        <footer class="build-actions"><label class="include-equipped"><Checkbox v-model="includeEquipped" binary /> 纳入已装备遗器</label><span /><Button :class="['filter-reset', { 'confirm-delete': buildDeleteArmed }]" type="button" outlined @click="deleteBuildPlan">{{ buildDeleteArmed ? '再次点击确认' : '删除方案' }}</Button><Button class="filter-submit" type="button" @click="saveBuildPlan">保存并计算</Button><Button class="filter-submit" type="button" :disabled="!buildPlan.characterId" @click="calculateBuild">重新计算</Button></footer>
      </aside>
    </div>

    <div v-if="detail || detailLoading" class="detail-backdrop" @click.self="closeDetail">
      <aside :class="['detail-drawer', { 'relic-detail-drawer': detailRelic, 'character-detail-drawer': detailCharacter }]">
        <header>
          <div><p class="eyebrow">{{ detailRelic ? 'RELIC ANALYSIS' : detailCharacter ? 'CHARACTER DOSSIER' : 'RECORD DETAIL' }}</p><h2>{{ detailRelic ? '遗器档案详情' : detailCharacter ? '角色档案详情' : '结构化详情' }}</h2></div>
          <button type="button" aria-label="关闭详情" @click="closeDetail">×</button>
        </header>
        <div v-if="detailLoading" class="detail-loading">正在读取 SQLite 记录…</div>
        <section v-else-if="detailRelic" class="relic-detail-card">
          <div class="relic-detail-identity">
            <div class="relic-slot-mark">{{ slotLabel(detailRelic.slot).slice(0, 1) }}</div>
            <div><p>{{ detailRelic.setName }}</p><h3>{{ detailRelic.name }}</h3><small>#{{ detailRelic.itemId }} · {{ slotLabel(detailRelic.slot) }}</small></div>
            <b class="relic-level">+{{ detailRelic.level }}</b>
          </div>

          <div class="relic-rarity" :aria-label="`${detailRelic.rarity} 星`">{{ '✦'.repeat(detailRelic.rarity) }}</div>
          <section class="main-stat-card">
            <p>主词条 <span>MAIN STAT</span></p>
            <strong>{{ statLabel(detailRelic.mainStat) }}</strong>
            <b>+{{ formatStatValue(detailRelic.mainStat, detailRelic.mainStatValue) }}</b>
          </section>

          <section class="substat-card">
            <header><div><p class="eyebrow">SUB STATS</p><h3>副词条</h3></div><small>{{ detailRelic.substats?.length ?? 0 }} 条记录</small></header>
            <div v-if="detailRelic.substats?.length" class="substat-list">
              <div v-for="(stat, index) in detailRelic.substats" :key="`${stat.kind}-${index}`" :class="['substat-row', { auxiliary: stat.kind !== 'normal' }]">
                <span>{{ statLabel(stat.key) }}</span><b>+{{ formatStatValue(stat.key, stat.value) }}</b><small v-if="stat.count">强化 {{ stat.count }} 次</small><em v-if="stat.kind !== 'normal'">{{ stat.kind === 'reroll' ? '重铸' : '预览' }}</em>
              </div>
            </div>
            <p v-else class="empty-substats">该遗器尚未记录副词条。</p>
          </section>

          <footer class="relic-detail-footer">
            <div><span>装备归属</span><b>{{ detailRelic.location || '未装备' }}</b></div>
            <div><span>状态</span><b>{{ detailRelic.locked ? '已锁定' : detailRelic.discard ? '已标记弃置' : '正常' }}</b></div>
            <div><span>更新于</span><b>{{ formatTime(detailRelic.updatedAt) }}</b></div>
          </footer>
        </section>
        <section v-else-if="detailCharacter" class="character-detail-card">
          <div class="character-identity">
            <img v-if="characterAvatar(detailCharacter.name)" class="character-detail-avatar" :src="characterAvatar(detailCharacter.name)!" :alt="`${detailCharacter.name} 头像`" />
            <div v-else class="path-seal">{{ pathLabel(detailCharacter.path).slice(0, 1) }}</div>
            <div><p>{{ pathLabel(detailCharacter.path) }} · PATH</p><h3>{{ detailCharacter.name }}</h3><small>#{{ detailCharacter.characterId }}</small></div>
            <b>Lv.{{ detailCharacter.level }}</b>
          </div>
          <div class="character-metrics">
            <div><span>突破</span><b>{{ detailCharacter.ascension }}</b></div><div><span>星魂</span><b>{{ detailCharacter.eidolon }}</b></div><div><span>能力版本</span><b>V{{ detailCharacter.abilityVersion }}</b></div>
          </div>
          <section class="character-data-section">
            <header><div><p class="eyebrow">SKILL LEVELS</p><h3>技能等级</h3></div><small>{{ recordEntries(detailCharacter.skills).length }} 项</small></header>
            <div v-if="recordEntries(detailCharacter.skills).length" class="character-data-list"><div v-for="([key, value]) in recordEntries(detailCharacter.skills)" :key="key"><span>{{ key }}</span><b>{{ value }}</b></div></div>
            <p v-else class="empty-substats">未同步技能数据。</p>
          </section>
          <section class="character-data-section">
            <header><div><p class="eyebrow">TRACE STATUS</p><h3>行迹数据</h3></div><small>{{ recordEntries(detailCharacter.traces).length }} 项</small></header>
            <div v-if="recordEntries(detailCharacter.traces).length" class="character-data-list"><div v-for="([key, value]) in recordEntries(detailCharacter.traces)" :key="key"><span>{{ key }}</span><b>{{ value }}</b></div></div>
            <p v-else class="empty-substats">未同步行迹数据。</p>
          </section>
          <section v-if="detailCharacter.memosprite" class="memosprite-note"><span>忆灵</span><b>已同步 {{ recordEntries(detailCharacter.memosprite).length }} 项数据</b></section>
          <footer class="relic-detail-footer"><div><span>更新于</span><b>{{ formatTime(detailCharacter.updatedAt) }}</b></div><div><span>数据来源</span><b>游戏同步</b></div></footer>
        </section>
        <pre v-else>{{ detailJson() }}</pre>
      </aside>
    </div>

    <div v-if="error" class="toast error-toast" role="alert" @click="error = ''">
      <span class="toast-symbol">!</span>
      <div><strong>任务未完成</strong><p>{{ error }}</p></div>
    </div>
    <div v-if="notice" class="toast notice-toast" role="status" @click="notice = ''">
      <span class="toast-symbol">✓</span>
      <div><strong>{{ busy ? "正在处理" : "操作完成" }}</strong><p>{{ notice }}</p></div>
    </div>
  </div>
</template>
