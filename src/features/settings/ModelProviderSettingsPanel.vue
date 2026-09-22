<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { modelProviderApi } from "@/shared/api/model-provider";
import type { ModelProviderSettings } from "@/types";
import {
  DEEPSEEK_MODELS,
  SEARCH_PROVIDERS,
  maskApiKey,
  mergeModelProviderSettings,
  validateModelProviderSettings,
} from "./model-provider-settings";

defineProps<{ busy: boolean }>();
const emit = defineEmits<{
  busy: [value: boolean];
  error: [message: string];
  notice: [message: string];
}>();

const settings = ref<ModelProviderSettings>(mergeModelProviderSettings());
const loading = ref(true);
const revealKey = ref(false);
const apiKeyDisplay = computed(() =>
  revealKey.value ? settings.value.apiKey : maskApiKey(settings.value.apiKey),
);

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
  const invalid = validateModelProviderSettings(settings.value);
  if (invalid) return emit("error", invalid);
  const saved = await run(
    () => modelProviderApi.saveSettings(mergeModelProviderSettings(settings.value)),
    "DeepSeek 配置已保存在本机",
  );
  if (saved) settings.value = mergeModelProviderSettings(saved);
}

onMounted(async () => {
  const saved = await run(() => modelProviderApi.getSettings());
  if (saved) settings.value = mergeModelProviderSettings(saved);
  loading.value = false;
});
</script>

<template>
  <section class="model-settings-workspace" aria-labelledby="model-settings-title">
    <header class="settings-hero">
      <div>
        <p class="eyebrow">INTELLIGENCE · 08</p>
        <h2 id="model-settings-title">大模型配置</h2>
        <p>
          当前支持 DeepSeek 的 OpenAI
          兼容接口。配装建议会先检索公开攻略，再对照本地装备。配置仅保存在这台设备，不会写入数据同步快照。
        </p>
      </div>
      <span class="provider-badge">DEEPSEEK</span>
    </header>
    <article class="model-settings-card">
      <div class="card-heading">
        <span class="chapter-number">01</span>
        <div>
          <p class="eyebrow">PROVIDER CONNECTION</p>
          <h3>DeepSeek API</h3>
        </div>
      </div>
      <p class="settings-tip">
        <span>✦</span>请在 DeepSeek 开放平台创建 API
        Key。保存配置不会发起模型请求，也不会验证额度或连通性。
      </p>
      <div v-if="loading" class="settings-loading">正在读取大模型配置…</div>
      <form v-else class="model-settings-form" @submit.prevent="save">
        <label>
          <span>服务商</span>
          <input value="DeepSeek" readonly />
          <small>当前仅支持 DeepSeek 官方接口。</small>
        </label>
        <label>
          <span>模型</span>
          <select v-model="settings.model" :disabled="busy">
            <option v-for="item in DEEPSEEK_MODELS" :key="item.id" :value="item.id">
              {{ item.label }} · {{ item.id }}
            </option>
          </select>
          <small>{{
            DEEPSEEK_MODELS.find((item) => item.id === settings.model)?.description
          }}</small>
        </label>
        <label class="wide-field">
          <span>接口地址</span>
          <input v-model="settings.baseUrl" readonly />
          <small>官方地址，不可修改。</small>
        </label>
        <label class="wide-field">
          <span>API Key</span>
          <span class="key-row">
            <input
              v-model="settings.apiKey"
              :disabled="busy"
              :type="revealKey ? 'text' : 'password'"
              autocomplete="off"
              placeholder="sk-..."
            />
            <button
              class="settings-button settings-button-secondary"
              type="button"
              :disabled="busy"
              @click="revealKey = !revealKey"
            >
              {{ revealKey ? "隐藏" : "显示" }}
            </button>
          </span>
          <small>{{
            !revealKey && settings.apiKey
              ? `已填写：${apiKeyDisplay}`
              : "仅保存在本机，不会写入数据同步快照。"
          }}</small>
        </label>
        <label>
          <span>检索后端</span>
          <select v-model="settings.searchProvider" :disabled="busy">
            <option v-for="item in SEARCH_PROVIDERS" :key="item.id" :value="item.id">
              {{ item.label }}
            </option>
          </select>
          <small>{{
            SEARCH_PROVIDERS.find((item) => item.id === settings.searchProvider)?.description
          }}</small>
        </label>
        <label>
          <span>搜索 API Key</span>
          <input
            v-model="settings.searchApiKey"
            :disabled="busy || settings.searchProvider !== 'bocha'"
            type="password"
            autocomplete="off"
            :placeholder="settings.searchProvider === 'bocha' ? 'sk-...' : '当前后端无需填写'"
          />
          <small>{{
            settings.searchProvider === "bocha"
              ? "在博查开放平台创建并粘贴。"
              : "DuckDuckGo 无需搜索 Key，此项保持为空。"
          }}</small>
        </label>
        <div class="settings-actions">
          <button class="settings-button settings-button-primary" type="submit" :disabled="busy">
            保存配置
          </button>
        </div>
      </form>
    </article>
  </section>
</template>

<style scoped>
.model-settings-workspace {
  display: grid;
  align-content: start;
  gap: 26px;
  min-height: 0;
  padding: 24px clamp(32px, 5vw, 86px) 48px;
  overflow-y: auto;
  background:
    radial-gradient(circle at 82% 13%, rgba(65, 124, 194, 0.18), transparent 26%),
    radial-gradient(circle at 14% 88%, rgba(199, 165, 90, 0.14), transparent 28%);
}
.settings-hero {
  display: flex;
  justify-content: space-between;
  align-items: end;
  max-width: 920px;
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
.provider-badge {
  padding: 7px 10px;
  border: 1px solid rgba(36, 86, 166, 0.3);
  color: var(--blue);
  background: rgba(255, 255, 255, 0.7);
  font: 700 11px/1 var(--font-ui);
  letter-spacing: 0.1em;
}
.model-settings-card {
  width: min(100%, 920px);
  box-sizing: border-box;
  padding: 32px clamp(26px, 3vw, 46px) 35px;
  border: 1px solid rgba(42, 72, 113, 0.16);
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.93), rgba(246, 249, 253, 0.72));
  box-shadow: 0 28px 62px rgba(35, 61, 101, 0.11);
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
.model-settings-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 17px 18px;
  align-items: start;
}
.model-settings-form > label {
  display: grid;
  grid-template-rows: auto 40px minmax(2.6em, auto);
  gap: 7px;
  min-width: 0;
  color: var(--ink);
  font-size: 12px;
  font-weight: 700;
}
.model-settings-form input,
.model-settings-form select,
.model-settings-form .key-row {
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  min-height: 40px;
  min-width: 0;
}
.model-settings-form input,
.model-settings-form select {
  padding: 0 11px;
  border: 1px solid rgba(41, 76, 120, 0.2);
  border-radius: var(--control-radius);
  background: rgba(255, 255, 255, 0.72);
  color: var(--ink);
  font: 400 13px/38px var(--font-ui);
}
.model-settings-form select {
  appearance: none;
  padding-right: 32px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='none' stroke='%23344a68' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round' d='m1.2 1.6 4.8 4.8 4.8-4.8'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}
.wide-field,
.settings-actions {
  grid-column: 1 / -1;
}
.key-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
.model-settings-form small {
  color: var(--muted);
  font-weight: 400;
  line-height: 1.35;
}
.settings-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.settings-button {
  box-sizing: border-box;
  height: 40px;
  min-height: 40px;
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
.settings-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.settings-loading {
  color: var(--muted);
}
@media (max-width: 680px) {
  .model-settings-workspace {
    padding: 24px 20px 40px;
  }
  .settings-hero {
    align-items: start;
    gap: 16px;
    flex-direction: column;
  }
  .model-settings-form {
    grid-template-columns: 1fr;
  }
  .wide-field,
  .settings-actions {
    grid-column: auto;
  }
}
</style>
