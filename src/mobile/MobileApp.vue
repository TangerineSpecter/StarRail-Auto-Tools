<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, provide, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRuntimeStore } from "@/app/stores/runtime";
import { runtimeContextKey } from "@/shared/contracts/runtime";
import { readOnlyViewKey } from "@/shared/contracts/view-mode";
import { inventoryApi } from "@/shared/api/inventory";
import { initDevicePostureWatcher } from "./device-posture";
import MobileInventoryPage from "@/pages/MobileInventoryPage.vue";
import MobileSync from "./MobileSync.vue";
import MobileTeams from "./MobileTeams.vue";
const CataloguePage = defineAsyncComponent(() => import("@/pages/CataloguePage.vue"));
const BuildDashboard = defineAsyncComponent(
  () => import("@/features/build-planner/BuildDashboard.vue"),
);
const runtime = useRuntimeStore();
const refs = storeToRefs(runtime);
provide(runtimeContextKey, refs);
provide(readOnlyViewKey, true);
const tab = ref("inventory");
const tabs = [
  { id: "inventory", name: "背包" },
  { id: "catalogue", name: "图鉴" },
  { id: "build", name: "毕业" },
  { id: "team", name: "配队" },
  { id: "settings", name: "同步" },
];
const pages = {
  inventory: MobileInventoryPage,
  catalogue: CataloguePage,
  build: BuildDashboard,
  team: MobileTeams,
  settings: MobileSync,
};
const currentPage = computed(() => pages[tab.value as keyof typeof pages]);
async function synced() {
  try {
    runtime.summary = await inventoryApi.summary();
    runtime.markInventoryChanged();
  } catch (cause) {
    runtime.error = String(cause);
  }
}
onMounted(() => {
  synced();
  initDevicePostureWatcher();
});
</script>
<template>
  <main class="mobile-shell">
    <header class="mobile-header">
      <div class="mobile-brand">
        <img src="/logo/android-chrome-192x192.png" alt="" />
        <div>
          <small>STARRAIL · AUTO TOOLS</small>
          <h1>星穹数据航站</h1>
        </div>
      </div>
      <span class="mobile-offline">本地档案</span>
    </header>
    <p v-if="runtime.error" class="feedback error" role="alert">
      {{ runtime.error }}<button @click="runtime.error = ''">关闭</button>
    </p>
    <p v-if="runtime.notice" class="feedback" role="status">
      {{ runtime.notice }}<button @click="runtime.notice = ''">关闭</button>
    </p>
    <KeepAlive
      ><component
        :is="currentPage"
        :key="tab === 'build' ? `build-${runtime.inventoryRevision}` : tab"
        @synced="synced"
    /></KeepAlive>
    <nav class="mobile-nav" aria-label="主导航">
      <button
        v-for="item in tabs"
        :key="item.id"
        :class="{ active: tab === item.id }"
        :aria-current="tab === item.id ? 'page' : undefined"
        :title="item.name"
        @click="tab = item.id"
      >
        <svg
          v-if="item.id === 'inventory'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 20V10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          <path d="M8 11h8" />
        </svg>
        <svg
          v-else-if="item.id === 'catalogue'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <line x1="8" y1="7" x2="15" y2="7" />
          <line x1="8" y1="11" x2="13" y2="11" />
        </svg>
        <svg
          v-else-if="item.id === 'build'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polygon
            points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
          />
        </svg>
        <svg
          v-else-if="item.id === 'team'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <svg
          v-else-if="item.id === 'settings'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21.5 2v6h-6" />
          <path d="M2.5 22v-6h6" />
          <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8" />
          <path d="M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16" />
        </svg>
        <span>{{ item.name }}</span>
      </button>
    </nav>
  </main>
</template>
