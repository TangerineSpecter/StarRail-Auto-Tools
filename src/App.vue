<script setup lang="ts">
import { computed, defineAsyncComponent, provide, ref, watch, type Component } from "vue";
import { storeToRefs } from "pinia";
import Toast from "primevue/toast";
import { useToast } from "primevue/usetoast";
import AppNavigation from "@/app/AppNavigation.vue";
import { useRuntimeLifecycle } from "@/app/composables/useRuntimeLifecycle";
import type { AppView } from "@/app/navigation";
import { useRuntimeStore } from "@/app/stores/runtime";
import CapturePage from "@/pages/CapturePage.vue";
import { APP_VERSION } from "@/shared/app-info";
import { windowApi } from "@/shared/api/window";
import { runtimeContextKey } from "@/shared/contracts/runtime";

const pages: Record<AppView, Component> = {
  capture: CapturePage,
  archive: defineAsyncComponent(() => import("@/pages/InventoryPage.vue")),
  catalogue: defineAsyncComponent(() => import("@/pages/CataloguePage.vue")),
  builds: defineAsyncComponent(() => import("@/pages/BuildsPage.vue")),
  scanner: defineAsyncComponent(() => import("@/pages/ScannerPage.vue")),
  settings: defineAsyncComponent(() => import("@/pages/SettingsPage.vue")),
  about: defineAsyncComponent(() => import("@/pages/AboutPage.vue")),
};
const cachedPageNames = ["CapturePage", "InventoryPage", "CataloguePage"];

const activeView = ref<AppView>("capture");
const isMaximized = ref(false);
const runtime = useRuntimeStore();
const { direct, summary, busy, error, notice, inventoryRevision } = storeToRefs(runtime);
const toast = useToast();
provide(runtimeContextKey, { direct, summary, busy, error, notice, inventoryRevision });
const { capabilities } = useRuntimeLifecycle();
const currentPage = computed(() => pages[activeView.value]);
const directRunning = computed(() =>
  ["starting", "waitingForLogin", "connected", "syncing", "ready"].includes(direct.value.phase),
);
const phaseCode = computed(() =>
  direct.value.phase.replaceAll(/[A-Z]/g, (value) => `-${value.toLowerCase()}`),
);
const phaseLabel = computed(
  () =>
    ({
      unsupported: "当前平台不可用",
      starting: "正在启动",
      waitingForLogin: "等待登录",
      connected: "已连接",
      syncing: "同步中",
      ready: "实时监听",
      stopped: "已停止",
      error: "需要处理",
    })[direct.value.phase] satisfies string,
);

function showFeedback(message: string, severity: "success" | "error") {
  toast.removeGroup("app-feedback");
  toast.add({
    group: "app-feedback",
    severity,
    summary:
      severity === "error" ? "操作失败" : message.startsWith("正在") ? "正在处理…" : "操作完成",
    detail: message,
    life: severity === "error" ? 6000 : 3200,
    closable: false,
  });
}

watch(notice, (message) => {
  if (!message) return;
  showFeedback(message, "success");
  notice.value = "";
});

watch(error, (message) => {
  if (!message) return;
  showFeedback(message, "error");
  error.value = "";
});

async function toggleMaximize() {
  if (isMaximized.value) await windowApi.unmaximize();
  else await windowApi.maximize();
  isMaximized.value = !isMaximized.value;
}
</script>

<template>
  <div class="app-stage">
    <div class="orbit orbit-one" />
    <div class="orbit orbit-two" />
    <main class="app-shell">
      <div class="shell-header" data-tauri-drag-region="deep">
        <header class="topbar">
          <div class="brand">
            <img src="/logo/android-chrome-192x192.png" alt="Logo" class="brand-logo" />
            <div>
              <p class="eyebrow">STARRAIL · AUTO TOOLS</p>
              <h1>星穹数据航站</h1>
            </div>
          </div>
          <div class="window-controls">
            <button class="win-btn minimize" title="最小化" @click="windowApi.minimize()">
              <svg viewBox="0 0 10 10" width="10" height="10">
                <rect y="4.5" width="10" height="1" fill="currentColor" />
              </svg></button
            ><button
              class="win-btn maximize"
              :title="isMaximized ? '还原' : '最大化'"
              @click="toggleMaximize"
            >
              <svg v-if="!isMaximized" viewBox="0 0 10 10" width="10" height="10">
                <rect x=".5" y=".5" width="9" height="9" fill="none" stroke="currentColor" /></svg
              ><svg v-else viewBox="0 0 10 10" width="10" height="10">
                <rect x="2" y=".5" width="7.5" height="7.5" fill="none" stroke="currentColor" />
                <rect x=".5" y="2" width="7.5" height="7.5" fill="none" stroke="currentColor" />
              </svg></button
            ><button class="win-btn close" title="关闭" @click="windowApi.close()">
              <svg viewBox="0 0 10 10" width="10" height="10">
                <line x1=".5" y1=".5" x2="9.5" y2="9.5" stroke="currentColor" />
                <line x1="9.5" y1=".5" x2=".5" y2="9.5" stroke="currentColor" />
              </svg>
            </button>
          </div>
        </header>
      </div>
      <AppNavigation v-model:active-view="activeView" :summary="summary" />
      <KeepAlive :include="cachedPageNames">
        <component :is="currentPage" :key="activeView" />
      </KeepAlive>
      <footer class="app-footer">
        <div class="footer-brand">
          <span>StarRail-Auto-Tools</span><span class="app-version">v{{ APP_VERSION }}</span>
        </div>
        <div class="footer-meta">
          <span class="platform-label">{{ capabilities?.platform ?? "SYSTEM" }}</span>
          <div :class="['runtime-pill', `tone-${phaseCode}`]">
            <span :class="['status-dot', { active: directRunning }]" />{{ phaseLabel }}
          </div>
        </div>
      </footer>
    </main>
    <Toast group="app-feedback" position="top-center" class="app-feedback-toast">
      <template #message="{ message }">
        <div :class="['app-feedback-content', `tone-${message.severity}`]">
          <strong>{{ message.summary }}</strong>
          <p>{{ message.detail }}</p>
        </div>
      </template>
    </Toast>
  </div>
</template>

<style scoped src="./app/app-shell-layout.css"></style>
