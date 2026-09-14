<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import Button from "primevue/button";
import ProgressBar from "primevue/progressbar";
import { relicCleanupApi } from "@/shared/api/relic-cleanup";
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
const unlisten = ref<Array<() => void>>([]);
let disposed = false;

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
  const [nextCapabilities, nextModel, nextQueue, nextRuns] = await Promise.all([
    relicCleanupApi.capabilities(),
    relicCleanupApi.modelStatus(),
    relicCleanupApi.listQueue(),
    relicCleanupApi.listRuns(),
  ]);
  if (disposed) return;
  capabilities.value = nextCapabilities;
  model.value = nextModel;
  queue.value = nextQueue;
  runs.value = nextRuns;
  if (selectedRun.value) {
    selectedRun.value = await relicCleanupApi.runDetail(selectedRun.value.runId);
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

function emergencyStop(event: KeyboardEvent) {
  if (event.key !== "F12" || !event.ctrlKey || !event.shiftKey) return;
  event.preventDefault();
  void act(() => relicCleanupApi.cancel(), "已触发紧急停止");
}

onMounted(async () => {
  window.addEventListener("keydown", emergencyStop);
  try {
    await refresh();
    const retain = async (subscription: Promise<() => void>) => {
      const dispose = await subscription;
      if (disposed) dispose();
      else unlisten.value.push(dispose);
    };
    await Promise.all([
      retain(relicCleanupApi.onModelProgress((value) => (model.value = value))),
      retain(
        relicCleanupApi.onProgress(async (value) => {
          progress.value = value;
          if (value.terminal) await refresh();
        }),
      ),
    ]);
  } catch (cause) {
    error.value = String(cause);
  }
});

onBeforeUnmount(() => {
  disposed = true;
  window.removeEventListener("keydown", emergencyStop);
  unlisten.value.forEach((dispose) => dispose());
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
          <p class="model-status-text">{{ model?.message ?? "正在读取模型状态…" }}</p>

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
            <div v-if="!runs.length" class="cleanup-empty-box">
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
        <span class="platform-tip">{{ capabilities?.message ?? "正在读取清理能力状态…" }}</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.cleanup-workspace {
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 12px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 0 1px 2px;
}

/* 统一双栏栅格系统：从上到下严格一致 */
.cleanup-overview-grid,
.cleanup-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(390px, 1fr);
  gap: 12px;
}

.cleanup-main-grid {
  flex: 1;
  min-height: 0;
}

/* ===== 顶部 Hero 控制卡片 ===== */
.cleanup-hero-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 20px 14px;
  border-color: rgba(46, 79, 126, 0.16);
  background:
    radial-gradient(ellipse at 95% 15%, rgba(199, 165, 90, 0.12) 0%, transparent 55%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.96) 0%, rgba(243, 247, 252, 0.92) 100%);
}

.hero-main-layout {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.hero-info {
  display: grid;
  gap: 4px;
}

.hero-badge-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hero-kicker {
  color: var(--muted);
  font:
    700 8px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.18em;
}

.hero-shield-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border: 1px solid rgba(199, 165, 90, 0.35);
  border-radius: 3px;
  color: #846726;
  background: rgba(199, 165, 90, 0.12);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.shield-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #c7a55a;
}

.hero-title {
  margin: 2px 0 0;
  color: var(--ink);
  font-size: 21px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.hero-subtitle {
  color: var(--ink-soft);
  font-size: 11px;
  line-height: 1.45;
  margin: 0;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 全局覆盖当前面板内所有实心 Primary 按钮，保证无论任何状态均为白字 */
:deep(.p-button:not(.p-button-outlined):not(.p-button-text)) {
  border: 1px solid var(--blue);
  background: var(--blue);
  color: #ffffff !important;
  font-weight: 600;
  transition: all 150ms ease;
}

:deep(.p-button:not(.p-button-outlined):not(.p-button-text):hover:not(:disabled)) {
  border-color: var(--blue-deep);
  background: var(--blue-deep);
  color: #ffffff !important;
}

:deep(.p-button:not(.p-button-outlined):not(.p-button-text):disabled) {
  border-color: #a8c1e4;
  background: #a8c1e4;
  color: rgba(255, 255, 255, 0.9) !important;
  opacity: 0.7;
}

/* 覆盖当前面板内 Outlined 按钮 */
:deep(.p-button.p-button-outlined) {
  border: 1px solid rgba(46, 79, 126, 0.28);
  background: #ffffff;
  color: var(--ink-soft);
  font-weight: 500;
  transition: all 150ms ease;
}

:deep(.p-button.p-button-outlined:hover:not(:disabled)) {
  border-color: var(--blue);
  background: var(--blue-soft);
  color: var(--blue);
}

:deep(.p-button.p-button-outlined:disabled) {
  border-color: rgba(46, 79, 126, 0.14);
  color: var(--muted);
  opacity: 0.5;
}

/* 覆盖当前面板内 Text 按钮 */
:deep(.p-button.p-button-text.p-button-danger) {
  color: #b24638;
}

:deep(.p-button.p-button-text.p-button-danger:hover:not(:disabled)) {
  background: rgba(178, 70, 56, 0.08);
  color: #923427;
}

.hero-stop-btn {
  min-width: 72px;
  height: 34px;
  font-size: 12px;
}

.hero-start-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 104px;
  height: 34px;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 4px 14px rgba(36, 86, 166, 0.18);
}

.hero-start-btn::before {
  content: "✦";
  margin-right: 5px;
  color: var(--gold-light);
  font-size: 11px;
}

/* 四步流程管线 */
.hero-pipeline-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border: 1px solid rgba(46, 79, 126, 0.08);
  border-radius: 5px;
  background: rgba(235, 241, 249, 0.55);
}

.pipeline-step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 4px;
  color: var(--ink-soft);
  font-size: 11px;
  transition: all 150ms ease;
}

.pipeline-step.current {
  color: var(--blue-deep);
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 6px rgba(36, 86, 166, 0.1);
  font-weight: 600;
}

.step-badge {
  font:
    700 9px/1 "Bahnschrift",
    sans-serif;
  color: var(--muted);
  letter-spacing: 0.06em;
}

.pipeline-step.current .step-badge {
  color: var(--blue);
}

.pipeline-connector {
  color: rgba(135, 148, 168, 0.6);
  font-size: 11px;
}

.hero-progress-banner {
  display: grid;
  grid-template-columns: 1fr 140px;
  align-items: center;
  gap: 12px;
  padding: 7px 10px;
  border: 1px solid rgba(36, 86, 166, 0.18);
  border-radius: 4px;
  background: #f0f5fd;
  font-size: 11px;
}

.progress-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-code {
  color: var(--blue);
  font-family: "Bahnschrift", monospace;
}

.progress-phase {
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(36, 86, 166, 0.1);
  color: var(--blue-deep);
  font-size: 10px;
}

.progress-desc {
  color: var(--ink-soft);
  font-size: 10px;
}

/* ===== OCR 模型状态卡片 ===== */
.cleanup-model-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  padding: 16px 18px 14px;
}

.model-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.model-title-group {
  display: flex;
  align-items: center;
  gap: 9px;
}

.model-eyebrow {
  margin: 0;
  color: var(--muted);
  font:
    700 8px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.16em;
}

.model-name {
  margin: 2px 0 0;
  color: var(--ink);
  font-size: 16px;
  font-weight: 700;
}

.model-state-indicator {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #b9c2cf;
  box-shadow: 0 0 0 3px rgba(155, 168, 185, 0.18);
  transition: all 200ms ease;
}

.model-state-indicator.ready {
  background: var(--cyan);
  box-shadow: 0 0 0 4px rgba(69, 174, 183, 0.22);
}

.model-state-indicator.downloading {
  background: var(--blue);
  box-shadow: 0 0 0 4px rgba(36, 86, 166, 0.22);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(0.9);
  }
}

.model-pill {
  padding: 3px 8px;
  border: 1px solid rgba(135, 148, 168, 0.25);
  border-radius: 3px;
  color: var(--muted);
  font:
    700 8px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.14em;
  background: rgba(235, 240, 248, 0.5);
}

.model-pill.ready {
  border-color: rgba(69, 174, 183, 0.35);
  color: #1f7780;
  background: rgba(69, 174, 183, 0.12);
}

.model-body {
  display: grid;
  gap: 6px;
}

.model-status-text {
  margin: 0;
  color: var(--ink-soft);
  font-size: 11px;
  min-height: 16px;
  line-height: 1.4;
}

.model-download-bar {
  display: grid;
  gap: 4px;
}

.download-meta {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--muted);
}

.download-progress {
  height: 6px;
}

.model-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.model-btn-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.model-primary-btn {
  font-weight: 600;
}

.model-hash-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 7px;
  border: 1px solid rgba(46, 79, 126, 0.12);
  border-radius: 3px;
  background: rgba(240, 244, 250, 0.7);
}

.hash-tag {
  color: var(--muted);
  font:
    700 7px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.1em;
}

.hash-text {
  color: var(--ink-soft);
  font-size: 9px;
  font-family: "Bahnschrift", monospace;
}

/* ===== 下部主要列卡片 ===== */
.cleanup-column-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 14px 16px;
}

.column-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 11px;
  border-bottom: 1px solid rgba(48, 75, 117, 0.1);
  flex-shrink: 0;
}

.header-title-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  color: var(--gold);
  font-size: 14px;
}

.column-card-header h3 {
  margin: 0;
  color: var(--ink);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.header-count-badge {
  padding: 2px 7px;
  border-radius: 10px;
  background: rgba(36, 86, 166, 0.08);
  color: var(--blue-deep);
  font:
    700 10px/1 "Bahnschrift",
    sans-serif;
}

.header-guide-hint {
  color: var(--muted);
  font-size: 10px;
}

.column-card-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  margin-top: 10px;
}

/* 空状态统一设计 */
.cleanup-empty-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
  text-align: center;
  color: var(--muted);
  border: 1px dashed rgba(48, 75, 117, 0.14);
  border-radius: 6px;
  background: rgba(246, 249, 253, 0.4);
}

.empty-icon-ring {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-bottom: 10px;
  border: 1px solid rgba(42, 83, 143, 0.18);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 10px rgba(42, 72, 113, 0.05);
}

.empty-glyph {
  color: var(--gold);
  font-size: 16px;
}

.empty-title {
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.empty-desc {
  margin: 0;
  max-width: 320px;
  font-size: 11px;
  line-height: 1.55;
  color: var(--ink-soft);
}

/* 候选遗器列表 */
.candidate-list-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding-right: 4px;
}

.candidate-item-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border: 1px solid rgba(48, 75, 117, 0.12);
  border-radius: 6px;
  background: #ffffff;
  transition: all 120ms ease;
}

.candidate-item-card:hover {
  border-color: rgba(36, 86, 166, 0.28);
  box-shadow: 0 3px 10px rgba(36, 86, 166, 0.06);
}

.item-avatar-col {
  position: relative;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 5px;
  border: 1px solid rgba(48, 75, 117, 0.15);
  background: #f1f4f8;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.relic-thumb {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.relic-thumb-fallback {
  color: var(--muted);
  font-size: 16px;
}

.level-chip {
  position: absolute;
  bottom: 0;
  right: 0;
  padding: 1px 3px;
  border-top-left-radius: 3px;
  background: rgba(23, 38, 67, 0.85);
  color: #fff;
  font:
    700 8px/1 "Bahnschrift",
    sans-serif;
}

.item-info-col {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 3px;
}

.item-name-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.relic-name {
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slot-badge {
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(199, 165, 90, 0.15);
  color: #795d1f;
  font-size: 9px;
  font-weight: 600;
}

.item-sub-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
}

.main-stat {
  color: var(--blue-deep);
  font-weight: 500;
}

.item-id-code {
  color: var(--muted);
  font-family: "Bahnschrift", monospace;
}

.item-status-pill {
  color: var(--muted);
}

.item-action-col {
  flex-shrink: 0;
}

.remove-btn {
  padding: 4px 10px;
  border: 1px solid rgba(178, 70, 56, 0.22);
  border-radius: 4px;
  color: #a24b3e;
  background: rgba(254, 242, 240, 0.8);
  font-size: 10px;
  font-weight: 500;
  transition: all 120ms ease;
}

.remove-btn:hover {
  border-color: rgba(178, 70, 56, 0.45);
  background: #fde8e5;
  color: #8c362a;
}

/* ===== 预览核对终端与历史记录 ===== */
.run-active-header {
  padding-bottom: 9px;
}

.back-link-btn {
  background: transparent;
  color: var(--blue);
  font-size: 11px;
  font-weight: 600;
  padding: 3px 6px;
  border-radius: 3px;
}

.back-link-btn:hover {
  background: var(--blue-soft);
}

.header-separator {
  color: var(--muted);
  font-size: 11px;
}

.status-chip {
  padding: 2px 7px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  background: #eef3f9;
  color: var(--ink-soft);
}

.status-chip.previewCompleted {
  background: rgba(69, 174, 183, 0.15);
  color: #1e747d;
}

.run-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.open-folder-btn {
  font-size: 11px;
}

.exec-btn {
  font-size: 11px;
  font-weight: 600;
}

.run-detail-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.invalid-alert-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-left: 3px solid #b65b4b;
  border-radius: 3px;
  background: #fff3f0;
  color: #8f4437;
  font-size: 11px;
}

.run-summary-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 4px;
  background: rgba(240, 245, 252, 0.7);
  font-size: 11px;
  color: var(--ink-soft);
}

.summary-metric strong {
  color: var(--blue-deep);
}

.run-items-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  padding-right: 4px;
}

.run-item-card {
  border: 1px solid rgba(48, 75, 117, 0.12);
  border-radius: 6px;
  background: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.run-item-img-box {
  position: relative;
  width: 100%;
  height: 105px;
  background: #eef1f5;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.run-shot-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.shot-placeholder {
  color: var(--muted);
  font-size: 10px;
}

.run-item-badge {
  position: absolute;
  top: 5px;
  right: 5px;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 600;
  background: rgba(23, 38, 67, 0.78);
  color: #fff;
}

.run-item-badge.uniqueMatch {
  background: rgba(36, 130, 80, 0.85);
}

.run-item-meta {
  display: grid;
  gap: 3px;
  padding: 8px 10px;
}

.meta-row-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.meta-name {
  font-size: 11px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-lvl {
  font:
    700 9px/1 "Bahnschrift",
    sans-serif;
  color: var(--gold);
}

.meta-row-sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 9px;
  color: var(--muted);
}

.meta-id {
  font-family: "Bahnschrift", monospace;
}

.meta-conf {
  color: var(--blue);
}

.meta-reason {
  margin: 2px 0 0;
  font-size: 9px;
  color: #a85244;
  line-height: 1.35;
}

/* 批次历史列表 */
.runs-history-container {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.runs-history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding-right: 4px;
}

.run-row-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid rgba(48, 75, 117, 0.12);
  border-radius: 6px;
  background: #ffffff;
  cursor: pointer;
  transition: all 120ms ease;
}

.run-row-card:hover {
  border-color: var(--blue);
  background: #f7faff;
  box-shadow: 0 3px 10px rgba(36, 86, 166, 0.08);
}

.run-row-info {
  display: grid;
  gap: 4px;
  flex: 1;
}

.run-row-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.run-code {
  color: var(--ink);
  font:
    700 13px/1 "Bahnschrift",
    monospace;
}

.run-status-tag {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 600;
  background: #eef2f8;
  color: var(--ink-soft);
}

.run-status-tag.previewCompleted {
  background: rgba(69, 174, 183, 0.15);
  color: #1e747d;
}

.run-row-meta-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--muted);
}

.match-ratio b {
  color: var(--blue-deep);
}

.run-delete-btn {
  padding: 4px 8px;
  background: transparent;
  color: var(--muted);
  font-size: 10px;
  border-radius: 3px;
  transition: all 120ms ease;
}

.run-delete-btn:hover {
  background: rgba(178, 70, 56, 0.1);
  color: #b24638;
}

/* ===== 底部全宽安全状态栏 ===== */
.cleanup-safety-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 16px;
  border-color: rgba(48, 75, 117, 0.12);
  background: rgba(255, 255, 255, 0.85);
  font-size: 10px;
  line-height: 1.4;
}

.cleanup-safety-footer::before {
  display: none;
}

.safety-left {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ink-soft);
}

.safety-icon {
  color: var(--gold);
  font-size: 11px;
}

.safety-hotkey {
  padding: 1px 6px;
  border: 1px solid rgba(48, 75, 117, 0.18);
  border-radius: 3px;
  background: rgba(240, 244, 250, 0.8);
  color: var(--blue-deep);
  font:
    700 9px/1.2 "Bahnschrift",
    monospace;
}

.safety-text {
  color: var(--ink-soft);
}

.safety-right {
  color: var(--muted);
  font-size: 10px;
  white-space: nowrap;
}

@media (max-width: 1024px) {
  .cleanup-overview-grid,
  .cleanup-main-grid {
    grid-template-columns: 1fr;
  }
}
</style>
