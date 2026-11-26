<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import Button from "primevue/button";
import ProgressBar from "primevue/progressbar";
import { relicCleanupApi } from "@/shared/api/relic-cleanup";
import LoadingState from "@/shared/ui/LoadingState.vue";
import { useRuntimeContext } from "@/shared/contracts/runtime";
import { relicImage } from "@/shared/catalogue";
import { formatStatValue, slotLabel, statLabel } from "@/shared/catalogue/relic-options";
import type {
  CleanupProgress,
  CleanupCapabilities,
  CleanupQueueItem,
  CleanupRunDetail,
  CleanupRunSummary,
  OcrModelStatus,
} from "@/types";

defineOptions({ name: "RelicCleanupPanel" });

const { error, notice } = useRuntimeContext();
const queue = ref<CleanupQueueItem[]>([]);
const runs = ref<CleanupRunSummary[]>([]);
const selectedRun = ref<CleanupRunDetail | null>(null);
const model = ref<OcrModelStatus | null>(null);
const progress = ref<CleanupProgress | null>(null);
const capabilities = ref<CleanupCapabilities | null>(null);
const cleanupBusy = ref(false);
const unlisten: Array<() => void> = [];
let disposed = false;
let refreshRequestId = 0;
let progressEventSequence = 0;

const modelPercent = computed(() => {
  if (!model.value?.totalBytes) return 0;
  return Math.min(100, Math.round((model.value.downloadedBytes / model.value.totalBytes) * 100));
});

const modelReady = computed(() => model.value?.state === "ready");

const statusLabels: Record<string, string> = {
  pendingPreview: "待预览",
  previewing: "预览中",
  uniqueMatch: "唯一匹配",
  notFound: "未找到",
  ambiguous: "匹配不唯一",
  recognitionUnavailable: "识别不可用",
  previewInvalidated: "预览失效",
  awaitingManualConfirmation: "等待手动确认",
  cleaned: "已清理",
  stillPresent: "仍然存在",
  verificationPending: "待验证",
  failed: "执行失败",
  previewFailed: "预览失败",
  previewCompleted: "预览完成",
  cancelled: "已取消",
};

const statusLabel = (value: string) => statusLabels[value] ?? value;

const fileUrl = (path: string | null) => {
  const directory = selectedRun.value?.directory;
  if (!path || !directory) return "";
  return relicCleanupApi.fileUrl(directory, path);
};

function getRelicImage(item: CleanupQueueItem) {
  if (item.fingerprint?.setId && item.fingerprint?.slot) {
    return relicImage(item.fingerprint.setId, item.fingerprint.slot);
  }
  return undefined;
}

function getSlotName(item: CleanupQueueItem) {
  if (item.fingerprint?.slot) {
    return slotLabel(item.fingerprint.slot);
  }
  return "";
}

function getMainStatText(item: CleanupQueueItem) {
  if (item.fingerprint?.mainStat) {
    const label = statLabel(item.fingerprint.mainStat);
    const value = formatStatValue(item.fingerprint.mainStat, item.fingerprint.mainStatValue ?? 0);
    return `${label} +${value}`;
  }
  return "";
}

async function refresh() {
  const requestId = ++refreshRequestId;
  const progressSequence = progressEventSequence;
  const [nextCapabilities, nextModel, nextQueue, nextRuns, nextProgress] = await Promise.all([
    relicCleanupApi.capabilities(),
    relicCleanupApi.modelStatus(),
    relicCleanupApi.listQueue(),
    relicCleanupApi.listRuns(),
    relicCleanupApi.taskStatus(),
  ]);
  if (disposed || requestId !== refreshRequestId) return;
  capabilities.value = nextCapabilities;
  model.value = nextModel;
  queue.value = nextQueue;
  runs.value = nextRuns;
  if (progressSequence === progressEventSequence) progress.value = nextProgress;
  if (selectedRun.value) {
    const nextSelectedRun = await relicCleanupApi.runDetail(selectedRun.value.runId);
    if (disposed || requestId !== refreshRequestId) return;
    selectedRun.value = nextSelectedRun;
  }
}

async function act(action: () => Promise<unknown>, success?: string) {
  cleanupBusy.value = true;
  error.value = "";
  try {
    await action();
    if (success) notice.value = success;
    await refresh();
  } catch (cause) {
    error.value = String(cause);
  } finally {
    cleanupBusy.value = false;
  }
}

const downloadModel = () => act(() => relicCleanupApi.downloadModel());
const verifyModel = () => act(() => relicCleanupApi.verifyModel(), "模型校验完成");
const cancelModel = () => act(() => relicCleanupApi.cancelModelDownload());
const deleteModel = () => {
  if (window.confirm("确定删除本机 PP-OCRv6 small 模型缓存？之后预览需重新下载。")) {
    void act(() => relicCleanupApi.deleteModel(), "模型缓存已删除");
  }
};
const removeCandidate = (itemId: number) =>
  act(() => relicCleanupApi.removeCandidates([itemId]), "已移出清理候选");

async function openRun(runId: number) {
  cleanupBusy.value = true;
  try {
    selectedRun.value = await relicCleanupApi.runDetail(runId);
  } catch (cause) {
    error.value = String(cause);
  } finally {
    cleanupBusy.value = false;
  }
}

function closeRunDetail() {
  selectedRun.value = null;
}

function startPreview() {
  if (!capabilities.value?.previewAvailable) {
    error.value = capabilities.value?.message ?? "清理预览当前不可用";
    return;
  }
  if (!modelReady.value) {
    error.value = "请先下载并校验 PP-OCRv6 small 模型";
    return;
  }
  if (!queue.value.length) {
    error.value = "请先在背包中勾选遗器并加入清理管理";
    return;
  }
  void act(async () => {
    const run = await relicCleanupApi.startPreview();
    selectedRun.value = await relicCleanupApi.runDetail(run.runId);
  }, "预览任务已启动");
}

function startExecution() {
  const run = selectedRun.value;
  if (!run || !run.currentlyValid || !capabilities.value?.executionAvailable) return;
  if (
    !window.confirm(
      `将按 ${run.runCode} 重新识别并选择最多 20 件遗器。软件不会点击游戏最终确认按钮，是否继续？`,
    )
  )
    return;
  void act(() => relicCleanupApi.startExecution(run.runId));
}

function deleteRun(runId: number) {
  if (!window.confirm(`确定删除 run-${String(runId).padStart(6, "0")} 的数据库记录和截图目录？`))
    return;
  void act(async () => {
    await relicCleanupApi.deleteRun(runId);
    if (selectedRun.value?.runId === runId) selectedRun.value = null;
  }, "预览历史已删除");
}

async function attachTaskListeners() {
  const retain = async (subscription: Promise<() => void>) => {
    const dispose = await subscription;
    if (disposed) dispose();
    else unlisten.push(dispose);
  };
  try {
    await Promise.all([
      retain(
        relicCleanupApi.onModelProgress((value) => {
          if (!disposed) model.value = value;
        }),
      ),
      retain(
        relicCleanupApi.onProgress(async (value) => {
          if (disposed) return;
          progressEventSequence += 1;
          progress.value = value;
          if (value.terminal) await refresh();
        }),
      ),
    ]);
  } catch (cause) {
    if (!disposed) error.value = String(cause);
  }
}

onMounted(() => {
  void attachTaskListeners().then(() => {
    if (disposed) return;
    void refresh().catch((cause) => {
      if (!disposed) error.value = String(cause);
    });
  });
});
onBeforeUnmount(() => {
  disposed = true;
  refreshRequestId += 1;
  unlisten.splice(0).forEach((dispose) => dispose());
});
</script>

<template>
  <div class="cleanup-workspace">
    <!-- 第一行：顶部控制台与模型状态 (严丝合缝的双栏网格) -->
    <div class="cleanup-overview-grid">
      <!-- 遗器清理控制台 -->
      <section class="panel cleanup-hero-card">
        <div class="hero-main-layout">
          <div class="hero-info">
            <div class="hero-badge-row">
              <span class="hero-kicker">SAFE RELIC SALVAGE</span>
              <span class="hero-shield-tag"> <span class="shield-dot" />人工确认保护 </span>
            </div>
            <h2 class="hero-title">遗器清理管理</h2>
            <p class="hero-subtitle">
              软件只负责识别与匹配勾选，最终分解确认始终由您在游戏内点击完成。
            </p>
          </div>

          <!-- 操作按钮组 -->
          <div class="hero-actions">
            <Button
              type="button"
              outlined
              class="hero-stop-btn"
              :disabled="cleanupBusy"
              @click="act(() => relicCleanupApi.cancel())"
            >
              停止
            </Button>
            <Button
              type="button"
              class="hero-start-btn"
              :disabled="cleanupBusy || !modelReady || !capabilities?.previewAvailable"
              :title="capabilities?.message"
              @click="startPreview"
              >运行预览</Button
            >
          </div>
        </div>

        <!-- 四步流程管线 -->
        <div class="hero-pipeline-row">
          <div class="pipeline-step" :class="{ current: !queue.length }">
            <span class="step-badge">01</span>
            <span class="step-name">冻结候选</span>
          </div>
          <span class="pipeline-connector">⟶</span>
          <div class="pipeline-step" :class="{ current: queue.length > 0 && !selectedRun }">
            <span class="step-badge">02</span>
            <span class="step-name">扫描预览</span>
          </div>
          <span class="pipeline-connector">⟶</span>
          <div class="pipeline-step" :class="{ current: !!selectedRun }">
            <span class="step-badge">03</span>
            <span class="step-name">核对截图</span>
          </div>
          <span class="pipeline-connector">⟶</span>
          <div class="pipeline-step">
            <span class="step-badge">04</span>
            <span class="step-name">绑定执行</span>
          </div>
        </div>

        <!-- 任务实时进度条 (如有运行中任务) -->
        <div v-if="progress" class="hero-progress-banner">
          <div class="progress-info">
            <strong class="progress-code">{{ progress.runCode }}</strong>
            <span class="progress-phase">{{ statusLabel(progress.phase) }}</span>
            <span class="progress-desc">{{ progress.message }}</span>
          </div>
          <ProgressBar
            v-if="progress.total"
            class="progress-bar-el"
            :value="Math.round((progress.current / progress.total) * 100)"
          />
        </div>
      </section>

      <!-- OCR 引擎状态卡片 -->
      <section class="panel cleanup-model-card">
        <div class="model-header">
          <div class="model-title-group">
            <span
              class="model-state-indicator"
              :class="{ ready: modelReady, downloading: model?.state === 'downloading' }"
            />
            <div>
              <p class="model-eyebrow">LOCAL OCR ENGINE</p>
              <h3 class="model-name">PP-OCRv6 small</h3>
            </div>
          </div>
          <span class="model-pill" :class="{ ready: modelReady }">
            {{ modelReady ? "READY" : "REQUIRED" }}
          </span>
        </div>

        <div class="model-body">
          <LoadingState v-if="!model" variant="inline" label="正在读取模型状态…" compact />
          <p v-else class="model-status-text">{{ model.message }}</p>

          <div v-if="model?.state === 'downloading'" class="model-download-bar">
            <div class="download-meta">
              <span>下载中…</span>
              <span>{{ modelPercent }}%</span>
            </div>
            <ProgressBar :value="modelPercent" class="download-progress" />
          </div>
        </div>

        <div class="model-footer">
          <div class="model-btn-group">
            <Button
              v-if="!modelReady && model?.state !== 'downloading'"
              size="small"
              class="model-primary-btn"
              @click="downloadModel"
            >
              下载模型
            </Button>
            <Button
              v-if="model?.state === 'downloading'"
              size="small"
              outlined
              @click="cancelModel"
            >
              取消
            </Button>
            <Button
              size="small"
              outlined
              :disabled="cleanupBusy || ['downloading', 'cancelling'].includes(model?.state ?? '')"
              @click="verifyModel"
            >
              校验
            </Button>
            <Button
              size="small"
              text
              severity="danger"
              :disabled="cleanupBusy"
              @click="deleteModel"
            >
              删除
            </Button>
          </div>

          <div v-if="model?.revision" class="model-hash-chip" :title="model.revision">
            <span class="hash-tag">REV</span>
            <code class="hash-text">{{
              model.revision.length > 28 ? `${model.revision.slice(0, 28)}…` : model.revision
            }}</code>
          </div>
        </div>
      </section>
    </div>

    <!-- 第二行：主体工作网格 (清理候选队列 vs 预览记录与核对终端) -->
    <div class="cleanup-main-grid">
      <!-- 左列：清理候选池卡片 -->
      <section class="panel cleanup-column-card">
        <header class="column-card-header">
          <div class="header-title-box">
            <span class="header-icon">◇</span>
            <h3>清理候选</h3>
            <span class="header-count-badge">{{ queue.length }} 件</span>
          </div>
          <span class="header-guide-hint">在“背包 → 遗器”勾选并加入</span>
        </header>

        <div class="column-card-content">
          <!-- 候选为空 -->
          <div v-if="!queue.length" class="cleanup-empty-box">
            <div class="empty-icon-ring">
              <span class="empty-glyph">＋</span>
            </div>
            <strong class="empty-title">还没有清理候选</strong>
            <p class="empty-desc">
              前往“背包 → 遗器”页面，筛选并勾选需要清理的遗器，点击“加入清理管理”即可在此统一处理。
            </p>
          </div>

          <!-- 候选列表 -->
          <div v-else class="candidate-list-wrap">
            <div v-for="item in queue" :key="item.itemId" class="candidate-item-card">
              <div class="item-avatar-col">
                <img
                  v-if="getRelicImage(item)"
                  :src="getRelicImage(item)"
                  :alt="item.displayName"
                  class="relic-thumb"
                  loading="lazy"
                />
                <div v-else class="relic-thumb-fallback">◇</div>
                <span v-if="item.fingerprint?.level !== undefined" class="level-chip">
                  +{{ item.fingerprint.level }}
                </span>
              </div>

              <div class="item-info-col">
                <div class="item-name-line">
                  <strong class="relic-name">{{ item.displayName }}</strong>
                  <span v-if="getSlotName(item)" class="slot-badge">{{ getSlotName(item) }}</span>
                </div>
                <div class="item-sub-line">
                  <span v-if="getMainStatText(item)" class="main-stat">{{
                    getMainStatText(item)
                  }}</span>
                  <span class="item-id-code">#{{ item.itemId }}</span>
                  <span class="item-status-pill">{{ statusLabel(item.status) }}</span>
                </div>
              </div>

              <div class="item-action-col">
                <button
                  type="button"
                  class="remove-btn"
                  title="移出清理候选"
                  @click="removeCandidate(item.itemId)"
                >
                  移出
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 右列：预览记录与核对终端 -->
      <section class="panel cleanup-column-card">
        <!-- 核对终端头部 (若选中 Run) -->
        <header v-if="selectedRun" class="column-card-header run-active-header">
          <div class="header-title-box">
            <button type="button" class="back-link-btn" @click="closeRunDetail">← 返回列表</button>
            <span class="header-separator">/</span>
            <h3>{{ selectedRun.runCode }}</h3>
            <span class="status-chip" :class="selectedRun.status">
              {{ statusLabel(selectedRun.status) }}
            </span>
          </div>

          <div class="run-header-actions">
            <Button
              size="small"
              outlined
              class="open-folder-btn"
              @click="act(() => relicCleanupApi.openRunDirectory(selectedRun!.runId))"
            >
              打开文件夹
            </Button>
            <Button
              size="small"
              class="exec-btn"
              :disabled="
                !capabilities?.executionAvailable ||
                !selectedRun.currentlyValid ||
                selectedRun.status !== 'previewCompleted'
              "
              :title="capabilities?.message"
              @click="startExecution"
            >
              {{ capabilities?.executionAvailable ? "绑定此预览执行" : "执行尚未开放" }}
            </Button>
          </div>
        </header>

        <!-- 历史记录头部 (未选中 Run) -->
        <header v-else class="column-card-header">
          <div class="header-title-box">
            <span class="header-icon">◇</span>
            <h3>预览记录</h3>
            <span class="header-count-badge">{{ runs.length }} 次</span>
          </div>
          <span class="header-guide-hint">点击批次进入识别截图核对</span>
        </header>

        <!-- 内容区域 -->
        <div class="column-card-content">
          <!-- 模式 1：选中 Run 时的截图核对视图 -->
          <div v-if="selectedRun" class="run-detail-container">
            <div v-if="!selectedRun.currentlyValid" class="invalid-alert-bar">
              <span class="alert-icon">⚠</span>
              当前 UID 或遗器库存与预览时不同，此预览已失效，不能执行。
            </div>

            <div class="run-summary-bar">
              <span class="summary-metric">
                匹配率:
                <strong>{{ selectedRun.matchedCount }} / {{ selectedRun.itemCount }}</strong>
              </span>
              <span v-if="selectedRun.message" class="summary-msg">{{ selectedRun.message }}</span>
            </div>

            <div class="run-items-grid">
              <article v-for="item in selectedRun.items" :key="item.itemId" class="run-item-card">
                <div class="run-item-img-box">
                  <img
                    v-if="item.imagePath"
                    :src="fileUrl(item.imagePath)"
                    alt="识别截图"
                    class="run-shot-img"
                    loading="lazy"
                  />
                  <div v-else class="shot-placeholder">无截图数据</div>
                  <span class="run-item-badge" :class="item.previewStatus">
                    {{ statusLabel(item.previewStatus) }}
                  </span>
                </div>

                <div class="run-item-meta">
                  <div class="meta-row-main">
                    <strong class="meta-name">
                      {{ item.expectedFingerprint.setName }} · {{ item.expectedFingerprint.slot }}
                    </strong>
                    <span class="meta-lvl">+{{ item.expectedFingerprint.level }}</span>
                  </div>
                  <div class="meta-row-sub">
                    <small class="meta-id">#{{ item.itemId }}</small>
                    <span v-if="item.confidence !== null" class="meta-conf">
                      置信度: {{ Math.round((item.confidence ?? 0) * 100) }}%
                    </span>
                  </div>
                  <p v-if="item.reason" class="meta-reason">{{ item.reason }}</p>
                </div>
              </article>
            </div>
          </div>

          <!-- 模式 2：未选中 Run 时的历史批次列表 -->
          <div v-else class="runs-history-container">
            <LoadingState
              v-if="!capabilities"
              variant="list"
              label="正在读取历史预览记录…"
              :rows="3"
              compact
            />
            <div v-else-if="!runs.length" class="cleanup-empty-box">
              <div class="empty-icon-ring">
                <span class="empty-glyph">◇</span>
              </div>
              <strong class="empty-title">还没有预览记录</strong>
              <p class="empty-desc">
                加入清理候选并确认 OCR 模型就绪后，点击上方“运行预览”生成首个预览批次。
              </p>
            </div>

            <div v-else class="runs-history-list">
              <div
                v-for="run in runs"
                :key="run.runId"
                class="run-row-card"
                @click="openRun(run.runId)"
              >
                <div class="run-row-info">
                  <div class="run-row-title-line">
                    <strong class="run-code">{{ run.runCode }}</strong>
                    <span class="run-status-tag" :class="run.status">
                      {{ statusLabel(run.status) }}
                    </span>
                  </div>
                  <div class="run-row-meta-line">
                    <span class="match-ratio">
                      已匹配 <b>{{ run.matchedCount }}</b> / {{ run.itemCount }}
                    </span>
                    <span class="run-separator">·</span>
                    <span class="run-uid">UID {{ run.uid }}</span>
                  </div>
                </div>

                <div class="run-row-action" @click.stop>
                  <button
                    type="button"
                    class="run-delete-btn"
                    title="删除此记录"
                    @click="deleteRun(run.runId)"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 第三行：底部全宽安全状态栏 -->
    <footer class="panel cleanup-safety-footer">
      <div class="safety-left">
        <span class="safety-icon">✦</span>
        <span class="safety-hotkey">Ctrl + Shift + F12</span>
        <span class="safety-text"
          >可在软件窗口聚焦时紧急停止任务；视觉模板与状态机完成验收前不会发送游戏输入。</span
        >
      </div>
      <div class="safety-right">
        <LoadingState v-if="!capabilities" variant="inline" label="正在读取清理能力状态…" compact />
        <span v-else class="platform-tip">{{ capabilities.message }}</span>
      </div>
    </footer>
  </div>
</template>

<style scoped src="./relic-cleanup-panel.css"></style>
