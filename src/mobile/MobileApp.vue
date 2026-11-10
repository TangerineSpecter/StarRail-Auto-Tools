<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, provide, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRuntimeStore } from "@/app/stores/runtime";
import { runtimeContextKey } from "@/shared/contracts/runtime";
import { readOnlyViewKey } from "@/shared/contracts/view-mode";
import { inventoryApi } from "@/shared/api/inventory";
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
onMounted(synced);
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
        @click="tab = item.id"
      >
        {{ item.name }}
      </button>
    </nav>
  </main>
</template>
