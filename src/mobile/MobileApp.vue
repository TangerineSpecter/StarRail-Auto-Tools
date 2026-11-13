<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  shallowReactive,
  type Component,
} from "vue";
import { storeToRefs } from "pinia";
import { useRuntimeStore } from "@/app/stores/runtime";
import { runtimeContextKey } from "@/shared/contracts/runtime";
import { mobileViewKey } from "@/shared/contracts/mobile-view";
import { readOnlyViewKey } from "@/shared/contracts/view-mode";
import { mobileSubModeKey, type MobileSubModeHandlers } from "@/shared/contracts/mobile-sub-mode";
import { mobileTopHeaderKey } from "@/shared/contracts/mobile-top-header";
import { inventoryApi } from "@/shared/api/inventory";
import MobileInventoryPage from "@/pages/MobileInventoryPage.vue";
import { loadRelicMainStatScanner } from "@/pages/scanner-loaders";
import { useCapsuleSwipe } from "@/shared/ui/useCapsuleSwipe";
import MobileSync from "./MobileSync.vue";
import { useMobilePageTransition } from "./useMobilePageTransition";
const MobileDevDataSwitch = import.meta.env.DEV
  ? defineAsyncComponent(() => import("./MobileDevDataSwitch.vue"))
  : null;
const runtime = useRuntimeStore();
const refs = storeToRefs(runtime);
provide(runtimeContextKey, refs);
provide(readOnlyViewKey, true);
provide(mobileViewKey, true);

const subModeByPage = shallowReactive<Record<string, MobileSubModeHandlers | undefined>>({});
const tabs = [
  { id: "inventory", name: "背包" },
  { id: "catalogue", name: "图鉴" },
  { id: "build", name: "毕业" },
  { id: "analysis", name: "分析" },
  { id: "settings", name: "同步" },
] as const;
type MobilePageId = (typeof tabs)[number]["id"];
const tab = ref<MobilePageId>("inventory");
const activeSubMode = computed(() => subModeByPage[tab.value] ?? null);
const hasSubMode = computed(() => Boolean(activeSubMode.value));
const topHeaderEl = ref<HTMLElement | null>(null);
const isUnfoldedPortrait = ref(
  typeof document !== "undefined" &&
    document.documentElement.dataset.posture === "unfolded-portrait",
);
const hasTopPrimary = computed(
  () =>
    isUnfoldedPortrait.value &&
    (tab.value === "inventory" ||
      tab.value === "catalogue" ||
      tab.value === "build" ||
      tab.value === "analysis"),
);
provide(mobileTopHeaderKey, {
  host: topHeaderEl,
  isUnfoldedPortrait,
  activePage: tab,
});
provide(mobileSubModeKey, {
  active: hasSubMode,
  prev: () => activeSubMode.value?.prev(),
  next: () => activeSubMode.value?.next(),
  register: (handlers) => {
    if (!handlers) return () => {};
    subModeByPage[handlers.pageId] = handlers;
    return () => {
      if (subModeByPage[handlers.pageId] === handlers) {
        delete subModeByPage[handlers.pageId];
      }
    };
  },
});
const content = ref<HTMLElement | null>(null);
const navEl = ref<HTMLElement | null>(null);
const navItemsEl = ref<HTMLElement | null>(null);
useCapsuleSwipe({
  element: navEl,
  enabled: hasSubMode,
  stopPropagation: false,
  thresholdPx: 28,
  canStart: () =>
    document.documentElement.dataset.posture === "unfolded-portrait" &&
    (!navItemsEl.value || navItemsEl.value.scrollWidth <= navItemsEl.value.clientWidth + 1),
  onNext: () => activeSubMode.value?.next(),
  onPrev: () => activeSubMode.value?.prev(),
});
const pages = shallowReactive<Partial<Record<MobilePageId, Component>>>({
  inventory: MobileInventoryPage,
  settings: MobileSync,
});
const pageLoaders = {
  catalogue: () => import("@/pages/CataloguePage.vue"),
  build: () => import("@/features/build-planner/BuildDashboard.vue"),
  analysis: () => import("@/pages/MobileAnalysisPage.vue"),
};
const navigation = useMobilePageTransition({
  page: tab,
  content,
  order: tabs.map((item) => item.id),
  async prepare(next) {
    if (pages[next]) return;
    const loader = pageLoaders[next as keyof typeof pageLoaders];
    pages[next] = (await loader()).default;
  },
  onError: (error) => (runtime.error = String(error)),
});
const currentPage = computed(() => pages[tab.value]);
async function synced() {
  try {
    runtime.summary = await inventoryApi.summary();
    runtime.markInventoryChanged();
  } catch (cause) {
    runtime.error = String(cause);
  }
}
let postureObserver: MutationObserver | undefined;
onMounted(() => {
  const syncPosture = () => {
    isUnfoldedPortrait.value = document.documentElement.dataset.posture === "unfolded-portrait";
  };
  syncPosture();
  if (typeof MutationObserver !== "undefined") {
    postureObserver = new MutationObserver(syncPosture);
    postureObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-posture"],
    });
  }
  synced();
  const preloadPages = () => {
    Object.values(pageLoaders).forEach((loader) => {
      void loader().catch(() => {});
    });
    void loadRelicMainStatScanner().catch(() => {});
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(preloadPages, { timeout: 2000 });
  } else {
    setTimeout(preloadPages, 800);
  }
});
onBeforeUnmount(() => {
  postureObserver?.disconnect();
  postureObserver = undefined;
});
</script>
<template>
  <main class="mobile-shell" :class="{ 'has-top-primary': hasTopPrimary }">
    <header ref="topHeaderEl" class="mobile-top-header" />
    <h1 class="mobile-page-title">{{ tabs.find((item) => item.id === tab)?.name }}</h1>
    <p v-if="runtime.error" class="feedback error" role="alert">
      {{ runtime.error }}<button @click="runtime.error = ''">关闭</button>
    </p>
    <p v-if="runtime.notice" class="feedback" role="status">
      {{ runtime.notice }}<button @click="runtime.notice = ''">关闭</button>
    </p>
    <div
      ref="content"
      :class="['mobile-content', { 'is-transitioning': navigation.pending.value }]"
      :aria-busy="navigation.pending.value"
    >
      <KeepAlive
        ><component
          :is="currentPage"
          :key="tab === 'build' ? `build-${runtime.inventoryRevision}` : tab"
          @synced="synced"
        >
          <template #toolbar-actions>
            <MobileDevDataSwitch v-if="MobileDevDataSwitch" />
          </template>
        </component>
      </KeepAlive>
    </div>
    <nav ref="navEl" class="mobile-nav" :class="{ 'has-sub-mode': hasSubMode }" aria-label="主导航">
      <button
        v-if="hasSubMode"
        type="button"
        class="mobile-nav-sub-btn prev"
        aria-label="上一项模式"
        @click="activeSubMode?.prev()"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div class="mobile-nav-brand">
        <img src="/logo/android-chrome-192x192.png" alt="星穹数据航站" />
      </div>
      <div ref="navItemsEl" class="mobile-nav-items">
        <button
          v-for="item in tabs"
          :key="item.id"
          :class="{ active: navigation.selected.value === item.id }"
          :aria-current="navigation.selected.value === item.id ? 'page' : undefined"
          :title="item.name"
          @click="navigation.go(item.id)"
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
            v-else-if="item.id === 'analysis'"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M4 3v18h17" />
            <path d="m8 15 4-5 4 3 5-7" />
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
      </div>

      <button
        v-if="hasSubMode"
        type="button"
        class="mobile-nav-sub-btn next"
        aria-label="下一项模式"
        @click="activeSubMode?.next()"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </nav>
  </main>
</template>
