<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import InputText from "primevue/inputtext";
import Password from "primevue/password";
import { webDavApi } from "@/shared/api/webdav";
import type { WebDavSettings } from "@/types";

defineProps<{ busy: boolean }>();
const emit = defineEmits<{
  busy: [value: boolean];
  error: [message: string];
  notice: [message: string];
}>();
const settings = reactive<WebDavSettings>({
  serverUrl: "",
  remotePath: "",
  username: "",
  password: "",
});
const loading = ref(true);

function copy(value: WebDavSettings) {
  Object.assign(settings, value);
}
function validate() {
  if (
    !settings.serverUrl.trim() ||
    !settings.remotePath.trim() ||
    !settings.username.trim() ||
    !settings.password
  )
    return "请完整填写服务器地址、远端文件、用户名和密码。";
  if (!settings.remotePath.startsWith("/")) return "远端文件路径必须以 / 开头。";
  return "";
}
async function run(action: () => Promise<void>, success: string) {
  const invalid = validate();
  if (invalid) return emit("error", invalid);
  emit("busy", true);
  try {
    await action();
    emit("notice", success);
  } catch (cause) {
    emit("error", String(cause));
  } finally {
    emit("busy", false);
  }
}
async function save() {
  await run(() => webDavApi.saveSettings({ ...settings }), "WebDAV 设置已保存");
}
async function test() {
  await run(() => webDavApi.test({ ...settings }), "连接正常，已验证服务器和认证信息");
}
async function upload() {
  await run(() => webDavApi.upload({ ...settings }), "已上传当前本地数据与培养方案");
}
async function download() {
  const invalid = validate();
  if (invalid) return emit("error", invalid);
  if (!window.confirm("下载将以远端完整快照覆盖本地录入数据、培养方案和毕业目标。是否继续？"))
    return;
  emit("busy", true);
  try {
    await webDavApi.download({ ...settings });
    emit("notice", "已下载并覆盖本地同步数据");
  } catch (cause) {
    emit("error", String(cause));
  } finally {
    emit("busy", false);
  }
}
onMounted(async () => {
  try {
    copy(await webDavApi.getSettings());
  } catch (cause) {
    emit("error", String(cause));
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="settings-workspace" aria-labelledby="settings-title">
    <header class="settings-hero">
      <div>
        <p class="eyebrow">SOFTWARE SETTINGS · 06</p>
        <h2 id="settings-title">数据同步站</h2>
        <p>将本地录入、培养方案与毕业目标安全地收纳至你的 WebDAV 空间。</p>
      </div>
      <div class="hero-status" aria-label="仅支持手动同步">
        <span class="hero-status-orbit"><i /><i /><b>↕</b></span>
        <div><small>SYNC MODE</small><strong>手动同步</strong></div>
      </div>
    </header>
    <div class="settings-console">
      <article class="connection-card">
        <div class="card-heading">
          <span class="chapter-number">01</span>
          <div>
            <p class="eyebrow">WEBDAV CONNECTION</p>
            <h3>连接配置</h3>
          </div>
          <span class="draft-chip">本机保存</span>
        </div>
        <p class="settings-tip">
          <span>✦</span> 连接信息仅保存在本机应用数据目录，不会上传或写入同步文件。
        </p>
        <div v-if="loading" class="settings-loading">正在读取 WebDAV 设置…</div>
        <form v-else class="settings-form" @submit.prevent="save">
          <label
            ><span>服务器地址</span
            ><InputText v-model="settings.serverUrl" placeholder="https://dav.example.com/"
          /></label>
          <label
            ><span>远端文件路径</span
            ><InputText v-model="settings.remotePath" placeholder="/StarRail-Auto-Tools/sync.json"
          /></label>
          <label
            ><span>用户名</span><InputText v-model="settings.username" autocomplete="username"
          /></label>
          <label
            ><span>密码</span
            ><Password
              v-model="settings.password"
              :feedback="false"
              toggle-mask
              autocomplete="current-password"
          /></label>
          <div class="settings-actions">
            <button class="settings-button settings-button-primary" type="submit" :disabled="busy">
              保存连接</button
            ><button
              class="settings-button settings-button-secondary"
              type="button"
              :disabled="busy"
              @click="test"
            >
              测试连接
            </button>
          </div>
        </form>
      </article>

      <aside class="transfer-card">
        <div class="transfer-top">
          <p class="eyebrow">MANUAL TRANSFER</p>
          <span>02</span>
        </div>
        <h3>同步控制台</h3>
        <p>每次操作都会生成或读取一份完整的版本化数据快照。</p>
        <div class="transfer-route"><span>本地数据</span><i>⇄</i><span>你的 WebDAV</span></div>
        <button class="transfer-action upload" type="button" :disabled="busy" @click="upload">
          <span class="transfer-icon">↑</span
          ><span><b>上传本地数据</b><small>备份当前录入与培养方案</small></span
          ><em>→</em>
        </button>
        <button class="transfer-action download" type="button" :disabled="busy" @click="download">
          <span class="transfer-icon">↓</span
          ><span><b>下载远端快照</b><small>确认后完整覆盖本地数据</small></span
          ><em>→</em>
        </button>
        <div class="overwrite-note">
          <span>!</span>
          <p>下载不是合并操作。远端数据会替换当前本地的录入、培养方案与毕业目标。</p>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.settings-workspace {
  position: relative;
  display: grid;
  align-content: center;
  gap: 26px;
  min-height: 0;
  padding: 38px clamp(32px, 5vw, 86px) 48px;
  overflow: auto;
  isolation: isolate;
  background:
    radial-gradient(circle at 79% 15%, rgba(199, 165, 90, 0.18), transparent 25%),
    radial-gradient(circle at 18% 93%, rgba(69, 174, 183, 0.12), transparent 27%);
}
.settings-workspace::before {
  position: absolute;
  z-index: -1;
  top: -210px;
  right: 7%;
  width: 500px;
  height: 500px;
  border: 1px solid rgba(43, 86, 146, 0.11);
  border-radius: 50%;
  box-shadow:
    0 0 0 46px rgba(43, 86, 146, 0.035),
    0 0 0 118px rgba(43, 86, 146, 0.025);
  content: "";
}
.settings-hero {
  display: flex;
  justify-content: space-between;
  align-items: end;
  max-width: 1280px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--line);
}
.settings-hero h2 {
  margin: 9px 0 5px;
  color: var(--ink);
  font-size: clamp(38px, 4vw, 56px);
  line-height: 1;
  letter-spacing: -0.065em;
}
.settings-hero > div > p:last-child {
  margin: 0;
  color: var(--ink-soft);
  font-size: 15px;
}
.hero-status {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 14px;
  border: 1px solid rgba(199, 165, 90, 0.36);
  background: rgba(255, 253, 247, 0.65);
}
.hero-status small,
.transfer-top span {
  display: block;
  color: var(--muted);
  font:
    700 9px/1 Bahnschrift,
    sans-serif;
  letter-spacing: 0.16em;
}
.hero-status strong {
  display: block;
  margin-top: 4px;
  color: var(--ink);
  font-size: 14px;
}
.hero-status-orbit {
  position: relative;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--gold);
  border-radius: 50%;
  color: var(--gold);
}
.hero-status-orbit::before,
.hero-status-orbit::after {
  position: absolute;
  border: 1px solid rgba(199, 165, 90, 0.55);
  border-radius: 50%;
  content: "";
}
.hero-status-orbit::before {
  width: 44px;
  height: 15px;
  transform: rotate(-28deg);
}
.hero-status-orbit::after {
  width: 15px;
  height: 44px;
  transform: rotate(28deg);
}
.hero-status-orbit b {
  font-size: 16px;
  line-height: 1;
}
.hero-status-orbit i {
  position: absolute;
  width: 4px;
  height: 4px;
  background: var(--gold);
  transform: rotate(45deg);
}
.settings-console {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(310px, 0.72fr);
  max-width: 1280px;
  border: 1px solid rgba(42, 72, 113, 0.16);
  background: rgba(253, 254, 255, 0.66);
  box-shadow: 0 28px 62px rgba(35, 61, 101, 0.11);
}
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
.card-heading h3,
.transfer-card h3 {
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
.settings-form label span::after {
  color: var(--gold);
  content: "✦";
  font-size: 8px;
}
.settings-form :deep(.p-inputtext) {
  height: 40px;
  border-color: rgba(41, 76, 120, 0.2);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: none;
}
.settings-form :deep(.p-inputtext:focus) {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px rgba(36, 86, 166, 0.09);
}
.settings-form :deep(.p-inputtext),
.settings-form :deep(.p-password) {
  width: 100%;
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
.transfer-card {
  position: relative;
  overflow: hidden;
  padding: 31px 28px;
  background: linear-gradient(160deg, #183c76, #214e91 58%, #2b67a9);
  color: #fff;
}
.transfer-card::after {
  position: absolute;
  right: -100px;
  bottom: -135px;
  width: 320px;
  height: 320px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 50%;
  box-shadow:
    0 0 0 35px rgba(255, 255, 255, 0.04),
    0 0 0 89px rgba(255, 255, 255, 0.03);
  content: "";
}
.transfer-card > * {
  position: relative;
  z-index: 1;
}
.transfer-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.transfer-top .eyebrow {
  color: #b8d7ff;
}
.transfer-top span {
  color: #e5c77d;
  font-size: 19px;
}
.transfer-card h3 {
  color: #fff;
  margin-top: 18px;
}
.transfer-card > p {
  margin: 9px 0 22px;
  color: rgba(235, 243, 255, 0.75);
  font-size: 13px;
  line-height: 1.65;
}
.transfer-route {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0 17px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.18);
  color: #c9e0fd;
  font-size: 11px;
  font-weight: 700;
}
.transfer-route i {
  color: #e7c979;
  font-style: normal;
  font-size: 19px;
}
.transfer-action {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 15px 0;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.17);
  color: #fff;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background 0.18s ease;
}
.transfer-action:hover:not(:disabled) {
  padding-right: 8px;
  background: rgba(255, 255, 255, 0.06);
  transform: translateX(3px);
}
.transfer-action:disabled {
  opacity: 0.5;
  cursor: wait;
}
.transfer-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.45);
  color: #f1d88d;
  font:
    700 18px/1 Bahnschrift,
    sans-serif;
}
.transfer-action b,
.transfer-action small {
  display: block;
}
.transfer-action b {
  font-size: 13px;
}
.transfer-action small {
  margin-top: 3px;
  color: #c4daf7;
  font-size: 10px;
}
.transfer-action em {
  margin-left: auto;
  color: #f1d88d;
  font-size: 18px;
  font-style: normal;
}
.overwrite-note {
  display: flex;
  gap: 8px;
  margin-top: 19px;
  color: #c5d9f4;
  font-size: 10px;
  line-height: 1.6;
}
.overwrite-note span {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 15px;
  height: 15px;
  margin-top: 1px;
  border: 1px solid #e9c875;
  border-radius: 50%;
  color: #e9c875;
  font-size: 10px;
  font-weight: 700;
}
.overwrite-note p {
  margin: 0;
}
@media (max-width: 900px) {
  .settings-console {
    grid-template-columns: 1fr;
  }
  .connection-card {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
}
@media (max-width: 680px) {
  .settings-workspace {
    padding: 27px 20px;
  }
  .settings-hero {
    align-items: start;
    gap: 20px;
    flex-direction: column;
  }
  .hero-status {
    align-self: stretch;
  }
  .settings-console {
    display: block;
  }
  .connection-card,
  .transfer-card {
    padding: 25px 20px;
  }
  .settings-form {
    grid-template-columns: 1fr;
  }
}
</style>
