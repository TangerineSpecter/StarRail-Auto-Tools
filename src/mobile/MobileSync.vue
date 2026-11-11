<script setup lang="ts">
import { onDeactivated, onMounted, ref } from "vue";
import Popover from "primevue/popover";
import { useMobileData } from "./useMobileData";
const { settings, loading, error, download, loadSettings } = useMobileData();
const emit = defineEmits<{ synced: [] }>();
const message = ref("");
const help = ref<InstanceType<typeof Popover>>();
const helpOpen = ref(false);
onMounted(loadSettings);
onDeactivated(() => help.value?.hide());
async function sync() {
  message.value = "";
  if (await download()) {
    message.value = "同步完成，数据已保存在手机上。";
    emit("synced");
  }
}
</script>
<template>
  <section class="mobile-sync" :aria-busy="loading">
    <div class="mobile-sync-intro">
      <div class="mobile-sync-status">
        <div class="mobile-sync-heading">
          <h2>数据同步站</h2>
          <button
            class="mobile-sync-help-button"
            type="button"
            aria-label="查看同步说明"
            aria-haspopup="dialog"
            aria-controls="mobile-sync-help"
            :aria-expanded="helpOpen"
            @click="help?.toggle($event)"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v6M12 7v1" />
            </svg>
          </button>
        </div>
        <Popover
          id="mobile-sync-help"
          ref="help"
          class="mobile-sync-help-popover"
          aria-label="同步说明"
          aria-describedby="mobile-sync-help-text"
          @show="helpOpen = true"
          @hide="helpOpen = false"
        >
          <p id="mobile-sync-help-text">
            将电脑端的 WebDAV 快照下载到手机，离线查看背包、培养进度与配队。
          </p>
        </Popover>
        <p>{{ settings?.webdav.serverUrl ? "连接已配置" : "先填写连接信息" }}</p>
        <button
          class="primary"
          type="submit"
          form="mobile-sync-form"
          :disabled="loading || !settings"
        >
          {{ loading ? "同步中…" : "下载最新数据" }}
        </button>
      </div>
      <p v-if="!settings && !error" class="state" role="status">正在读取同步配置…</p>
      <p v-if="error" role="alert" class="feedback error">
        {{ error }}
        <button v-if="!settings" class="text-button" @click="loadSettings">重试</button>
      </p>
      <p v-if="message" role="status" class="feedback">{{ message }}</p>
    </div>
    <div v-if="settings" class="settings-panel">
      <h3>连接信息</h3>
      <form id="mobile-sync-form" @submit.prevent="sync">
        <label
          >服务器地址<input
            v-model="settings.webdav.serverUrl"
            type="url"
            required
            placeholder="https://example.com"
            autocapitalize="none"
            :spellcheck="false"
            :disabled="loading"
        /></label>
        <label
          >远端目录<input
            v-model="settings.webdav.remotePath"
            required
            placeholder="/StarRailTools/"
            autocapitalize="none"
            :spellcheck="false"
            :disabled="loading"
        /></label>
        <label
          >用户名<input
            v-model="settings.webdav.username"
            autocomplete="username"
            autocapitalize="none"
            :spellcheck="false"
            :disabled="loading"
        /></label>
        <label
          >密码<input
            v-model="settings.webdav.password"
            type="password"
            autocomplete="current-password"
            :disabled="loading"
        /></label>
      </form>
    </div>
  </section>
</template>

<style scoped>
.mobile-sync-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.mobile-sync-heading h2 {
  margin: 0;
}
.mobile-sync-help-button {
  display: grid;
  flex: 0 0 44px;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: -8px -8px -8px 0;
  padding: 11px;
  border: 0;
  border-radius: 8px;
  color: #526784;
  background: transparent;
}
.mobile-sync-help-button svg {
  width: 22px;
  height: 22px;
}
.mobile-sync-help-button[aria-expanded="true"] {
  color: var(--blue);
  background: #edf4ff;
}
.mobile-sync-help-button:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: -2px;
}
</style>

<style>
.mobile-sync-help-popover.p-popover {
  width: min(300px, calc(100vw - 32px));
  border-radius: 12px;
}
.mobile-sync-help-popover .p-popover-content {
  padding: 16px;
}
.mobile-sync-help-popover p {
  margin: 0;
  color: #526784;
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
@media (prefers-reduced-motion: reduce) {
  .mobile-sync-help-popover.p-popover {
    transition: none !important;
    animation: none !important;
  }
}
</style>
