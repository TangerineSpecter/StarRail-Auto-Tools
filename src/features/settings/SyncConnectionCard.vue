<script setup lang="ts">
import Checkbox from "primevue/checkbox";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Password from "primevue/password";
import { SYNC_PROTOCOLS } from "./sync-settings";
import type { SyncSettings } from "@/types";

const settings = defineModel<SyncSettings>("settings", { required: true });
defineProps<{
  busy: boolean;
  loading: boolean;
}>();
defineEmits<{
  save: [];
  test: [];
}>();
</script>

<template>
  <article class="connection-card">
    <div class="card-heading">
      <span class="chapter-number">01</span>
      <div>
        <p class="eyebrow">REMOTE CONNECTION</p>
        <h3>连接配置</h3>
      </div>
      <span class="draft-chip">本机保存</span>
    </div>
    <p class="settings-tip">
      <span>✦</span> 连接信息仅保存在本机应用数据目录。此目录内的同步文件由应用自动管理。
    </p>
    <div v-if="loading" class="settings-loading">正在读取同步设置…</div>
    <form v-else class="settings-form" @submit.prevent="$emit('save')">
      <div class="protocol-switch" role="radiogroup" aria-label="同步协议">
        <button
          v-for="item in SYNC_PROTOCOLS"
          :key="item.id"
          type="button"
          class="protocol-chip"
          :class="{ active: settings.protocol === item.id }"
          :disabled="busy"
          :aria-pressed="settings.protocol === item.id"
          @click="settings.protocol = item.id"
        >
          {{ item.label }}
        </button>
      </div>
      <template v-if="settings.protocol === 'webdav'">
        <label
          ><span>服务器地址</span
          ><InputText v-model="settings.webdav.serverUrl" placeholder="https://dav.example.com/"
        /></label>
        <label
          ><span>远端同步目录</span
          ><InputText v-model="settings.webdav.remotePath" placeholder="/StarRailTools/"
        /></label>
        <label
          ><span>用户名</span><InputText v-model="settings.webdav.username" autocomplete="username"
        /></label>
        <label
          ><span>密码</span
          ><Password
            v-model="settings.webdav.password"
            :feedback="false"
            toggle-mask
            autocomplete="current-password"
        /></label>
      </template>
      <template v-else-if="settings.protocol === 'ftp'">
        <label
          ><span>主机</span><InputText v-model="settings.ftp.host" placeholder="ftp.example.com"
        /></label>
        <label
          ><span>端口</span
          ><InputNumber
            v-model="settings.ftp.port"
            :min="1"
            :max="65535"
            :use-grouping="false"
            show-buttons
        /></label>
        <label
          ><span>远端同步目录</span
          ><InputText v-model="settings.ftp.remotePath" placeholder="/StarRailTools"
        /></label>
        <label
          ><span>用户名</span><InputText v-model="settings.ftp.username" autocomplete="username"
        /></label>
        <label
          ><span>密码</span
          ><Password
            v-model="settings.ftp.password"
            :feedback="false"
            toggle-mask
            autocomplete="current-password"
        /></label>
        <label class="checkbox-field"
          ><span>使用 FTPS (TLS)</span
          ><span class="checkbox-control"
            ><Checkbox v-model="settings.ftp.secure" binary input-id="ftp-secure" /><small
              >显式 AUTH TLS，加密但不校验证书（自签 NAS 常用）</small
            ></span
          ></label
        >
      </template>
      <template v-else>
        <label
          ><span>主机</span><InputText v-model="settings.sftp.host" placeholder="sftp.example.com"
        /></label>
        <label
          ><span>端口</span
          ><InputNumber
            v-model="settings.sftp.port"
            :min="1"
            :max="65535"
            :use-grouping="false"
            show-buttons
        /></label>
        <label
          ><span>远端同步目录</span
          ><InputText v-model="settings.sftp.remotePath" placeholder="/StarRailTools"
        /></label>
        <label
          ><span>用户名</span><InputText v-model="settings.sftp.username" autocomplete="username"
        /></label>
        <label class="optional-field"
          ><span>密码 / 私钥口令（可选）</span
          ><Password
            v-model="settings.sftp.password"
            :feedback="false"
            toggle-mask
            autocomplete="current-password"
        /></label>
        <label class="optional-field"
          ><span>私钥路径（可选）</span
          ><InputText
            v-model="settings.sftp.privateKeyPath"
            placeholder="/Users/you/.ssh/id_ed25519"
        /></label>
      </template>
      <div class="settings-actions">
        <button class="settings-button settings-button-primary" type="submit" :disabled="busy">
          保存连接</button
        ><button
          class="settings-button settings-button-secondary"
          type="button"
          :disabled="busy"
          @click="$emit('test')"
        >
          测试连接
        </button>
      </div>
    </form>
  </article>
</template>

<style scoped>
.connection-card {
  padding: 32px clamp(26px, 3vw, 46px) 35px;
  border-right: 1px solid var(--line);
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.93), rgba(246, 249, 253, 0.72));
}
.card-heading {
  display: flex;
  gap: 13px;
  align-items: center;
}
.chapter-number {
  color: var(--gold);
  font:
    700 34px/0.9 Bahnschrift,
    sans-serif;
  letter-spacing: -0.08em;
}
.card-heading h3 {
  margin: 4px 0 0;
  color: var(--ink);
  font-size: 23px;
  letter-spacing: -0.035em;
}
.draft-chip {
  margin-left: auto;
  padding: 5px 8px;
  border: 1px solid rgba(36, 86, 166, 0.22);
  color: var(--blue);
  font: 700 10px/1 var(--font-ui);
  letter-spacing: 0.08em;
}
.settings-tip {
  display: flex;
  gap: 8px;
  margin: 24px 0;
  padding: 12px 13px;
  border-left: 2px solid var(--gold);
  border-top: 1px solid rgba(199, 165, 90, 0.12);
  border-bottom: 1px solid rgba(199, 165, 90, 0.12);
  color: var(--ink-soft);
  background: rgba(250, 248, 241, 0.72);
  font-size: 12px;
  line-height: 1.65;
}
.settings-tip span {
  color: var(--gold);
}
.protocol-switch {
  display: flex;
  gap: 8px;
  grid-column: 1/-1;
}
.protocol-chip {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(41, 76, 120, 0.2);
  border-radius: 3px;
  color: #344a68;
  background: #fff;
  font: 700 12px/1 var(--font-ui);
  letter-spacing: 0.04em;
  cursor: pointer;
}
.protocol-chip.active {
  border-color: #173d7a;
  color: #fff;
  background: #173d7a;
}
.protocol-chip:disabled {
  cursor: wait;
  opacity: 0.55;
}
.settings-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 17px 18px;
}
.settings-form label {
  display: grid;
  gap: 7px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 700;
}
.settings-form label span {
  display: flex;
  justify-content: space-between;
}
.settings-form label:not(.checkbox-field, .optional-field) span::after {
  color: var(--gold);
  content: "✦";
  font-size: 8px;
}
.settings-form :deep(.p-inputtext),
.settings-form :deep(.p-inputnumber),
.settings-form :deep(.p-password) {
  width: 100%;
}
.settings-form :deep(.p-inputtext),
.settings-form :deep(.p-inputnumber-input) {
  height: 40px;
  border-color: rgba(41, 76, 120, 0.2);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: none;
}
.settings-form :deep(.p-inputtext:focus),
.settings-form :deep(.p-inputnumber-input:focus) {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px rgba(36, 86, 166, 0.09);
}
.checkbox-field .checkbox-control {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
}
.checkbox-field small {
  color: var(--ink-soft);
  font-size: 11px;
  font-weight: 500;
}
.settings-actions {
  display: flex;
  gap: 8px;
  grid-column: 1/-1;
  margin-top: 8px;
}
.settings-button {
  min-height: 38px;
  padding: 0 15px;
  border: 1px solid transparent;
  border-radius: 3px;
  color: var(--ink);
  background: #fff;
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition:
    color 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease,
    transform 0.16s ease;
}
.settings-button:hover:not(:disabled) {
  transform: translateY(-1px);
}
.settings-button:focus-visible {
  outline: 2px solid rgba(36, 86, 166, 0.45);
  outline-offset: 2px;
}
.settings-button:disabled {
  cursor: wait;
  opacity: 0.55;
}
.settings-button-primary {
  border-color: #173d7a;
  color: #fff;
  background: #173d7a;
}
.settings-button-primary:hover:not(:disabled) {
  border-color: #102e60;
  background: #102e60;
}
.settings-button-secondary {
  border-color: #6c7f99;
  color: #233954;
  background: #fff;
}
.settings-button-secondary:hover:not(:disabled) {
  border-color: #2456a6;
  color: #173d7a;
  background: #edf4ff;
}
.settings-loading {
  color: var(--muted);
  padding: 18px 0;
}
@media (max-width: 900px) {
  .connection-card {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
}
@media (max-width: 680px) {
  .connection-card {
    padding: 25px 20px;
  }
  .settings-form {
    grid-template-columns: 1fr;
  }
}
</style>
