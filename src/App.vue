<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { api } from "./services/tauri";
import type {
  CharacterFilter,
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
  SystemCapabilities,
} from "./types";

type ViewName = "capture" | "archive";

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

const imagePath = ref("");
const modelConfig = ref<OcrModelConfig>({
  detectionModel: "models/text_detection.onnx",
  recognitionModel: "models/text_recognition.onnx",
  characterDictionary: "models/character_dict.txt",
});
const ocrResult = ref<OcrImageResult | null>(null);

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

const filters = reactive({
  search: "",
  slot: "",
  rarity: "",
  minLevel: "",
  maxLevel: "",
  mainStat: "",
  subStat: "",
  locked: "",
  discard: "",
  equipped: "",
  minAscension: "",
  superimposition: "",
  path: "",
  eidolon: "",
});

let unlistenDirect: UnlistenFn | undefined;
let unlistenInventory: UnlistenFn | undefined;
let detailRequestId = 0;

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
      slot: filters.slot || undefined,
      rarity: numberOrUndefined(filters.rarity),
      minLevel: numberOrUndefined(filters.minLevel),
      maxLevel: numberOrUndefined(filters.maxLevel),
      mainStat: filters.mainStat.trim() || undefined,
      subStat: filters.subStat.trim() || undefined,
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
      minLevel: numberOrUndefined(filters.minLevel),
      maxLevel: numberOrUndefined(filters.maxLevel),
      minAscension: numberOrUndefined(filters.minAscension),
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
    minLevel: numberOrUndefined(filters.minLevel),
    maxLevel: numberOrUndefined(filters.maxLevel),
    minAscension: numberOrUndefined(filters.minAscension),
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

async function runOcrSample() {
  if (!imagePath.value.trim()) {
    error.value = "请填写一张本地截图的路径";
    return;
  }
  busy.value = true;
  error.value = "";
  ocrResult.value = null;
  try {
    ocrResult.value = await api.recognizeImage(
      imagePath.value.trim(),
      modelConfig.value,
    );
  } catch (cause) {
    error.value = String(cause);
  } finally {
    busy.value = false;
  }
}

async function loadInventory() {
  if (activeView.value !== "archive") return;
  busy.value = true;
  error.value = "";
  try {
    const filter = currentFilter();
    if (inventoryKind.value === "relic") {
      result.value = await api.listRelics(filter as RelicFilter);
    } else if (inventoryKind.value === "lightCone") {
      result.value = await api.listLightCones(filter as LightConeFilter);
    } else {
      result.value = await api.listCharacters(filter as CharacterFilter);
    }
    selectedIds.value = new Set();
  } catch (cause) {
    error.value = String(cause);
  } finally {
    busy.value = false;
  }
}

function resetFilters() {
  Object.assign(filters, {
    search: "",
    slot: "",
    rarity: "",
    minLevel: "",
    maxLevel: "",
    mainStat: "",
    subStat: "",
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
          <span class="protocol-label">{{ direct.protocolVersion }}</span>
          <span class="platform-label">{{ capabilities?.platform ?? "SYSTEM" }}</span>
          <div :class="['runtime-pill', `tone-${phaseCode}`]">
            <span :class="['status-dot', { active: directRunning }]" />
            {{ phaseLabel }}
          </div>
        </div>
      </header>

      <nav class="module-nav" aria-label="工具模块">
        <span class="module-index">{{ activeView === "capture" ? "01" : "02" }}</span>
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
          <small>ARCHIVE</small>
          数据管理
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
          <div class="panel-corner" aria-hidden="true">NET-01</div>
          <div class="panel-heading">
            <div>
              <p class="eyebrow">PACKET RELAY · WINDOWS</p>
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
            <span class="signal-port port-a">UDP 23301</span>
            <span class="signal-port port-b">UDP 23302</span>
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
            <button type="button" :disabled="busy" @click="switchAccount">确认切换</button>
          </div>

          <button
            class="primary-action"
            :disabled="busy || direct.phase === 'unsupported'"
            @click="toggleDirectRead"
          >
            <span class="action-symbol" aria-hidden="true">{{ directRunning ? "■" : "▶" }}</span>
            <span>
              <small>PACKET MONITOR CONTROL</small>
              {{ directRunning ? "停止实时监听" : "启动游戏数据直读" }}
            </span>
            <i aria-hidden="true">→</i>
          </button>
          <p class="privilege-note">
            Windows 使用系统 Packet Monitor，应用启动时需要管理员权限；不读取进程内存。
          </p>
        </article>

        <div class="capture-side">
          <article class="panel sync-panel">
            <div class="panel-heading compact">
              <div>
                <p class="eyebrow">LOCAL ARCHIVE</p>
                <h2>本地数据仓</h2>
              </div>
              <span class="record-dot" />
            </div>
            <div class="sync-ledger">
              <div><span>存储介质</span><strong>SQLite · WAL</strong></div>
              <div><span>同步策略</span><strong>完整快照 + 增量</strong></div>
              <div><span>最后写入</span><strong>{{ formatTime(summary.lastSyncAt) }}</strong></div>
            </div>
            <button class="secondary-action" type="button" :disabled="busy" @click="exportData">
              <span>导出 HSR-Scanner JSON</span><i>↗</i>
            </button>
          </article>

          <article class="panel ocr-panel">
            <div class="panel-heading compact">
              <div>
                <p class="eyebrow">RECOGNITION LAB</p>
                <h2>截图识别校准</h2>
              </div>
              <span class="local-badge">OCR · LOCAL</span>
            </div>
            <label class="field">
              <span><b>01</b> 测试截图路径</span>
              <input v-model="imagePath" placeholder="选择一张背包详情截图" />
            </label>
            <details>
              <summary><span>模型参数</span><i>展开配置 ＋</i></summary>
              <div class="model-fields">
                <input v-model="modelConfig.detectionModel" aria-label="检测模型" />
                <input v-model="modelConfig.recognitionModel" aria-label="识别模型" />
                <input v-model="modelConfig.characterDictionary" aria-label="字符字典" />
              </div>
            </details>
            <button class="secondary-action" :disabled="busy" @click="runOcrSample">
              <span>执行 Rust OCR</span><i>◎</i>
            </button>
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
              <p>OCR 结果仅用于校准，本期不写入档案</p>
              <small>等待导入背包详情截图</small>
            </div>
          </article>
        </div>
      </section>

      <section v-else class="archive-workspace">
        <aside class="panel archive-sidebar">
          <p class="eyebrow">DATA CATALOG</p>
          <h2>数据档案</h2>
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
          <div class="archive-meta">
            <span>协议版本</span>
            <strong>{{ summary.protocolVersion }}</strong>
            <span>最近同步</span>
            <strong>{{ formatTime(summary.lastSyncAt) }}</strong>
          </div>
          <button class="secondary-action" type="button" :disabled="busy" @click="exportData">
            <span>导出全部数据</span><i>↗</i>
          </button>
        </aside>

        <article class="panel archive-main">
          <header class="archive-heading">
            <div>
              <p class="eyebrow">QUERY MATRIX</p>
              <h2>{{ kindTitle }}</h2>
            </div>
            <div class="archive-actions">
              <button
                class="danger-action"
                type="button"
                :disabled="busy || selectedIds.size === 0"
                @click="deleteSelected"
              >
                删除所选 {{ selectedIds.size || "" }}
              </button>
              <button class="ghost-action" type="button" :disabled="busy" @click="clearCurrent">
                清空本类
              </button>
              <button class="danger-action" type="button" :disabled="busy" @click="clearAll">
                全部清空
              </button>
            </div>
          </header>

          <form class="filter-matrix" @submit.prevent="result.page = 1; loadInventory()">
            <label class="filter-search">
              <span>关键词</span>
              <input v-model="filters.search" placeholder="名称 / 套装" />
            </label>
            <template v-if="inventoryKind === 'relic'">
              <label><span>部位</span>
                <select v-model="filters.slot">
                  <option value="">全部部位</option>
                  <option value="Head">头部</option><option value="Hands">手部</option>
                  <option value="Body">躯干</option><option value="Feet">脚部</option>
                  <option value="PlanarSphere">位面球</option><option value="LinkRope">连结绳</option>
                </select>
              </label>
              <label><span>星级</span>
                <select v-model="filters.rarity"><option value="">全部</option><option value="5">5 星</option><option value="4">4 星</option><option value="3">3 星</option></select>
              </label>
              <label><span>主词条</span><input v-model="filters.mainStat" placeholder="CRIT Rate" /></label>
              <label><span>副词条</span><input v-model="filters.subStat" placeholder="CRIT DMG" /></label>
              <label><span>锁定</span>
                <select v-model="filters.locked"><option value="">全部</option><option value="true">已锁定</option><option value="false">未锁定</option></select>
              </label>
              <label><span>弃置</span>
                <select v-model="filters.discard"><option value="">全部</option><option value="true">已标记</option><option value="false">未标记</option></select>
              </label>
            </template>
            <template v-else-if="inventoryKind === 'lightCone'">
              <label><span>最低突破</span><input v-model="filters.minAscension" type="number" min="0" max="6" placeholder="0" /></label>
              <label><span>叠影</span><input v-model="filters.superimposition" type="number" min="1" max="5" placeholder="全部" /></label>
              <label><span>锁定</span>
                <select v-model="filters.locked"><option value="">全部</option><option value="true">已锁定</option><option value="false">未锁定</option></select>
              </label>
            </template>
            <template v-else>
              <label><span>命途</span><input v-model="filters.path" placeholder="Harmony" /></label>
              <label><span>最低突破</span><input v-model="filters.minAscension" type="number" min="0" max="6" placeholder="0" /></label>
              <label><span>星魂</span><input v-model="filters.eidolon" type="number" min="0" max="6" placeholder="全部" /></label>
            </template>
            <label><span>最低等级</span><input v-model="filters.minLevel" type="number" min="0" placeholder="0" /></label>
            <label><span>最高等级</span><input v-model="filters.maxLevel" type="number" min="0" placeholder="不限" /></label>
            <label v-if="inventoryKind !== 'character'"><span>装备状态</span>
              <select v-model="filters.equipped"><option value="">全部</option><option value="true">已装备</option><option value="false">未装备</option></select>
            </label>
            <div class="filter-actions">
              <button class="filter-submit" type="submit" :disabled="busy">执行筛选</button>
              <button class="filter-reset" type="button" @click="resetFilters">重置</button>
            </div>
          </form>

          <div class="table-shell">
            <table>
              <thead>
                <tr>
                  <th class="check-cell"><input type="checkbox" :checked="allSelected" @change="toggleAll" /></th>
                  <th>名称</th>
                  <template v-if="inventoryKind === 'relic'">
                    <th>部位</th><th>星级</th><th>等级</th><th>主词条</th><th>状态</th>
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
                    <input
                      type="checkbox"
                      :checked="selectedIds.has(idFor(item))"
                      @change="toggleSelected(idFor(item))"
                    />
                  </td>
                  <td>
                    <strong class="item-name">{{ itemTitle(item) }}</strong>
                    <small class="item-id">#{{ idFor(item) }}</small>
                  </td>
                  <template v-if="inventoryKind === 'relic'">
                    <td>{{ slotLabel((item as RelicListItem).slot) }}</td>
                    <td><span class="rarity">{{ "✦".repeat((item as RelicListItem).rarity) }}</span></td>
                    <td><b>+{{ (item as RelicListItem).level }}</b></td>
                    <td>{{ (item as RelicListItem).mainStat }}</td>
                    <td>
                      <span v-if="(item as RelicListItem).locked" class="data-tag">锁定</span>
                      <span v-if="(item as RelicListItem).discard" class="data-tag danger">弃置</span>
                      <span v-if="(item as RelicListItem).location" class="data-tag cyan">已装备</span>
                    </td>
                  </template>
                  <template v-else-if="inventoryKind === 'lightCone'">
                    <td><b>Lv.{{ (item as LightConeListItem).level }}</b></td>
                    <td>{{ (item as LightConeListItem).ascension }}</td>
                    <td>叠影 {{ (item as LightConeListItem).superimposition }}</td>
                    <td>{{ (item as LightConeListItem).location || "—" }}</td>
                    <td><span v-if="(item as LightConeListItem).locked" class="data-tag">锁定</span></td>
                  </template>
                  <template v-else>
                    <td>{{ (item as CharacterListItem).path }}</td>
                    <td><b>Lv.{{ (item as CharacterListItem).level }}</b></td>
                    <td>{{ (item as CharacterListItem).ascension }}</td>
                    <td>{{ (item as CharacterListItem).eidolon }}</td>
                    <td>V{{ (item as CharacterListItem).abilityVersion }}</td>
                  </template>
                  <td class="detail-cell">
                    <button class="row-action" type="button" @click="openDetail(item)">查看 →</button>
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
          </div>

          <footer class="table-footer">
            <span>共 {{ result.total }} 条 · 每页 {{ result.pageSize }} 条</span>
            <div class="pagination">
              <button type="button" :disabled="result.page <= 1 || busy" @click="goPage(result.page - 1)">←</button>
              <b>{{ result.page }} / {{ pageCount }}</b>
              <button type="button" :disabled="result.page >= pageCount || busy" @click="goPage(result.page + 1)">→</button>
            </div>
            <span>本地删除的数据会在下次完整同步时恢复</span>
          </footer>
        </article>
      </section>

      <footer class="app-footer">
        <span>StarRail-Auto-Tools · SQLite Inventory Core</span>
        <span>{{ capabilities?.note }}</span>
      </footer>
    </main>

    <div v-if="detail || detailLoading" class="detail-backdrop" @click.self="closeDetail">
      <aside class="detail-drawer">
        <header>
          <div><p class="eyebrow">RECORD DETAIL</p><h2>结构化详情</h2></div>
          <button type="button" aria-label="关闭详情" @click="closeDetail">×</button>
        </header>
        <div v-if="detailLoading" class="detail-loading">正在读取 SQLite 记录…</div>
        <pre v-else>{{ detailJson() }}</pre>
      </aside>
    </div>

    <div v-if="error" class="toast error-toast" role="alert" @click="error = ''">
      <span class="toast-symbol">!</span>
      <div><strong>任务未完成</strong><p>{{ error }}</p></div>
    </div>
    <div v-if="notice" class="toast notice-toast" role="status" @click="notice = ''">
      <span class="toast-symbol">✓</span>
      <div><strong>操作完成</strong><p>{{ notice }}</p></div>
    </div>
  </div>
</template>
