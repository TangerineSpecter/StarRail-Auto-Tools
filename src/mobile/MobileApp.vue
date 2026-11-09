<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { inventoryApi } from "@/shared/api/inventory";
import { characterDisplayName, equippedCharacterLabel } from "@/shared/catalogue";
import { formatStatValue, pathLabel, slotLabel, statLabel } from "@/shared/catalogue/relic-options";
import type {
  CharacterListItem,
  InventoryDetail,
  InventoryKind,
  LightConeListItem,
  RelicListItem,
} from "@/types";
import { useMobileData, type MobileItem, type MobileTab } from "./useMobileData";

const tab = ref<MobileTab>("character");
const search = ref("");
const detail = ref<InventoryDetail | null>(null);
const detailLoading = ref(false);
const message = ref("");
const data = useMobileData();
const { items, teams, builds, total, loading, error, settings } = data;
const tabs: { id: MobileTab; name: string }[] = [
  { id: "character", name: "角色" },
  { id: "relic", name: "遗器" },
  { id: "lightCone", name: "光锥" },
  { id: "team", name: "配队" },
  { id: "build", name: "毕业方案" },
  { id: "settings", name: "同步" },
];
const title = computed(() => tabs.find((item) => item.id === tab.value)?.name ?? "背包");
let detailRequest = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
watch([tab, search], () => {
  detail.value = null;
  detailRequest++;
  clearTimeout(timer);
  timer = setTimeout(() => void data.load(tab.value, search.value), 200);
});
onMounted(() => {
  void data.loadSettings();
  void data.load(tab.value, search.value);
});
function chooseTab(value: MobileTab) {
  search.value = "";
  tab.value = value;
  message.value = "";
}
function label(item: MobileItem) {
  return "characterId" in item
    ? characterDisplayName({ name: item.name, path: item.path, characterId: item.characterId })
    : item.name;
}
function subtitle(item: MobileItem) {
  if ("characterId" in item)
    return `${pathLabel(item.path)} · ${item.level} 级 · ${item.eidolon} 魂`;
  if ("setId" in item) return `${item.setName} · ${slotLabel(item.slot)} · +${item.level}`;
  return `${item.level} 级 · 叠影 ${item.superimposition}`;
}
async function open(item: MobileItem) {
  const id = ++detailRequest;
  const kind: InventoryKind =
    "characterId" in item ? "character" : "setId" in item ? "relic" : "lightCone";
  detailLoading.value = true;
  try {
    const result = await inventoryApi.detail(
      kind,
      "characterId" in item ? item.characterId : item.itemId,
    );
    if (id === detailRequest) detail.value = result;
  } catch (cause) {
    if (id === detailRequest) error.value = String(cause);
  } finally {
    if (id === detailRequest) detailLoading.value = false;
  }
}
async function sync() {
  message.value = "";
  if (await data.download()) {
    message.value = "同步完成，数据已保存在手机上。";
  }
}
const character = computed(() =>
  detail.value?.kind === "character"
    ? (detail.value.data as unknown as CharacterListItem & {
        equippedRelics?: RelicListItem[];
        equippedLightCone?: LightConeListItem | null;
      })
    : null,
);
const relic = computed(() =>
  detail.value?.kind === "relic" ? (detail.value.data as unknown as RelicListItem) : null,
);
const cone = computed(() =>
  detail.value?.kind === "lightCone" ? (detail.value.data as unknown as LightConeListItem) : null,
);
</script>

<template>
  <main class="mobile-shell">
    <header class="mobile-header">
      <div>
        <small>星穹铁道工具箱</small>
        <h1>{{ detail ? "详情" : title }}</h1>
      </div>
      <button v-if="detail" class="text-button" @click="detail = null">返回</button>
    </header>
    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <p v-if="message" class="feedback" role="status">{{ message }}</p>
    <template v-if="detail">
      <section v-if="character" class="detail-panel">
        <h2>{{ label(character) }}</h2>
        <p>{{ subtitle(character) }}</p>
        <h3>光锥</h3>
        <p>
          {{ character.equippedLightCone?.name ?? "未装备"
          }}<template v-if="character.equippedLightCone">
            · {{ character.equippedLightCone.level }} 级</template
          >
        </p>
        <h3>遗器</h3>
        <div v-if="character.equippedRelics?.length" class="detail-list">
          <div v-for="item in character.equippedRelics" :key="item.itemId">
            <b>{{ item.name }}</b
            ><span>{{ slotLabel(item.slot) }} · +{{ item.level }}</span>
          </div>
        </div>
        <p v-else>未装备遗器</p>
      </section>
      <section v-else-if="relic" class="detail-panel">
        <h2>{{ relic.name }}</h2>
        <p>{{ subtitle(relic) }}</p>
        <h3>主属性</h3>
        <p>
          {{ statLabel(relic.mainStat) }} {{ formatStatValue(relic.mainStat, relic.mainStatValue) }}
        </p>
        <h3>副属性</h3>
        <div class="detail-list">
          <div v-for="(stat, index) in relic.substats" :key="index">
            <b>{{ statLabel(stat.key) }}</b
            ><span>{{ formatStatValue(stat.key, stat.value) }}</span>
          </div>
        </div>
        <h3>装备角色</h3>
        <p>
          {{
            relic.location
              ? equippedCharacterLabel(relic.location, relic.equippedCharacterId)
              : "未装备"
          }}
        </p>
      </section>
      <section v-else-if="cone" class="detail-panel">
        <h2>{{ cone.name }}</h2>
        <p>{{ subtitle(cone) }}</p>
        <h3>装备角色</h3>
        <p>
          {{
            cone.location
              ? equippedCharacterLabel(cone.location, cone.equippedCharacterId)
              : "未装备"
          }}
        </p>
      </section>
    </template>
    <template v-else-if="tab === 'settings'"
      ><section class="settings-panel">
        <h2>WebDAV 同步</h2>
        <p>从电脑上传的快照下载到手机，手机不会上传数据。</p>
        <form v-if="settings" @submit.prevent="sync">
          <label
            >服务器地址<input
              v-model="settings.webdav.serverUrl"
              type="url"
              required
              placeholder="https://example.com"
              autocomplete="url" /></label
          ><label
            >远端目录<input
              v-model="settings.webdav.remotePath"
              required
              placeholder="/StarRailTools/" /></label
          ><label>用户名<input v-model="settings.webdav.username" autocomplete="username" /></label
          ><label
            >密码<input
              v-model="settings.webdav.password"
              type="password"
              autocomplete="current-password" /></label
          ><button class="primary" :disabled="loading">
            {{ loading ? "同步中…" : "下载最新数据" }}
          </button>
        </form>
      </section></template
    >
    <template v-else>
      <div v-if="tab !== 'build'" class="search-row">
        <input
          v-model="search"
          type="search"
          :placeholder="`搜索${title}`"
          :aria-label="`搜索${title}`"
        /><span>{{ total }} 项</span>
      </div>
      <p v-if="loading && !detailLoading" class="state">正在加载…</p>
      <template v-else-if="tab === 'team'"
        ><div v-if="teams.length" class="rows">
          <article v-for="team in teams" :key="team.teamId" class="team-row">
            <strong>{{ team.name }}</strong>
            <p>
              {{
                team.members
                  .map((member) =>
                    member
                      ? characterDisplayName({
                          name: member.name,
                          path: member.path,
                          characterId: member.characterId,
                        })
                      : "空位",
                  )
                  .join(" · ")
              }}
            </p>
            <small v-if="team.note">{{ team.note }}</small>
          </article>
        </div>
        <p v-else class="state">暂无配队，请先在电脑端同步。</p></template
      >
      <template v-else-if="tab === 'build'"
        ><div v-if="builds.length" class="rows">
          <article v-for="entry in builds" :key="entry.plan.characterId" class="team-row">
            <strong>{{
              characterDisplayName({
                name: entry.character.name,
                characterId: entry.character.characterId,
              })
            }}</strong>
            <p>{{ entry.character.level }} 级 · {{ entry.plan.targets.length }} 项属性目标</p>
            <div v-for="target in entry.plan.targets" :key="target.statKey" class="build-target">
              <span>{{ statLabel(target.statKey) }}</span
              ><span>目标 {{ target.target }} · 最低 {{ target.minimum }}</span>
            </div>
            <small v-if="entry.plan.note">{{ entry.plan.note }}</small>
          </article>
        </div>
        <p v-else class="state">暂无毕业方案，请先在电脑端同步。</p></template
      >
      <template v-else
        ><div v-if="items.length" class="rows">
          <button
            v-for="item in items"
            :key="'characterId' in item ? item.characterId : item.itemId"
            class="item-row"
            @click="open(item)"
          >
            <span
              ><strong>{{ label(item) }}</strong
              ><small>{{ subtitle(item) }}</small></span
            ><span aria-hidden="true">›</span>
          </button>
        </div>
        <p v-else class="state">暂无{{ title }}，请先从 WebDAV 同步。</p></template
      >
      <button
        v-if="tab !== 'build' && (tab === 'team' ? teams.length : items.length) < total && !loading"
        class="more"
        @click="data.load(tab, search, true)"
      >
        加载更多
      </button>
    </template>
    <nav class="mobile-nav" aria-label="主导航">
      <button
        v-for="item in tabs"
        :key="item.id"
        :class="{ active: tab === item.id }"
        @click="chooseTab(item.id)"
      >
        {{ item.name }}
      </button>
    </nav>
  </main>
</template>
