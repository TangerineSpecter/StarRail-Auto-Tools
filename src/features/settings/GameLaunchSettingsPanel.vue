<script setup lang="ts">
import { onMounted, ref } from "vue";
import { gameLaunchApi } from "@/shared/api/game-launch";
import type { GameLaunchSettings } from "@/types";

defineProps<{ busy: boolean }>();
const emit = defineEmits<{
  busy: [value: boolean];
  error: [message: string];
  notice: [message: string];
}>();

const settings = ref<GameLaunchSettings>({ launcherPath: "" });
const detecting = ref(false);

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

async function detect() {
  detecting.value = true;
  try {
    const result = await gameLaunchApi.detectLauncher();
    if (!result.launcherPath) {
      emit("error", "未在常见安装目录找到启动器，请手动选择 launcher.exe 或 HoYoPlay.exe。");
      return;
    }
    settings.value.launcherPath = result.launcherPath;
    emit("notice", `已从${result.source ?? "本机"}找到启动器，请保存设置。`);
  } catch (cause) {
    emit("error", String(cause));
  } finally {
    detecting.value = false;
  }
}

async function choose() {
  const path = await run(() => gameLaunchApi.pickLauncher());
  if (path) settings.value.launcherPath = path;
}

async function save() {
  if (!settings.value.launcherPath.trim()) {
    emit("error", "请先自动检测或手动选择启动器 .exe 文件。");
    return;
  }
  const saved = await run(() => gameLaunchApi.saveSettings(settings.value), "游戏启动器设置已保存");
  if (saved) settings.value = saved;
}

onMounted(async () => {
  const result = await run(() => gameLaunchApi.getSettings());
  if (result) settings.value = result;
});
</script>

<template>
  <section class="settings-workspace game-launch-workspace" aria-labelledby="game-launch-title">
    <header class="settings-hero">
      <div>
        <p class="eyebrow">GAME AUTOMATION · 07</p>
        <h2 id="game-launch-title">游戏启动与采集</h2>
        <p>让 MCP 从启动器进入游戏，并在登录后的第一份背包数据到达时反馈完成。</p>
      </div>
      <div class="game-orbit" aria-hidden="true"><i /><i /><b>▶</b></div>
    </header>
    <article class="connection-card game-launch-card">
      <div class="card-heading">
        <span class="chapter-number">01</span>
        <div>
          <p class="eyebrow">LAUNCHER PATH</p>
          <h3>米哈游启动器</h3>
        </div>
      </div>
      <p class="settings-tip">
        <span>✦</span
        >自动检测只检查常见安装目录；路径可随时手动更换。不会扫描全盘，也不会读取游戏内存。
      </p>
      <label class="launcher-field"
        ><span>启动器位置</span
        ><input
          v-model="settings.launcherPath"
          :disabled="busy"
          placeholder="请选择 launcher.exe 或 HoYoPlay.exe"
      /></label>
      <div class="settings-actions">
        <button
          class="settings-button settings-button-secondary"
          type="button"
          :disabled="busy || detecting"
          @click="detect"
        >
          {{ detecting ? "正在检测…" : "自动检测" }}
        </button>
        <button
          class="settings-button settings-button-secondary"
          type="button"
          :disabled="busy"
          @click="choose"
        >
          选择文件
        </button>
        <button
          class="settings-button settings-button-primary"
          type="button"
          :disabled="busy"
          @click="save"
        >
          保存设置
        </button>
      </div>
    </article>
    <aside class="game-flow" aria-label="自动采集流程">
      <span>监听数据</span><b>→</b><span>启动器开始游戏</span><b>→</b><span>点击进入游戏</span
      ><b>→</b><span>返回采集结果</span>
    </aside>
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
.connection-card {
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
.settings-actions {
  display: flex;
  flex-wrap: wrap;
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
.settings-button:disabled {
  cursor: wait;
  opacity: 0.55;
}
.game-launch-workspace {
  --game-accent: #bc7c37;
}
.game-orbit {
  position: relative;
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(188, 124, 55, 0.45);
  border-radius: 50%;
  color: var(--game-accent);
  box-shadow: inset 0 0 24px rgba(188, 124, 55, 0.14);
}
.game-orbit b {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--game-accent);
  color: white;
  font-size: 15px;
}
.game-orbit i {
  position: absolute;
  width: 92px;
  height: 1px;
  background: rgba(188, 124, 55, 0.38);
  transform: rotate(28deg);
}
.game-orbit i:nth-child(2) {
  transform: rotate(-42deg);
}
.game-launch-card {
  max-width: 920px;
}
.launcher-field {
  display: grid;
  gap: 8px;
  margin: 20px 0;
  color: #344a68;
  font: 700 12px/1 var(--font-ui);
}
.launcher-field input {
  width: 100%;
  min-height: 40px;
  border: 1px solid rgba(41, 76, 120, 0.24);
  border-radius: 3px;
  padding: 0 12px;
  color: #243955;
  background: rgba(255, 255, 255, 0.82);
  font: 500 13px/1.4 var(--font-ui);
}
.game-flow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  width: min(100%, 920px);
  box-sizing: border-box;
  padding: 16px 20px;
  border-left: 2px solid var(--game-accent);
  color: #60718a;
  background: rgba(188, 124, 55, 0.07);
  font: 700 12px/1.4 var(--font-ui);
  letter-spacing: 0.03em;
}
.game-flow b {
  color: var(--game-accent);
  font-size: 16px;
}
@media (max-width: 680px) {
  .game-orbit {
    display: none;
  }
}
</style>
