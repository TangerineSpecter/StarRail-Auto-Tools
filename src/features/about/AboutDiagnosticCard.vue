<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { APP_VERSION } from "@/shared/app-info";
import { diagnosticsApi } from "@/shared/api/diagnostics";
import { formatDiagnosticBytes, frontendDiagnostics } from "@/shared/diagnostics/frontend";
import InlineSpinner from "@/shared/ui/InlineSpinner.vue";

const frontendBytes = ref(frontendDiagnostics.byteLength());
const backendBytes = ref<number | null>(null);
const loadingSize = ref(false);
const exporting = ref(false);
const clearing = ref(false);
const actionStatus = ref("");

let statusRequestId = 0;
let unmounted = false;

const totalBytes = computed(() => frontendBytes.value + (backendBytes.value ?? 0));

const sizeSummaryText = computed(() =>
  loadingSize.value && backendBytes.value === null
    ? "计算中…"
    : formatDiagnosticBytes(totalBytes.value),
);

const sizeDetailText = computed(() => {
  if (backendBytes.value !== null) {
    return `前端 ${formatDiagnosticBytes(frontendBytes.value)} · 后端 ${formatDiagnosticBytes(backendBytes.value)}`;
  }
  if (!loadingSize.value) {
    return `前端 ${formatDiagnosticBytes(frontendBytes.value)}`;
  }
  return "";
});

const clearDisabled = computed(() => exporting.value || clearing.value || totalBytes.value === 0);

async function refreshLogSize() {
  const requestId = ++statusRequestId;
  loadingSize.value = true;
  frontendBytes.value = frontendDiagnostics.byteLength();
  try {
    const status = await diagnosticsApi.getStatus();
    if (unmounted || requestId !== statusRequestId) return;
    backendBytes.value = Math.max(0, status.backendBytes);
    frontendBytes.value = frontendDiagnostics.byteLength();
  } catch {
    if (unmounted || requestId !== statusRequestId) return;
    backendBytes.value = null;
    frontendBytes.value = frontendDiagnostics.byteLength();
  } finally {
    if (!unmounted && requestId === statusRequestId) {
      loadingSize.value = false;
    }
  }
}

async function exportDiagnostics() {
  if (exporting.value || clearing.value) return;
  exporting.value = true;
  actionStatus.value = "正在整理前端与后端日志…";
  try {
    const path = await diagnosticsApi.export(frontendDiagnostics.exportPayload(APP_VERSION));
    if (unmounted) return;
    actionStatus.value = path ? `诊断日志已导出：${path}` : "已取消导出诊断日志";
  } catch (cause) {
    if (unmounted) return;
    actionStatus.value = `诊断日志导出失败：${String(cause)}`;
  } finally {
    if (!unmounted) {
      exporting.value = false;
      void refreshLogSize();
    }
  }
}

async function clearDiagnostics() {
  if (exporting.value || clearing.value || totalBytes.value === 0) return;
  statusRequestId += 1;
  loadingSize.value = false;
  clearing.value = true;
  actionStatus.value = "正在清理分析日志…";
  try {
    const status = await diagnosticsApi.clear();
    frontendDiagnostics.clear();
    if (unmounted) return;
    backendBytes.value = Math.max(0, status.backendBytes);
    frontendBytes.value = frontendDiagnostics.byteLength();
    actionStatus.value = "已清理分析日志";
  } catch (cause) {
    if (unmounted) return;
    frontendBytes.value = frontendDiagnostics.byteLength();
    actionStatus.value = `分析日志清理失败：${String(cause)}`;
  } finally {
    if (!unmounted) {
      clearing.value = false;
    }
  }
}

onMounted(() => {
  void refreshLogSize();
});

onBeforeUnmount(() => {
  unmounted = true;
  statusRequestId += 1;
});
</script>

<template>
  <section class="diagnostic-card" aria-labelledby="diagnostic-title">
    <div class="diagnostic-copy">
      <p class="eyebrow">DIAGNOSTIC LOG</p>
      <h3 id="diagnostic-title">日志诊断</h3>
      <p class="diagnostic-description">
        导出当前会话的前端异常、IPC 调用耗时、帧率采样、运行环境，以及 Rust 后端启动日志。
        内容会过滤密码、令牌和带认证信息的地址。
      </p>
      <div class="diagnostic-meta" aria-live="polite">
        <span class="diagnostic-size-badge">
          <small>当前大小</small>
          <strong>{{ sizeSummaryText }}</strong>
        </span>
        <span v-if="sizeDetailText" class="diagnostic-size-detail">{{ sizeDetailText }}</span>
      </div>
    </div>
    <div class="diagnostic-action">
      <span class="diagnostic-kicker">FRONTEND · IPC · RUST</span>
      <div class="diagnostic-buttons">
        <button
          type="button"
          class="diagnostic-secondary-btn"
          :disabled="clearDisabled"
          @click="clearDiagnostics"
        >
          <InlineSpinner v-if="clearing" size="xs" />
          <span>{{ clearing ? "清理中…" : "清理日志" }}</span>
        </button>
        <button
          type="button"
          class="diagnostic-primary-btn"
          :disabled="exporting || clearing"
          @click="exportDiagnostics"
        >
          <InlineSpinner v-if="exporting" size="xs" />
          <span>{{ exporting ? "整理中…" : "导出分析日志" }}</span>
        </button>
      </div>
      <small v-if="actionStatus" role="status">{{ actionStatus }}</small>
    </div>
  </section>
</template>

<style scoped>
.diagnostic-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  width: 100%;
  max-width: 1030px;
  margin-top: 15px;
  padding: 19px 22px;
  border: 1px solid rgba(42, 72, 113, 0.14);
  background: rgba(255, 255, 255, 0.68);
  box-shadow: 0 14px 35px rgba(47, 73, 110, 0.06);
}
.diagnostic-copy {
  min-width: 0;
  flex: 1 1 auto;
}
.eyebrow {
  margin: 0;
  color: var(--blue);
  font:
    700 10px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.19em;
}
.diagnostic-copy h3 {
  margin: 7px 0 5px;
  color: var(--ink);
  font-size: 18px;
}
.diagnostic-description {
  max-width: 660px;
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.65;
}
.diagnostic-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}
.diagnostic-size-badge {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  padding: 5px 10px;
  border-left: 2px solid var(--blue);
  background: rgba(246, 249, 253, 0.85);
}
.diagnostic-size-badge small {
  color: var(--muted);
  font-size: 10px;
  font-weight: 600;
}
.diagnostic-size-badge strong {
  color: var(--ink);
  font:
    700 12px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.03em;
}
.diagnostic-size-detail {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
}
.diagnostic-action {
  display: grid;
  flex: 0 0 auto;
  justify-items: end;
  gap: 8px;
}
.diagnostic-kicker {
  color: var(--muted);
  font:
    700 8px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.12em;
}
.diagnostic-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.diagnostic-primary-btn,
.diagnostic-secondary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 35px;
  padding: 0 14px;
  font: 700 11px/1 var(--font-ui);
  cursor: pointer;
  transition:
    background 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}
.diagnostic-primary-btn {
  border: 1px solid var(--blue-deep);
  color: #fff;
  background: var(--blue-deep);
}
.diagnostic-primary-btn:hover:not(:disabled) {
  background: var(--blue);
  box-shadow: 0 8px 18px rgba(41, 81, 136, 0.18);
}
.diagnostic-secondary-btn {
  border: 1px solid rgba(42, 72, 113, 0.24);
  color: var(--ink-soft);
  background: rgba(255, 255, 255, 0.85);
}
.diagnostic-secondary-btn:hover:not(:disabled) {
  border-color: rgba(161, 63, 53, 0.45);
  color: #a13f35;
  background: rgba(255, 248, 247, 0.95);
}
.diagnostic-primary-btn:disabled,
.diagnostic-secondary-btn:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}
.diagnostic-action small {
  max-width: 300px;
  color: var(--muted);
  font-size: 9px;
  line-height: 1.4;
  text-align: right;
  overflow-wrap: anywhere;
}
@media (max-width: 900px) {
  .diagnostic-card {
    align-items: stretch;
    flex-direction: column;
  }
  .diagnostic-action {
    justify-items: start;
  }
  .diagnostic-buttons {
    justify-content: flex-start;
  }
  .diagnostic-action small {
    text-align: left;
  }
}
@media (max-width: 560px) {
  .diagnostic-card {
    padding: 18px;
  }
}
</style>
