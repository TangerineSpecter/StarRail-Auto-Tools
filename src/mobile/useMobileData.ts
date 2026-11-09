import { ref } from "vue";
import { inventoryApi } from "@/shared/api/inventory";
import { buildPlanApi } from "@/shared/api/build-plan";
import { teamApi } from "@/shared/api/team";
import { syncApi } from "@/shared/api/sync";
import type {
  BuildDashboardEntry,
  CharacterListItem,
  LightConeListItem,
  RelicListItem,
  SyncSettings,
  Team,
} from "@/types";

export type MobileTab = "character" | "relic" | "lightCone" | "team" | "build" | "settings";
export type MobileItem = CharacterListItem | RelicListItem | LightConeListItem;

export function useMobileData() {
  const items = ref<MobileItem[]>([]);
  const teams = ref<Team[]>([]);
  const builds = ref<BuildDashboardEntry[]>([]);
  const total = ref(0);
  const page = ref(1);
  const loading = ref(false);
  const error = ref("");
  const settings = ref<SyncSettings | null>(null);
  let requestId = 0;

  async function load(tab: MobileTab, search: string, more = false) {
    const id = ++requestId;
    if (tab === "settings") {
      loading.value = false;
      return;
    }
    if (!more) {
      items.value = [];
      teams.value = [];
      builds.value = [];
      total.value = 0;
    }
    loading.value = true;
    error.value = "";
    const nextPage = more ? page.value + 1 : 1;
    try {
      const filter = { page: nextPage, pageSize: 50, search: search.trim() || undefined };
      if (tab === "build") {
        const result = await buildPlanApi.dashboard();
        if (id === requestId) builds.value = result;
      } else if (tab === "team") {
        const result = await teamApi.list(filter);
        if (id === requestId) {
          teams.value = more ? [...teams.value, ...result.items] : result.items;
          total.value = result.total;
          page.value = nextPage;
        }
      } else {
        const result =
          tab === "character"
            ? await inventoryApi.listCharacters(filter)
            : tab === "relic"
              ? await inventoryApi.listRelics(filter)
              : await inventoryApi.listLightCones(filter);
        if (id === requestId) {
          items.value = more ? [...items.value, ...result.items] : result.items;
          total.value = result.total;
          page.value = nextPage;
        }
      }
    } catch (cause) {
      if (id === requestId) error.value = String(cause);
    } finally {
      if (id === requestId) loading.value = false;
    }
  }

  async function loadSettings() {
    try {
      settings.value = await syncApi.getSettings();
      settings.value.protocol = "webdav";
    } catch (cause) {
      error.value = String(cause);
    }
  }

  async function download() {
    if (!settings.value || loading.value) return false;
    loading.value = true;
    error.value = "";
    try {
      const value = { ...settings.value, protocol: "webdav" as const };
      await syncApi.saveSettings(value);
      const result = await syncApi.download(value);
      if (result.status === "conflict") {
        error.value = "本机数据有未同步的修改，已停止下载。请检查后再同步。";
        return false;
      }
      return true;
    } catch (cause) {
      error.value = String(cause);
      return false;
    } finally {
      loading.value = false;
    }
  }

  return { items, teams, builds, total, loading, error, settings, load, loadSettings, download };
}
