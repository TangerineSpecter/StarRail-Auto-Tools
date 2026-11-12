<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Drawer from "primevue/drawer";
import { useMobileData } from "./useMobileData";
import { inventoryApi } from "@/shared/api/inventory";
import { formatTime } from "@/shared/utils/display";
import type { InventorySummary, SyncSettings } from "@/types";

const emit = defineEmits<{ synced: [] }>();

const {
  settings,
  loading: syncLoading,
  error: syncError,
  download,
  loadSettings,
} = useMobileData();

const notice = ref("");
const localError = ref("");
const showPassword = ref(false);
const helpDrawerVisible = ref(false);
const summary = ref<InventorySummary | null>(null);

const activeError = computed(() => localError.value || syncError.value);
const isBusy = computed(() => syncLoading.value);

const isConfigured = computed(() => {
  const cfg = settings.value?.webdav;
  return Boolean(cfg?.serverUrl?.trim() && cfg?.remotePath?.trim());
});

const serverHost = computed(() => {
  const url = settings.value?.webdav?.serverUrl?.trim();
  if (!url) return "";
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.host || url;
  } catch {
    return url.replace(/^https?:\/\//i, "").split("/")[0] || url;
  }
});

const statusText = computed(() => {
  if (syncLoading.value) return "正在同步…";
  return isConfigured.value ? "准备就绪" : "待配置";
});

const statusDotClass = computed(() => {
  if (syncLoading.value) return "loading";
  return isConfigured.value ? "ready" : "idle";
});

const lastSyncFormatted = computed(() => formatTime(summary.value?.lastSyncAt ?? null));

const localDataSummaryText = computed(() => {
  if (!summary.value) return "读取本地数据中…";
  const { characters = 0, relics = 0, lightCones = 0 } = summary.value;
  if (characters === 0 && relics === 0 && lightCones === 0) {
    return "本地暂无快照数据";
  }
  return `${characters} 角色 · ${relics} 遗器 · ${lightCones} 光锥`;
});

async function loadSummary() {
  try {
    summary.value = await inventoryApi.summary();
  } catch {
    // 忽略非关键概览读取错误
  }
}

onMounted(() => {
  void loadSettings();
  void loadSummary();
});

function clearFeedback() {
  notice.value = "";
  localError.value = "";
  syncError.value = "";
}

function getWebDavSettingsPayload(): SyncSettings | null {
  if (!settings.value) return null;
  return {
    ...settings.value,
    protocol: "webdav",
    webdav: {
      ...settings.value.webdav,
      serverUrl: settings.value.webdav.serverUrl.trim(),
      remotePath: settings.value.webdav.remotePath.trim(),
      username: settings.value.webdav.username.trim(),
      password: settings.value.webdav.password,
    },
  };
}

async function sync() {
  clearFeedback();
  const payload = getWebDavSettingsPayload();
  if (!payload || !payload.webdav.serverUrl) {
    localError.value = "请先填写完整的服务器地址再开始下载。";
    return;
  }
  if (!payload.webdav.remotePath.startsWith("/")) {
    localError.value = "远端目录必须以 / 开头（例如 /StarRailTools/）。";
    return;
  }

  const ok = await download();
  if (ok) {
    notice.value = "同步完成，最新数据已保存在手机上。";
    emit("synced");
    await loadSummary();
  }
}
</script>

<template>
  <section class="mobile-sync" :aria-busy="isBusy">
    <!-- 顶部数据中枢与状态卡片 -->
    <div class="mobile-sync-status">
      <!-- 标题栏与帮助切换 -->
      <header class="status-card-header">
        <div class="brand-badge-row">
          <div class="sync-icon-orb" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21.5 2v6h-6" />
              <path d="M2.5 22v-6h6" />
              <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8" />
              <path d="M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16" />
            </svg>
          </div>
          <div class="header-titles">
            <div class="title-with-pill">
              <h2>数据同步站</h2>
              <span class="protocol-tag">WebDAV</span>
            </div>
            <p class="header-subtitle">
              {{
                isConfigured
                  ? serverHost
                    ? `已连接 · ${serverHost}`
                    : "连接已配置"
                  : "填写连接信息后即可同步"
              }}
            </p>
          </div>
        </div>

        <button
          class="help-toggle-btn"
          type="button"
          :class="{ active: helpDrawerVisible }"
          aria-label="查看同步指南"
          @click="helpDrawerVisible = true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path stroke-linecap="round" d="M12 16v-4m0-4h.01" />
          </svg>
        </button>
      </header>

      <!-- 核心指标仪表板：分为状态/最近同步双列 + 本地快照通栏行，彻底消除截断 -->
      <div class="sync-metrics-panel">
        <div class="metrics-split-row">
          <div class="metric-cell">
            <span class="metric-label">状态</span>
            <div class="metric-status-row">
              <span class="status-dot" :class="statusDotClass" />
              <strong class="metric-val">{{ statusText }}</strong>
            </div>
          </div>
          <div class="metric-divider" />
          <div class="metric-cell">
            <span class="metric-label">最近同步</span>
            <strong class="metric-val" :title="lastSyncFormatted">{{ lastSyncFormatted }}</strong>
          </div>
        </div>
        <div class="metrics-summary-row">
          <div class="summary-label-group">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              class="summary-inline-icon"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
            <span class="metric-label">当前本地数据</span>
          </div>
          <strong class="metric-val local-stat">{{ localDataSummaryText }}</strong>
        </div>
      </div>

      <!-- 反馈消息 Banner -->
      <transition name="fade">
        <div v-if="notice" class="sync-banner success" role="status">
          <svg class="banner-icon" viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clip-rule="evenodd"
            />
          </svg>
          <span class="banner-message">{{ notice }}</span>
          <button type="button" class="banner-dismiss" aria-label="关闭提示" @click="notice = ''">
            ×
          </button>
        </div>
      </transition>

      <transition name="fade">
        <div v-if="activeError" class="sync-banner error" role="alert">
          <svg class="banner-icon" viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clip-rule="evenodd"
            />
          </svg>
          <div class="banner-text-group">
            <span class="banner-message">{{ activeError }}</span>
            <button v-if="!settings" class="inline-retry-btn" type="button" @click="loadSettings">
              重试读取
            </button>
          </div>
          <button type="button" class="banner-dismiss" aria-label="关闭提示" @click="clearFeedback">
            ×
          </button>
        </div>
      </transition>

      <!-- 主要行动按钮：下载并覆盖 -->
      <button
        class="sync-action-btn primary"
        type="button"
        :disabled="isBusy || !settings"
        @click="sync"
      >
        <span v-if="syncLoading" class="btn-spinner" />
        <svg
          v-else
          class="btn-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        <span>{{ syncLoading ? "正在同步最新数据…" : "下载最新数据" }}</span>
      </button>
    </div>

    <!-- 底部连接信息面板 (iOS Inset Grouped 表单) -->
    <div v-if="settings" class="settings-panel">
      <div class="panel-top-bar">
        <div class="panel-heading">
          <span class="panel-eyebrow">CONFIGURATION</span>
          <h3>连接信息</h3>
        </div>
      </div>

      <!-- 表单组：左侧图标+标签，右侧输入框，横向排列杜绝上下重叠，彻底清除聚焦外框 -->
      <form id="mobile-sync-form" class="ios-grouped-list" @submit.prevent="sync">
        <!-- 服务器地址 -->
        <div class="ios-form-row">
          <div class="row-leading-icon host-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="10" />
              <path
                stroke-linecap="round"
                d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"
              />
            </svg>
          </div>
          <label for="sync-server-url" class="row-label">服务器地址</label>
          <input
            id="sync-server-url"
            v-model="settings.webdav.serverUrl"
            type="url"
            inputmode="url"
            required
            placeholder="https://example.com"
            autocapitalize="none"
            :spellcheck="false"
            :disabled="isBusy"
          />
        </div>

        <!-- 远端目录 -->
        <div class="ios-form-row">
          <div class="row-leading-icon path-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
          </div>
          <label for="sync-remote-path" class="row-label">远端目录</label>
          <input
            id="sync-remote-path"
            v-model="settings.webdav.remotePath"
            type="text"
            required
            placeholder="/StarRailTools/"
            autocapitalize="none"
            :spellcheck="false"
            :disabled="isBusy"
          />
        </div>

        <!-- 用户名 -->
        <div class="ios-form-row">
          <div class="row-leading-icon user-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
          <label for="sync-username" class="row-label">用户名</label>
          <input
            id="sync-username"
            v-model="settings.webdav.username"
            type="text"
            autocomplete="username"
            placeholder="WebDAV 账号"
            autocapitalize="none"
            :spellcheck="false"
            :disabled="isBusy"
          />
        </div>

        <!-- 密码与切换按钮 -->
        <div class="ios-form-row last-row">
          <div class="row-leading-icon lock-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <label for="sync-password" class="row-label">密码</label>
          <input
            id="sync-password"
            v-model="settings.webdav.password"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            placeholder="WebDAV 密码或密钥"
            :disabled="isBusy"
          />
          <button
            type="button"
            class="password-eye-btn"
            :aria-label="showPassword ? '隐藏密码' : '显示密码'"
            @click="showPassword = !showPassword"
          >
            <svg
              v-if="showPassword"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
              />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          </button>
        </div>
      </form>

      <!-- 隐私与安全脚注 -->
      <footer class="panel-security-footer">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          class="shield-svg"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
        <span>连接凭据仅保存在手机私有沙盒中；快照下载后支持完全离线使用。</span>
      </footer>
    </div>

    <!-- 优雅的 iOS 底部抽屉说明面板 -->
    <Drawer
      v-model:visible="helpDrawerVisible"
      position="bottom"
      block-scroll
      class="mobile-sync-help-sheet"
      :show-close-icon="false"
      aria-label="数据同步使用指南"
    >
      <template #header>
        <div class="sheet-header-bar">
          <div class="sheet-title-text">
            <h3>使用指南与说明</h3>
            <p>WebDAV 跨端同步与离线机制</p>
          </div>
          <button type="button" class="sheet-close-btn" @click="helpDrawerVisible = false">
            完成
          </button>
        </div>
      </template>

      <div class="sheet-content-wrap">
        <div class="sheet-step-list">
          <div class="sheet-step-item">
            <span class="step-badge">1</span>
            <div class="step-body">
              <strong>电脑端上传数据</strong>
              <p>在桌面软件的「数据同步站」配置同一 WebDAV 服务器并点击「上传本地数据」。</p>
            </div>
          </div>
          <div class="sheet-step-item">
            <span class="step-badge">2</span>
            <div class="step-body">
              <strong>手机端配置连接</strong>
              <p>在下方填写相同的服务器地址与远端目录（如 /StarRailTools/），无需重复配队。</p>
            </div>
          </div>
          <div class="sheet-step-item">
            <span class="step-badge">3</span>
            <div class="step-body">
              <strong>一键下载并离线查看</strong>
              <p>点击「下载最新数据」，快照保存至本地沙盒后，手机端即可随时断网离线查阅。</p>
            </div>
          </div>
        </div>

        <div class="sheet-tip-card">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="tip-icon"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div class="tip-text">
            <strong>冲突安全保护机制</strong>
            <p>手机端为纯查看版。若检测到本机数据存在未同步修改，将自动停止下载以避免覆盖。</p>
          </div>
        </div>
      </div>
    </Drawer>
  </section>
</template>

<style scoped>
/* 容器及通用微质感 */
.mobile-sync {
  display: grid;
  gap: 16px;
  width: 100%;
}

/* 顶部状态卡片 */
.mobile-sync-status {
  position: relative;
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 18px;
  padding: 20px;
  box-shadow:
    0 10px 25px -5px rgba(24, 39, 75, 0.05),
    0 2px 6px -1px rgba(24, 39, 75, 0.03);
  overflow: hidden;
}

.status-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.brand-badge-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.sync-icon-orb {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #1c3547;
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(28, 53, 71, 0.2);
  flex-shrink: 0;
}

.sync-icon-orb svg {
  width: 20px;
  height: 20px;
  stroke: #ffffff;
}

.header-titles {
  min-width: 0;
}

.title-with-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.title-with-pill h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  color: #1e293b;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.protocol-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(37, 99, 235, 0.08);
  color: #2563eb;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.3;
}

.header-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 帮助折叠按钮 */
.help-toggle-btn {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  color: #64748b;
  padding: 0;
  flex-shrink: 0;
  transition: all 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}

.help-toggle-btn svg {
  width: 20px;
  height: 20px;
}

.help-toggle-btn:active,
.help-toggle-btn.active {
  background: #edf4ff;
  border-color: #bfdbfe;
  color: #2563eb;
}

/* 核心指标展示网格 */
.sync-metrics-panel {
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  border: 1px solid #edf2f7;
  border-radius: 14px;
  padding: 10px 14px;
  margin-bottom: 16px;
  gap: 9px;
}

.metrics-split-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.metric-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.metric-divider {
  width: 1px;
  height: 28px;
  background: #e2e8f0;
  flex-shrink: 0;
}

.metric-label {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.metric-status-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.ready {
  background: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
}

.status-dot.idle {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
}

.status-dot.loading {
  background: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
  animation: pulse-ring 1.5s infinite;
}

@keyframes pulse-ring {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(59, 130, 246, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
  }
}

.metric-val {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
}

/* 通栏本地数据行：享有完整宽度，彻底杜绝换行与省略号截断 */
.metrics-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid #edf2f7;
}

.summary-label-group {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.summary-inline-icon {
  width: 14px;
  height: 14px;
  color: #64748b;
  flex-shrink: 0;
}

.local-stat {
  color: #334155;
  font-size: 12.5px;
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
  overflow: visible;
}

/* 反馈横幅样式 */
.sync-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13.5px;
  line-height: 1.45;
  margin-bottom: 16px;
}

.sync-banner.success {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
}

.sync-banner.error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

.banner-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 1px;
}

.banner-text-group {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.banner-message {
  overflow-wrap: anywhere;
}

.inline-retry-btn {
  border: 0;
  background: none;
  color: #991b1b;
  font-weight: 700;
  text-decoration: underline;
  padding: 0;
  text-align: left;
  font-size: 12.5px;
  min-height: 24px;
}

.banner-dismiss {
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 18px;
  line-height: 1;
  padding: 0 4px;
  opacity: 0.6;
  border-radius: 4px;
}

.banner-dismiss:active {
  opacity: 1;
}

/* 主要行动按钮 */
.sync-action-btn.primary {
  width: 100%;
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 13px;
  background: linear-gradient(135deg, #1c3547 0%, #284c66 100%);
  color: #ffffff;
  font-size: 15.5px;
  font-weight: 600;
  box-shadow: 0 4px 14px rgba(28, 53, 71, 0.25);
  transition: all 0.18s ease;
  -webkit-tap-highlight-color: transparent;
}

.sync-action-btn.primary:not(:disabled):active {
  transform: scale(0.98);
  box-shadow: 0 2px 6px rgba(28, 53, 71, 0.2);
}

.sync-action-btn.primary:disabled {
  opacity: 0.55;
  box-shadow: none;
  cursor: not-allowed;
}

.btn-svg {
  width: 19px;
  height: 19px;
}

/* 底部连接信息面板 */
.settings-panel {
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 18px;
  padding: 20px;
  box-shadow:
    0 10px 25px -5px rgba(24, 39, 75, 0.05),
    0 2px 6px -1px rgba(24, 39, 75, 0.03);
}

.panel-top-bar {
  margin-bottom: 10px;
}

.panel-heading {
  display: flex;
  flex-direction: column;
}

.panel-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #94a3b8;
  font-family: -apple-system, BlinkMacSystemFont, "Bahnschrift", sans-serif;
  line-height: 1.2;
}

.panel-heading h3 {
  margin: 2px 0 0 !important;
  font-size: 17px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.25;
}

/* iOS Grouped List 表单样式，显式消除全局 .settings-panel form 的 margin-top: 22px 影响 */
.mobile-sync .settings-panel form.ios-grouped-list,
.ios-grouped-list {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  overflow: hidden;
}

.ios-form-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 0 14px;
  background: #ffffff;
  transition: background 0.15s ease;
}

.ios-form-row:not(.last-row)::after {
  content: "";
  position: absolute;
  left: 54px;
  right: 0;
  bottom: 0;
  height: 1px;
  background: #f1f5f9;
}

.ios-form-row:focus-within {
  background: #f8fbff;
}

.row-leading-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: #f1f5f9;
  color: #475569;
  flex-shrink: 0;
}

.row-leading-icon svg {
  width: 16px;
  height: 16px;
}

.host-icon {
  background: #eff6ff;
  color: #2563eb;
}

.path-icon {
  background: #fef3c7;
  color: #d97706;
}

.user-icon {
  background: #f3e8ff;
  color: #7c3aed;
}

.lock-icon {
  background: #ecfdf5;
  color: #059669;
}

.row-label {
  font-size: 14.5px;
  font-weight: 500;
  color: #334155;
  width: 76px;
  flex-shrink: 0;
  margin: 0;
  user-select: none;
  line-height: 1;
}

/* 核心：彻底重置 input 的任何原生外边框、阴影和聚焦高亮方框，杜绝遮盖文字 */
.mobile-sync .ios-form-row input,
.ios-form-row input {
  flex: 1;
  width: auto !important;
  min-width: 0;
  border: 0 !important;
  outline: none !important;
  box-shadow: none !important;
  -webkit-appearance: none !important;
  appearance: none !important;
  background: transparent !important;
  padding: 0 4px !important;
  min-height: 44px !important;
  height: 44px !important;
  font-size: 14.5px;
  color: #0f172a;
  line-height: 44px;
}

.mobile-sync .ios-form-row input:focus,
.mobile-sync .ios-form-row input:focus-visible,
.ios-form-row input:focus,
.ios-form-row input:focus-visible {
  outline: none !important;
  outline-style: none !important;
  box-shadow: none !important;
  border: 0 !important;
}

.mobile-sync .ios-form-row input::placeholder,
.ios-form-row input::placeholder {
  color: #94a3b8;
  font-size: 14px;
}

.password-eye-btn {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-right: -6px;
  border: 0;
  background: transparent;
  color: #94a3b8;
  padding: 0;
  border-radius: 8px;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.password-eye-btn:active {
  color: #1e293b;
  background: #f1f5f9;
}

.password-eye-btn svg {
  width: 20px;
  height: 20px;
}

/* 底部安全提示 */
.panel-security-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
  padding: 0 4px;
}

.shield-svg {
  width: 16px;
  height: 16px;
  color: #10b981;
  flex-shrink: 0;
}

/* 通用加载 Spinner */
.btn-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sync-action-btn.primary,
  .help-toggle-btn,
  .status-dot.loading,
  .fade-enter-active,
  .fade-leave-active {
    transition: none !important;
    animation: none !important;
  }
}
</style>

<style>
/* iOS 底部说明抽屉样式 */
.mobile-sync-help-sheet.p-drawer {
  width: min(720px, 100vw);
  max-width: 100vw;
  height: auto;
  max-height: 82dvh;
  border: 0;
  border-radius: 20px 20px 0 0;
  background: #ffffff;
  box-shadow: 0 -10px 40px rgba(15, 23, 42, 0.16);
  padding: 0 0 env(safe-area-inset-bottom, 16px);
  overflow: hidden;
}

.mobile-sync-help-sheet::before {
  content: "";
  position: absolute;
  top: 8px;
  left: 50%;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: #cbd5e1;
  transform: translateX(-50%);
}

.mobile-sync-help-sheet .p-drawer-header {
  padding: 22px 20px 14px;
  border-bottom: 1px solid #f1f5f9;
}

.help-sheet-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sheet-title-text h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
}

.sheet-title-text p {
  margin: 2px 0 0;
  font-size: 12px;
  color: #64748b;
}

.sheet-close-btn {
  border: 0;
  background: transparent;
  color: #2563eb;
  font-size: 15px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.sheet-close-btn:active {
  background: #eff6ff;
}

.mobile-sync-help-sheet .p-drawer-content {
  padding: 20px 20px 24px;
  overflow-y: auto;
}

.sheet-step-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 20px;
}

.sheet-step-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.step-badge {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #eff6ff;
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}

.step-body strong {
  display: block;
  font-size: 14.5px;
  color: #1e293b;
  margin-bottom: 3px;
}

.step-body p {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}

.sheet-tip-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}

.tip-icon {
  width: 18px;
  height: 18px;
  color: #f59e0b;
  flex-shrink: 0;
  margin-top: 2px;
}

.tip-text strong {
  display: block;
  font-size: 13.5px;
  color: #1e293b;
  margin-bottom: 2px;
}

.tip-text p {
  margin: 0;
  font-size: 12.5px;
  color: #64748b;
  line-height: 1.45;
}
</style>
