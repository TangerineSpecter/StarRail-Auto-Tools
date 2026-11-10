<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useMobileData } from "./useMobileData";
const { settings, loading, error, download, loadSettings } = useMobileData();
const emit = defineEmits<{ synced: [] }>();
const message = ref("");
onMounted(loadSettings);
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
        <h2>数据同步站</h2>
        <p>将电脑端的 WebDAV 快照下载到手机，离线查看背包、培养进度与配队。</p>
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
