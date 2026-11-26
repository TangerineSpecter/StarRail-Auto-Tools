<script setup lang="ts">
import { computed } from "vue";
import { APP_VERSION, PROJECT_RELEASES_URL } from "@/shared/app-info";
import { describeDownloadProgress, type AppUpdaterContext } from "@/shared/contracts/updater";
import InlineSpinner from "@/shared/ui/InlineSpinner.vue";
import { openExternalUrl } from "@/shared/utils/open-external-url";

const props = defineProps<{
  updater?: AppUpdaterContext | null;
}>();

const status = computed(() => props.updater?.status.value ?? "idle");
const availableUpdate = computed(() => props.updater?.update.value ?? null);
const progress = computed(() => props.updater?.progress.value ?? null);
const errorMessage = computed(() => props.updater?.errorMessage.value ?? "");
const isChecking = computed(() => props.updater?.isChecking.value ?? false);
const isInstalling = computed(() => props.updater?.isInstalling.value ?? false);
const progressText = computed(() => describeDownloadProgress(progress.value));

const metaBadge = computed(() => {
  if (availableUpdate.value) return `NEW v${availableUpdate.value.version}`;
  return `CURRENT v${APP_VERSION}`;
});

const statusDescription = computed(() => {
  if (isChecking.value) return "正在连接 GitHub Release 检查是否有新版本…";
  if (isInstalling.value) return progressText.value;
  if (availableUpdate.value) {
    const notes = availableUpdate.value.notes?.trim();
    const prefix = `发现新版本 v${availableUpdate.value.version}，可直接应用内下载、校验签名并覆盖安装（本地背包与方案数据会保留）。`;
    return notes ? `${prefix} ${notes}` : prefix;
  }
  if (status.value === "up-to-date") {
    return `当前 v${APP_VERSION} 已是最新版本。`;
  }
  return "支持在 Windows 客户端内自动检测、校验签名并安装新版本；若网络受限，也可前往 GitHub Release 手动下载覆盖安装。";
});

const primaryInstallLabel = computed(() => {
  if (status.value === "installing") return "正在启动安装…";
  if (status.value === "downloading") return "正在下载…";
  if (status.value === "error") return "重试更新";
  return "立即更新";
});

function handleCheckUpdate() {
  void props.updater?.checkForUpdates({ silent: false });
}

function handleInstallUpdate() {
  void props.updater?.installAvailableUpdate();
}

function handleManualDownload() {
  if (props.updater) {
    void props.updater.openManualDownload();
    return;
  }
  void openExternalUrl(PROJECT_RELEASES_URL);
}
</script>

<template>
  <section class="update-card" aria-labelledby="about-update-title">
    <div class="update-copy">
      <p class="eyebrow">SOFTWARE UPDATE</p>
      <h3 id="about-update-title">客户端更新</h3>
      <p class="update-description">{{ statusDescription }}</p>

      <div v-if="isInstalling" class="update-progress" role="status">
        <div class="update-progress-track">
          <span
            :class="['update-progress-bar', { indeterminate: progress?.percent == null }]"
            :style="progress?.percent != null ? { width: `${progress.percent}%` } : undefined"
          />
        </div>
      </div>

      <p v-if="status === 'error' && errorMessage" class="update-error" role="alert">
        {{ errorMessage }}
      </p>
    </div>

    <div class="update-action">
      <span :class="['update-badge', { 'has-update': Boolean(availableUpdate) }]">
        {{ metaBadge }}
      </span>
      <div class="update-buttons">
        <button
          v-if="availableUpdate"
          type="button"
          class="update-primary-btn"
          :disabled="isInstalling || isChecking"
          @click="handleInstallUpdate"
        >
          <InlineSpinner v-if="isInstalling" size="xs" />
          <span>{{ primaryInstallLabel }}</span>
        </button>
        <button
          v-if="updater"
          type="button"
          :class="availableUpdate ? 'update-secondary-btn' : 'update-primary-btn'"
          :disabled="isChecking || isInstalling"
          @click="handleCheckUpdate"
        >
          <InlineSpinner v-if="isChecking" size="xs" />
          <span>{{ isChecking ? "检查中…" : availableUpdate ? "重新检查" : "检查更新" }}</span>
        </button>
        <button
          type="button"
          class="update-secondary-btn"
          :disabled="isInstalling"
          @click="handleManualDownload"
        >
          手动下载
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.update-card {
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
.update-copy {
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
.update-copy h3 {
  margin: 7px 0 5px;
  color: var(--ink);
  font-size: 18px;
}
.update-description {
  max-width: 660px;
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.65;
}
.update-progress {
  max-width: 420px;
  margin-top: 10px;
}
.update-progress-track {
  position: relative;
  height: 6px;
  overflow: hidden;
  background: rgba(42, 72, 113, 0.12);
}
.update-progress-bar {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--blue-deep), var(--cyan));
  transition: width 140ms ease;
}
.update-progress-bar.indeterminate {
  width: 36%;
  animation: about-update-indeterminate 1.2s ease-in-out infinite;
}
@keyframes about-update-indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(300%);
  }
}
.update-error {
  max-width: 660px;
  margin: 8px 0 0;
  color: #a13f35;
  font-size: 11px;
  line-height: 1.55;
}
.update-action {
  display: grid;
  flex: 0 0 auto;
  justify-items: end;
  gap: 8px;
}
.update-badge {
  color: var(--muted);
  font:
    700 8px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.12em;
}
.update-badge.has-update {
  color: var(--blue);
}
.update-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.update-primary-btn,
.update-secondary-btn {
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
    border-color 0.18s ease;
}
.update-primary-btn {
  border: 1px solid var(--blue-deep);
  color: #fff;
  background: var(--blue-deep);
}
.update-primary-btn:hover:not(:disabled) {
  background: var(--blue);
  box-shadow: 0 8px 18px rgba(41, 81, 136, 0.18);
}
.update-secondary-btn {
  border: 1px solid rgba(42, 72, 113, 0.24);
  color: var(--ink-soft);
  background: rgba(255, 255, 255, 0.85);
}
.update-secondary-btn:hover:not(:disabled) {
  border-color: var(--blue);
  color: var(--blue-deep);
  background: #fff;
}
.update-primary-btn:disabled,
.update-secondary-btn:disabled {
  cursor: wait;
  opacity: 0.65;
}
@media (max-width: 900px) {
  .update-card {
    align-items: stretch;
    flex-direction: column;
  }
  .update-action {
    justify-items: start;
  }
  .update-buttons {
    justify-content: flex-start;
  }
}
@media (max-width: 560px) {
  .update-card {
    padding: 18px;
  }
}
</style>
