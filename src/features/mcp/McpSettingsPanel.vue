<script setup lang="ts">
import InputNumber from "primevue/inputnumber";
import { computed, onMounted, ref } from "vue";
import { mcpApi } from "@/shared/api/mcp";
import {
  clientConfig,
  emptyMcpStatus,
  maskToken,
  MCP_BIND_HOST,
  MCP_CLIENTS,
  mergeMcpSettings,
  statusHeadline,
  validateMcpSettings,
  type McpClientId,
} from "./mcp-settings";
import type { McpSettings, McpStatus } from "@/types";

defineProps<{ busy: boolean }>();
const emit = defineEmits<{
  busy: [value: boolean];
  error: [message: string];
  notice: [message: string];
}>();

const settings = ref<McpSettings>(mergeMcpSettings());
const status = ref<McpStatus>(emptyMcpStatus());
const loading = ref(true);
const client = ref<McpClientId>("grok");

const endpoint = computed(() => status.value.endpoint);
const snippet = computed(() => clientConfig(client.value, endpoint.value, settings.value.token));
const headline = computed(() => statusHeadline(status.value));

async function refreshStatus() {
  status.value = await mcpApi.getStatus();
}

async function run<T>(action: () => Promise<T>, success?: string): Promise<T | undefined> {
  emit("busy", true);
  try {
    const result = await action();
    if (success) emit("notice", success);
    return result;
  } catch (cause) {
    emit("error", String(cause));
    return undefined;
  } finally {
    emit("busy", false);
  }
}

async function save() {
  const invalid = validateMcpSettings(settings.value);
  if (invalid) return emit("error", invalid);
  const saved = await run(async () => {
    const next = await mcpApi.saveSettings(mergeMcpSettings(settings.value));
    settings.value = mergeMcpSettings(next);
    await refreshStatus();
    return next;
  });
  if (!saved) return;
  if (status.value.lastError) {
    emit("error", status.value.lastError);
    return;
  }
  emit(
    "notice",
    settings.value.enabled ? "MCP 设置已保存，服务状态已更新" : "MCP 设置已保存，服务已停止",
  );
}

async function regenerate() {
  await run(async () => {
    const next = await mcpApi.regenerateToken();
    settings.value = mergeMcpSettings(next);
    await refreshStatus();
    return next;
  }, "已重新生成访问令牌");
}

async function copyText(value: string, success: string) {
  try {
    await navigator.clipboard.writeText(value);
    emit("notice", success);
  } catch (cause) {
    emit("error", String(cause));
  }
}

defineExpose({ settings });

onMounted(async () => {
  try {
    settings.value = mergeMcpSettings(await mcpApi.getSettings());
    await refreshStatus();
  } catch (cause) {
    emit("error", String(cause));
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="settings-workspace" aria-labelledby="mcp-settings-title">
    <header class="settings-hero">
      <div>
        <p class="eyebrow">SOFTWARE SETTINGS · 06</p>
        <h2 id="mcp-settings-title">MCP 管理</h2>
        <p>在本机开放 Streamable HTTP 端点，让 Grok、Claude 或 TraeWork 调用同步站的上传与下载。</p>
      </div>
      <div class="hero-status" :data-state="headline" aria-label="MCP 服务状态">
        <span class="hero-status-orbit"
          ><i /><i /><b>{{ status.running ? "●" : "○" }}</b></span
        >
        <div>
          <small>MCP SERVER</small>
          <strong>{{ headline }}</strong>
        </div>
      </div>
    </header>
    <div class="settings-console">
      <article class="connection-card">
        <div class="card-heading">
          <span class="chapter-number">01</span>
          <div>
            <p class="eyebrow">LOCAL ENDPOINT</p>
            <h3>服务配置</h3>
          </div>
          <span class="draft-chip">{{ status.running ? "监听中" : "本机保存" }}</span>
        </div>
        <p class="settings-tip">
          <span>✦</span>
          默认关闭。启用后仅绑定 127.0.0.1，并要求 Bearer Token。软件需保持运行，客户端才能连上。
        </p>
        <div v-if="loading" class="settings-loading">正在读取 MCP 设置…</div>
        <form v-else class="settings-form" @submit.prevent="save">
          <div class="protocol-switch" role="radiogroup" aria-label="启用 MCP 服务">
            <button
              type="button"
              class="protocol-chip"
              :class="{ active: !settings.enabled }"
              :disabled="busy"
              :aria-pressed="!settings.enabled"
              @click="settings.enabled = false"
            >
              关闭
            </button>
            <button
              type="button"
              class="protocol-chip"
              :class="{ active: settings.enabled }"
              :disabled="busy"
              :aria-pressed="settings.enabled"
              @click="settings.enabled = true"
            >
              启用
            </button>
          </div>
          <label
            ><span>绑定地址</span><input class="readonly-field" :value="MCP_BIND_HOST" readonly
          /></label>
          <label
            ><span>端口</span
            ><InputNumber
              v-model="settings.port"
              :min="1024"
              :max="65535"
              :use-grouping="false"
              show-buttons
          /></label>
          <label class="token-field"
            ><span>访问令牌</span
            ><span class="token-row"
              ><input class="readonly-field" :value="maskToken(settings.token)" readonly /><button
                class="settings-button settings-button-secondary"
                type="button"
                :disabled="busy || !settings.token"
                @click="copyText(settings.token, '访问令牌已复制')"
              >
                复制</button
              ><button
                class="settings-button settings-button-secondary"
                type="button"
                :disabled="busy"
                @click="regenerate"
              >
                重新生成
              </button></span
            ></label
          >
          <p v-if="status.lastError" class="status-error">{{ status.lastError }}</p>
          <div class="settings-actions">
            <button class="settings-button settings-button-primary" type="submit" :disabled="busy">
              保存并应用
            </button>
            <button
              class="settings-button settings-button-secondary"
              type="button"
              :disabled="busy"
              @click="copyText(endpoint, '服务地址已复制')"
            >
              复制地址
            </button>
          </div>
        </form>
      </article>
      <aside class="transfer-card">
        <div class="transfer-top">
          <p class="eyebrow">TOOLS &amp; CLIENTS</p>
          <span>02</span>
        </div>
        <h3>工具与接入</h3>
        <p>这两个工具复用「数据同步站」里已保存的连接，不会改同步格式。</p>
        <ul class="tool-list">
          <li v-for="tool in status.tools" :key="tool.name">
            <b>{{ tool.title }}</b>
            <code>{{ tool.name }}</code>
            <small>{{ tool.description }}</small>
            <em v-if="tool.destructive">覆盖本地</em>
          </li>
        </ul>
        <div class="protocol-switch client-switch" role="tablist" aria-label="客户端配置">
          <button
            v-for="item in MCP_CLIENTS"
            :key="item.id"
            type="button"
            class="protocol-chip"
            :class="{ active: client === item.id }"
            :aria-selected="client === item.id"
            @click="client = item.id"
          >
            {{ item.label }}
          </button>
        </div>
        <pre class="config-snippet">{{ snippet }}</pre>
        <button class="copy-snippet" type="button" @click="copyText(snippet, '客户端配置已复制')">
          复制当前配置
        </button>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.settings-workspace {
  position: relative;
  display: grid;
  align-content: start;
  gap: 26px;
  min-height: 0;
  padding: 24px clamp(32px, 5vw, 86px) 48px;
  overflow: auto;
  isolation: isolate;
  background:
    radial-gradient(circle at 79% 15%, rgba(199, 165, 90, 0.18), transparent 25%),
    radial-gradient(circle at 18% 93%, rgba(69, 174, 183, 0.12), transparent 27%);
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
  color: var(--ink-soft);
  background: rgba(250, 248, 241, 0.72);
  font-size: 12px;
  line-height: 1.65;
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
.token-field,
.status-error,
.settings-actions,
.protocol-switch {
  grid-column: 1 / -1;
}
.protocol-switch {
  display: flex;
  gap: 8px;
}
.protocol-chip {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(41, 76, 120, 0.2);
  border-radius: 3px;
  color: #344a68;
  background: #fff;
  font: 700 12px/1 var(--font-ui);
}
.protocol-chip.active {
  border-color: #173d7a;
  color: #fff;
  background: #173d7a;
}
.readonly-field,
.settings-form :deep(.p-inputnumber) {
  width: 100%;
}
.readonly-field,
.settings-form :deep(.p-inputnumber-input) {
  height: 40px;
  padding: 0 11px;
  border: 1px solid rgba(41, 76, 120, 0.2);
  border-radius: var(--control-radius);
  background: rgba(255, 255, 255, 0.72);
  color: var(--ink);
}
.token-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
}
.settings-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.settings-button {
  min-height: 38px;
  padding: 0 15px;
  border: 1px solid transparent;
  border-radius: 3px;
  font: 700 12px/1 var(--font-ui);
  cursor: pointer;
}
.settings-button-primary {
  border-color: #173d7a;
  color: #fff;
  background: #173d7a;
}
.settings-button-secondary {
  border-color: #6c7f99;
  color: #233954;
  background: #fff;
}
.settings-loading,
.status-error {
  color: var(--muted);
}
.status-error {
  margin: 0;
  color: #a54236;
  font-size: 12px;
}
.transfer-card {
  position: relative;
  overflow: hidden;
  padding: 31px 28px;
  background: linear-gradient(160deg, #183c76, #214e91 58%, #2b67a9);
  color: #fff;
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
  font:
    700 19px/1 Bahnschrift,
    sans-serif;
  letter-spacing: 0.16em;
}
.transfer-card h3 {
  margin: 18px 0 0;
  color: #fff;
  font-size: 23px;
}
.transfer-card > p {
  margin: 9px 0 18px;
  color: rgba(235, 243, 255, 0.75);
  font-size: 13px;
  line-height: 1.65;
}
.tool-list {
  margin: 0 0 18px;
  padding: 0;
  list-style: none;
}
.tool-list li {
  position: relative;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.17);
}
.tool-list b,
.tool-list small,
.tool-list code {
  display: block;
}
.tool-list code {
  margin: 4px 0 5px;
  color: #f1d88d;
  font-size: 11px;
}
.tool-list small {
  color: #c4daf7;
  font-size: 11px;
  line-height: 1.55;
  font-weight: 500;
}
.tool-list em {
  position: absolute;
  top: 12px;
  right: 0;
  color: #f1d88d;
  font-size: 10px;
  font-style: normal;
}
.client-switch .protocol-chip {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.28);
  color: #d7e7ff;
}
.client-switch .protocol-chip.active {
  background: #fff;
  border-color: #fff;
  color: #173d7a;
}
.config-snippet {
  overflow: auto;
  margin: 14px 0 12px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(8, 24, 52, 0.35);
  color: #e8f1ff;
  font:
    12px/1.55 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  white-space: pre-wrap;
}
.copy-snippet {
  width: 100%;
  min-height: 36px;
  border: 1px solid rgba(255, 255, 255, 0.45);
  color: #fff;
  background: transparent;
  font: 700 12px/1 var(--font-ui);
}
.settings-loading {
  padding: 18px 0;
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
    padding: 18px 20px 27px;
  }
  .settings-hero,
  .settings-form,
  .token-row {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
