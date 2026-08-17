<script setup lang="ts">
import { onMounted, ref } from "vue";
import { syncApi } from "@/shared/api/sync";
import { mergeSyncSettings, validateSyncSettings } from "./sync-settings";
import type { SyncSettings } from "@/types";
import SyncConnectionCard from "./SyncConnectionCard.vue";
import SyncTransferCard from "./SyncTransferCard.vue";

defineProps<{ busy: boolean }>();
const emit = defineEmits<{
  busy: [value: boolean];
  error: [message: string];
  notice: [message: string];
}>();

const settings = ref<SyncSettings>(mergeSyncSettings());
const loading = ref(true);
const downloadConfirmOpen = ref(false);
const activeTransfer = ref<"upload" | "download" | null>(null);

function currentSettings(): SyncSettings {
  return mergeSyncSettings(settings.value);
}

async function run(action: () => Promise<void>, success: string, transfer?: "upload" | "download") {
  const invalid = validateSyncSettings(settings.value);
  if (invalid) return emit("error", invalid);
  activeTransfer.value = transfer ?? null;
  emit("busy", true);
  try {
    await action();
    emit("notice", success);
  } catch (cause) {
    emit("error", String(cause));
  } finally {
    activeTransfer.value = null;
    emit("busy", false);
  }
}

async function save() {
  await run(() => syncApi.saveSettings(currentSettings()), "同步设置已保存");
}

async function test() {
  await run(() => syncApi.test(currentSettings()), "连接正常，已验证服务器和认证信息");
}

async function upload() {
  await run(() => syncApi.upload(currentSettings()), "已上传当前本地数据与培养方案", "upload");
}

function requestDownload() {
  const invalid = validateSyncSettings(settings.value);
  if (invalid) return emit("error", invalid);
  downloadConfirmOpen.value = true;
}

async function download() {
  downloadConfirmOpen.value = false;
  activeTransfer.value = "download";
  emit("busy", true);
  try {
    await syncApi.download(currentSettings());
    emit("notice", "已下载并覆盖本地同步数据");
  } catch (cause) {
    emit("error", String(cause));
  } finally {
    activeTransfer.value = null;
    emit("busy", false);
  }
}

onMounted(async () => {
  try {
    settings.value = mergeSyncSettings(await syncApi.getSettings());
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
        <p>将本地录入、培养方案与毕业目标安全地收纳至你的 WebDAV、FTP 或 SFTP 空间。</p>
      </div>
      <div class="hero-status" aria-label="仅支持手动同步">
        <span class="hero-status-orbit"><i /><i /><b>↕</b></span>
        <div><small>SYNC MODE</small><strong>手动同步</strong></div>
      </div>
    </header>
    <div class="settings-console">
      <SyncConnectionCard
        v-model:settings="settings"
        :busy="busy"
        :loading="loading"
        @save="save"
        @test="test"
      />
      <SyncTransferCard
        :protocol="settings.protocol"
        :busy="busy"
        :active-transfer="activeTransfer"
        @upload="upload"
        @download="requestDownload"
      />
    </div>
    <div
      v-if="downloadConfirmOpen"
      class="download-confirm-backdrop"
      role="presentation"
      @click.self="downloadConfirmOpen = false"
    >
      <section
        class="download-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="download-confirm-title"
      >
        <p class="eyebrow">REMOTE RESTORE</p>
        <h3 id="download-confirm-title">确认下载并覆盖？</h3>
        <p>远端快照会替换当前设备中的录入数据、培养方案与毕业目标；此操作不会合并两端数据。</p>
        <div class="download-confirm-actions">
          <button type="button" class="confirm-cancel" @click="downloadConfirmOpen = false">
            取消</button
          ><button type="button" class="confirm-download" @click="download">确认下载</button>
        </div>
      </section>
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
.hero-status small {
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
.download-confirm-backdrop {
  position: fixed;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(12, 28, 52, 0.42);
  backdrop-filter: blur(4px);
}
.download-confirm {
  width: min(440px, 100%);
  padding: 28px;
  border: 1px solid rgba(199, 165, 90, 0.58);
  background: #fcfdff;
  box-shadow: 0 28px 70px rgba(8, 25, 53, 0.3);
}
.download-confirm h3 {
  margin: 10px 0 11px;
  color: var(--ink);
  font-size: 25px;
  letter-spacing: -0.045em;
}
.download-confirm > p:not(.eyebrow) {
  margin: 0;
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.75;
}
.download-confirm-actions {
  display: flex;
  justify-content: end;
  gap: 8px;
  margin-top: 24px;
}
.download-confirm-actions button {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid;
  border-radius: 3px;
  font: 700 12px/1 var(--font-ui);
  cursor: pointer;
}
.confirm-cancel {
  border-color: #8394aa !important;
  color: #344a68;
  background: #fff;
}
.confirm-download {
  border-color: #a54236 !important;
  color: #fff;
  background: #a54236;
}
.confirm-download:hover {
  background: #873229;
}
@media (max-width: 900px) {
  .settings-console {
    grid-template-columns: 1fr;
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
}
</style>
