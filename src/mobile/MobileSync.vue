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
  <section class="settings-panel">
    <h2>数据同步站</h2>
    <p>下载电脑端的 WebDAV 快照，离线查看背包和培养进度。</p>
    <p v-if="error" role="alert" class="feedback error">{{ error }}</p>
    <p v-if="message" role="status" class="feedback">{{ message }}</p>
    <form v-if="settings" @submit.prevent="sync">
      <label
        >服务器地址<input
          v-model="settings.webdav.serverUrl"
          type="url"
          required
          placeholder="https://example.com" /></label
      ><label
        >远端目录<input
          v-model="settings.webdav.remotePath"
          required
          placeholder="/StarRailTools/" /></label
      ><label>用户名<input v-model="settings.webdav.username" autocomplete="username" /></label
      ><label
        >密码<input
          v-model="settings.webdav.password"
          type="password"
          autocomplete="current-password" /></label
      ><button class="primary" :disabled="loading">
        {{ loading ? "同步中…" : "下载最新数据" }}
      </button>
    </form>
  </section>
</template>
