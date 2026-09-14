<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import Button from "primevue/button";
import ProgressBar from "primevue/progressbar";
import { relicCleanupApi } from "@/shared/api/relic-cleanup";
import { useRuntimeContext } from "@/shared/contracts/runtime";
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
  <section class="cleanup-workspace">
    <div class="cleanup-overview">
      <header class="panel cleanup-hero">
        <div class="cleanup-hero-copy">
          <div class="cleanup-kicker"><span>SAFE RELIC SALVAGE</span><i>人工确认保护</i></div>
          <h2>遗器清理管理</h2>
          <p>冻结候选 → 扫描预览 → 核对截图 → 绑定编号执行</p>
          <small>软件只负责选择，最终分解确认始终由你在游戏内点击。</small>
        </div>
        <div class="cleanup-actions cleanup-primary-actions">
          <Button
            type="button"
            outlined
            :disabled="cleanupBusy"
            @click="act(() => relicCleanupApi.cancel())"
            >停止</Button
          >
          <Button
            type="button"
            :disabled="cleanupBusy || !modelReady || !capabilities?.previewAvailable"
            :title="capabilities?.message"
            @click="startPreview"
            >运行预览</Button
          >
        </div>
      </header>

      <article class="panel cleanup-model-card">
        <div class="model-heading">
          <span :class="['model-state-dot', { ready: modelReady }]" />
          <div>
            <p class="eyebrow">LOCAL OCR MODEL</p>
            <h3>PP-OCRv6 small</h3>
          </div>
          <b>{{ modelReady ? "READY" : "REQUIRED" }}</b>
        </div>
        <p class="model-message">{{ model?.message ?? "正在读取模型状态…" }}</p>
        <ProgressBar v-if="model?.state === 'downloading'" :value="modelPercent" />
        <div class="model-controls">
          <Button v-if="!modelReady && model?.state !== 'downloading'" @click="downloadModel"
            >下载模型</Button
          >
          <Button v-if="model?.state === 'downloading'" outlined @click="cancelModel">取消</Button>
          <Button
            outlined
            :disabled="cleanupBusy || ['downloading', 'cancelling'].includes(model?.state ?? '')"
            @click="verifyModel"
            >校验</Button
          >
          <Button text severity="danger" :disabled="cleanupBusy" @click="deleteModel">删除</Button>
        </div>
        <code v-if="model" :title="model.revision">{{ model.revision }}</code>
      </article>
    </div>

    <div v-if="progress" class="cleanup-progress">
      <strong>{{ progress.runCode }} · {{ statusLabel(progress.phase) }}</strong>
      <span>{{ progress.message }}</span>
      <ProgressBar
        v-if="progress.total"
        :value="Math.round((progress.current / progress.total) * 100)"
      />
    </div>

    <div class="cleanup-columns">
      <article class="panel cleanup-list-card">
        <header>
          <h3>清理候选</h3>
          <span>{{ queue.length }} 件</span>
        </header>
        <div v-if="!queue.length" class="cleanup-empty">
          <span aria-hidden="true">＋</span>
          <strong>还没有清理候选</strong>
          <p>前往“背包 → 遗器”筛选并勾选，再加入清理管理。</p>
        </div>
        <ul v-else>
          <li v-for="item in queue" :key="item.itemId">
            <div>
              <strong>{{ item.displayName }}</strong>
              <small>#{{ item.itemId }} · {{ statusLabel(item.status) }}</small>
            </div>
            <button type="button" @click="removeCandidate(item.itemId)">移出</button>
          </li>
        </ul>
      </article>

      <article class="panel cleanup-list-card">
        <header>
          <h3>预览记录</h3>
          <span>{{ runs.length }} 次</span>
        </header>
        <div v-if="!runs.length" class="cleanup-empty">
          <span aria-hidden="true">◇</span>
          <strong>还没有预览记录</strong>
          <p>加入候选并完成模型准备后，即可生成首个预览编号。</p>
        </div>
        <ul v-else>
          <li
            v-for="run in runs"
            :key="run.runId"
            :class="{ active: selectedRun?.runId === run.runId }"
          >
            <button type="button" class="run-main" @click="openRun(run.runId)">
              <strong>{{ run.runCode }}</strong>
              <small
                >{{ statusLabel(run.status) }} · {{ run.matchedCount }}/{{
                  run.itemCount
                }}
                匹配</small
              >
            </button>
            <button type="button" @click="deleteRun(run.runId)">删除</button>
          </li>
        </ul>
      </article>
    </div>

    <article v-if="selectedRun" class="panel cleanup-run-detail">
      <header>
        <div>
          <p class="eyebrow">{{ selectedRun.runCode }}</p>
          <h3>{{ statusLabel(selectedRun.status) }}</h3>
          <p>{{ selectedRun.message }}</p>
        </div>
        <div class="cleanup-actions">
          <Button outlined @click="act(() => relicCleanupApi.openRunDirectory(selectedRun!.runId))"
            >打开文件夹</Button
          >
          <Button
            :disabled="
              !capabilities?.executionAvailable ||
              !selectedRun.currentlyValid ||
              selectedRun.status !== 'previewCompleted'
            "
            :title="capabilities?.message"
            @click="startExecution"
            >{{ capabilities?.executionAvailable ? "绑定此预览执行" : "执行尚未开放" }}</Button
          >
        </div>
      </header>
      <div v-if="!selectedRun.currentlyValid" class="invalid-banner">
        当前 UID 或遗器库存与预览时不同，此预览已失效，不能执行。
      </div>
      <div class="run-grid">
        <article v-for="item in selectedRun.items" :key="item.itemId" class="run-item">
          <img v-if="item.imagePath" :src="fileUrl(item.imagePath)" alt="识别截图" />
          <div>
            <strong
              >{{ item.expectedFingerprint.setName }} · {{ item.expectedFingerprint.slot }}</strong
            >
            <small>+{{ item.expectedFingerprint.level }} · #{{ item.itemId }}</small>
            <span>{{ statusLabel(item.previewStatus) }}</span>
            <p v-if="item.reason">{{ item.reason }}</p>
          </div>
        </article>
      </div>
    </article>

    <footer class="cleanup-safety-note">
      {{ capabilities?.message ?? "正在读取清理能力状态…" }}。Ctrl + Shift + F12
      可在软件窗口聚焦时停止任务；视觉模板和状态机完成验收前不会发送游戏输入。
    </footer>
  </section>
</template>

<style scoped>
.cleanup-workspace {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 1px 2px 8px;
}
.cleanup-overview {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.78fr);
  gap: 12px;
}
.cleanup-hero,
.cleanup-list-card > header,
.cleanup-run-detail > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.cleanup-hero {
  position: relative;
  min-height: 142px;
  padding: 22px 24px 20px;
  overflow: hidden;
  border-color: rgba(46, 79, 126, 0.16);
  background:
    radial-gradient(circle at 76% 16%, rgba(199, 165, 90, 0.17), transparent 145px),
    linear-gradient(112deg, rgba(255, 255, 255, 0.96), rgba(236, 243, 251, 0.9));
}
.cleanup-hero::after {
  position: absolute;
  right: 126px;
  bottom: -98px;
  width: 190px;
  height: 190px;
  border: 1px solid rgba(42, 84, 145, 0.11);
  border-radius: 50%;
  content: "";
}
.cleanup-hero-copy {
  display: grid;
  z-index: 1;
  gap: 4px;
}
.cleanup-kicker {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 2px;
  color: var(--muted);
  font:
    700 8px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.16em;
}
.cleanup-kicker i {
  padding: 4px 6px;
  color: #886b2c;
  background: rgba(199, 165, 90, 0.13);
  font-style: normal;
  letter-spacing: 0.04em;
}
.cleanup-hero h2,
.cleanup-model-card h3,
.cleanup-list-card h3,
.cleanup-run-detail h3 {
  margin: 2px 0 6px;
}
.cleanup-hero p,
.cleanup-model-card p,
.cleanup-run-detail p {
  margin: 0;
  color: var(--ink-soft);
  font-size: 11px;
}
.cleanup-hero h2 {
  font-size: 25px;
  letter-spacing: 0.06em;
}
.cleanup-hero-copy > small {
  margin-top: 5px;
  color: var(--muted);
  font-size: 9px;
}
.cleanup-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.cleanup-primary-actions {
  z-index: 1;
  align-self: flex-end;
}
.cleanup-primary-actions :deep(.p-button) {
  min-width: 96px;
}
.cleanup-model-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: 9px;
  min-height: 142px;
  padding: 17px 18px 15px;
}
.model-heading {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
}
.model-heading h3 {
  margin: 2px 0 0;
  font-size: 16px;
}
.model-heading b {
  color: var(--muted);
  font:
    700 7px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.14em;
}
.model-state-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #b9c2cf;
  box-shadow: 0 0 0 4px rgba(155, 168, 185, 0.13);
}
.model-state-dot.ready {
  background: var(--cyan);
  box-shadow: 0 0 0 4px rgba(69, 174, 183, 0.13);
}
.model-message {
  min-height: 14px;
}
.cleanup-model-card code {
  display: block;
  max-width: 100%;
  color: var(--muted);
  font-size: 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-controls {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}
.cleanup-model-card :deep(.p-progressbar) {
  height: 7px;
}
.cleanup-progress {
  display: grid;
  grid-template-columns: auto 1fr 180px;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid rgba(36, 86, 166, 0.18);
  border-radius: 8px;
  background: #f6f9ff;
  font-size: 10px;
}
.cleanup-progress .p-progressbar {
  height: 7px;
}
.cleanup-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: 1;
  gap: 14px;
  min-height: 0;
}
.cleanup-list-card {
  display: flex;
  min-height: 230px;
  flex-direction: column;
  padding: 17px 18px;
  overflow: hidden;
}
.cleanup-list-card header span {
  color: var(--muted);
  font-size: 9px;
}
.cleanup-list-card ul {
  display: grid;
  gap: 6px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  overflow: auto;
}
.cleanup-list-card li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
}
.cleanup-list-card li.active {
  border-color: var(--blue);
  background: #f5f8ff;
}
.cleanup-list-card li div,
.run-main {
  display: grid;
  gap: 3px;
  text-align: left;
}
.cleanup-list-card small,
.run-item small {
  color: var(--muted);
  font-size: 8px;
}
.cleanup-list-card li > button:not(.run-main) {
  color: #a2584b;
  background: transparent;
  font-size: 9px;
}
.run-main {
  flex: 1;
  background: transparent;
}
.cleanup-empty {
  display: grid;
  flex: 1;
  place-content: center;
  justify-items: center;
  gap: 7px;
  min-height: 130px;
  color: var(--muted);
  text-align: center;
}
.cleanup-empty > span {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid rgba(42, 83, 143, 0.16);
  color: var(--gold);
  background: rgba(241, 245, 250, 0.8);
  font-size: 15px;
  border-radius: 50%;
}
.cleanup-empty strong {
  color: var(--ink-soft);
  font-size: 11px;
}
.cleanup-empty p {
  max-width: 280px;
  margin: 0;
  font-size: 9px;
  line-height: 1.6;
}
.cleanup-run-detail {
  padding: 18px 20px;
}
.invalid-banner {
  margin: 12px 0;
  padding: 9px 11px;
  border-left: 3px solid #b65b4b;
  color: #8f4437;
  background: #fff4f1;
  font-size: 10px;
}
.run-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 10px;
  margin-top: 14px;
}
.run-item {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}
.run-item img {
  width: 100%;
  height: 120px;
  object-fit: cover;
  background: #eef1f4;
}
.run-item > div {
  display: grid;
  gap: 4px;
  padding: 10px;
}
.run-item span {
  color: var(--blue);
  font-size: 9px;
}
.run-item p {
  font-size: 9px;
  line-height: 1.5;
}
.cleanup-safety-note {
  padding: 4px 5px 12px;
  color: var(--muted);
  font-size: 9px;
  line-height: 1.6;
}
@media (max-width: 900px) {
  .cleanup-columns,
  .cleanup-overview {
    grid-template-columns: 1fr;
  }
  .cleanup-hero,
  .cleanup-model-card {
    min-height: auto;
  }
  .cleanup-progress {
    grid-template-columns: 1fr;
  }
}
</style>
