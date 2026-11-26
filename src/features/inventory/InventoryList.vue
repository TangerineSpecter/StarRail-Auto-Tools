<script setup lang="ts">
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import {
  characterDisplayName,
  equippedCharacterLabel,
  lightConeById,
  pathIconSrc,
  relicImage,
  resolveCharacterCatalogue,
} from "@/shared/catalogue";
import {
  enhancementHitsOnLine,
  formatEnhancementHitBadge,
  usesEnhancementHitCount,
} from "@/shared/utils/relic-score";
import {
  formatPlanUpdatedDate,
  formatPlanUpdatedDateTime,
  formatPlanVersionTag,
  isBuildPlanOutdated,
} from "@/shared/utils/build-plan-meta";
import { formatStatValue, pathLabel, slotLabel, statLabel } from "./options";
import { inventoryItemId } from "./useInventoryArchive";
import MobileCharacterCard from "./MobileCharacterCard.vue";
import MobileLightConeCard from "./MobileLightConeCard.vue";
import LoadingState from "@/shared/ui/LoadingState.vue";
import type {
  CharacterListItem,
  InventoryKind,
  InventoryListItem,
  LightConeListItem,
  RelicListItem,
} from "@/types";

const props = defineProps<{
  kind: InventoryKind;
  items: InventoryListItem[];
  selectedIds: Set<number>;
  allSelected: boolean;
  appending: boolean;
  busy: boolean;
  readOnly?: boolean;
  activeDetailId?: number | null;
  currentGameVersion?: string;
}>();
const emit = defineEmits<{
  "toggle-all": [];
  "toggle-selected": [id: number];
  detail: [kind: InventoryKind, id: number];
  "edit-build": [character: CharacterListItem];
  scroll: [event: Event];
}>();

/** Dense list: only show hit badge when a line has 3+ enhancement upgrades. */
function relicSubstatRows(item: RelicListItem) {
  const enhancementHits = usesEnhancementHitCount(item.substats);
  return (item.substats ?? []).map((stat) => {
    const hits = enhancementHitsOnLine(stat, { enhancementHits });
    return {
      key: stat.key,
      value: stat.value,
      hits,
      badge: hits >= 3 ? formatEnhancementHitBadge(hits) : null,
    };
  });
}
const avatarColors = ["#1ea2e8", "#e84a4a", "#8740e5", "#33b061", "#f0a21d", "#e0427f"];
const relics = () => props.items as RelicListItem[];
const lightCones = () => props.items as LightConeListItem[];
const characters = () => props.items as CharacterListItem[];
const characterCatalogueEntry = (item: Pick<CharacterListItem, "characterId" | "name" | "path">) =>
  resolveCharacterCatalogue({
    characterId: item.characterId,
    name: item.name,
    path: item.path,
  });
const characterAvatar = (item: CharacterListItem) =>
  characterCatalogueEntry(item)?.image ?? undefined;
const characterBackground = (item: CharacterListItem) =>
  characterCatalogueEntry(item)?.backgroundImage;
const characterRarity = (item: CharacterListItem) => characterCatalogueEntry(item)?.rarity ?? 5;
const characterStars = (item: CharacterListItem) => "★".repeat(characterRarity(item));
const characterPlanVersionTag = (item: CharacterListItem) =>
  item.hasBuildPlan ? formatPlanVersionTag(item.buildPlanGameVersion) : "";
const characterPlanOutdated = (item: CharacterListItem) =>
  item.hasBuildPlan && isBuildPlanOutdated(item.buildPlanGameVersion, props.currentGameVersion);
const characterPlanUpdatedText = (item: CharacterListItem) => {
  const date = formatPlanUpdatedDate(item.buildPlanUpdatedAt);
  return date ? `更新于 ${date}` : "已保存目标";
};
const characterPlanUpdatedTitle = (item: CharacterListItem) => {
  const dateTime = formatPlanUpdatedDateTime(item.buildPlanUpdatedAt);
  return dateTime ? `方案更新于 ${dateTime}` : undefined;
};
const characterLabel = (item: Pick<CharacterListItem, "characterId" | "name" | "path">) =>
  characterDisplayName({
    characterId: item.characterId,
    name: item.name,
    path: item.path,
  });
const characterElement = (name: string, characterId?: number | null) =>
  resolveCharacterCatalogue({ characterId, name })?.element ?? null;
const equippedCharacterAvatar = (name: string, characterId?: number | null) =>
  resolveCharacterCatalogue({ characterId, name })?.image ?? undefined;
const lightConeImage = (item: LightConeListItem) =>
  lightConeById.get(item.templateId)?.image ?? undefined;

function normalizeRelicLabel(value: string): string {
  return value.replace(/[\s·•・]/g, "");
}

function isRedundantRelicName(item: Pick<RelicListItem, "name" | "setName" | "slot">): boolean {
  const name = normalizeRelicLabel(item.name);
  const set = normalizeRelicLabel(item.setName);
  const slot = normalizeRelicLabel(slotLabel(item.slot));
  return !name || name === set || name === `${set}${slot}`;
}

function relicDisplayTitle(item: Pick<RelicListItem, "name" | "setName" | "slot">): string {
  if (isRedundantRelicName(item)) {
    return item.setName || item.name;
  }
  return item.name;
}

function relicShowSetSubtitle(item: Pick<RelicListItem, "name" | "setName" | "slot">): boolean {
  return Boolean(item.setName) && !isRedundantRelicName(item);
}

function avatarColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}
</script>

<template>
  <div
    class="table-shell"
    :class="{ 'is-refreshing': busy && items.length > 0 }"
    @scroll="emit('scroll', $event)"
  >
    <LoadingState
      v-if="busy && items.length > 0"
      variant="bar"
      class="inventory-refresh-bar"
      label="正在更新列表…"
    />
    <table v-if="kind !== 'character'" :class="['inventory-table', `inventory-table--${kind}`]">
      <colgroup>
        <col v-if="!readOnly" class="inventory-col-select" />
        <col class="inventory-col-name" />
        <col class="inventory-col-level" />
        <col class="inventory-col-primary" />
        <col class="inventory-col-secondary" />
        <col v-if="kind === 'relic'" class="inventory-col-equipped" />
        <col class="inventory-col-action" />
      </colgroup>
      <thead>
        <tr>
          <th v-if="!readOnly" class="check-cell">
            <Checkbox binary :model-value="allSelected" @update:model-value="emit('toggle-all')" />
          </th>
          <th>名称</th>
          <template v-if="kind === 'relic'">
            <th>等级</th>
            <th>主词条</th>
            <th>副词条</th>
            <th>装备角色</th>
          </template>
          <template v-else>
            <th>等级</th>
            <th>叠影</th>
            <th>装备角色</th>
          </template>
          <th class="detail-cell">详情</th>
        </tr>
      </thead>
      <tbody>
        <template v-if="kind === 'relic'">
          <tr
            v-for="item in relics()"
            :key="item.itemId"
            v-memo="[
              item.itemId,
              selectedIds.has(item.itemId),
              activeDetailId === item.itemId,
              item.level,
              item.locked,
              item.discard,
              item.location,
              readOnly,
            ]"
            class="inventory-relic-row"
            :aria-current="activeDetailId === item.itemId ? 'true' : undefined"
            :tabindex="readOnly ? 0 : undefined"
            @click="readOnly && emit('detail', 'relic', item.itemId)"
            @keydown.enter="readOnly && emit('detail', 'relic', item.itemId)"
            @keydown.space.prevent="readOnly && emit('detail', 'relic', item.itemId)"
          >
            <td v-if="!readOnly" class="check-cell">
              <Checkbox
                binary
                :model-value="selectedIds.has(item.itemId)"
                @update:model-value="emit('toggle-selected', item.itemId)"
              />
            </td>
            <td class="relic-cell-identity">
              <div class="relic-name-cell">
                <div :class="['relic-icon-box', `rarity-${item.rarity}`]">
                  <img
                    v-if="relicImage(item.setId, item.slot)"
                    :src="relicImage(item.setId, item.slot)"
                    :alt="slotLabel(item.slot)"
                    loading="lazy"
                    decoding="async"
                    class="relic-piece-image"
                  /><span v-else class="relic-icon-star">☆</span>
                </div>
                <div class="relic-name-info">
                  <strong class="item-name">{{ relicDisplayTitle(item) }}</strong>
                  <small class="relic-subtitle">
                    <span class="relic-slot-tag">{{ slotLabel(item.slot) }}</span>
                    <span v-if="relicShowSetSubtitle(item)" class="relic-set-subtitle">{{
                      item.setName
                    }}</span>
                    <span
                      v-if="item.rarity > 0"
                      class="relic-rarity-stars"
                      :aria-label="`${item.rarity} 星`"
                      >{{ "★".repeat(item.rarity) }}</span
                    >
                    <span v-if="item.locked" class="relic-state-tag is-locked">已锁定</span>
                    <span v-else-if="item.discard" class="relic-state-tag is-discard">弃置</span>
                  </small>
                </div>
              </div>
            </td>
            <td class="relic-cell-level">
              <span :class="['relic-level-badge', { 'is-max': item.level === 15 }]"
                >+{{ item.level }}</span
              >
            </td>
            <td class="relic-cell-main">
              <div class="relic-main-stat">
                <span class="stat-name">{{ statLabel(item.mainStat) }}</span
                ><strong class="stat-value">{{
                  formatStatValue(item.mainStat, item.mainStatValue)
                }}</strong>
              </div>
            </td>
            <td class="relic-cell-subs">
              <div class="relic-substats-grid">
                <span
                  v-for="row in relicSubstatRows(item)"
                  :key="row.key"
                  :class="['relic-substat-item', `hit-${row.hits}`]"
                >
                  <span class="substat-name">{{ statLabel(row.key) }}</span
                  ><strong class="substat-value">{{ formatStatValue(row.key, row.value) }}</strong
                  ><i v-if="row.badge" class="hit-count-badge">{{ row.badge }}</i>
                </span>
              </div>
            </td>
            <td v-if="!readOnly" class="relic-cell-equip">
              <span
                v-if="item.location"
                :class="[
                  'relic-equip-tag',
                  `element-${characterElement(item.location, item.equippedCharacterId)}`,
                ]"
                ><img
                  v-if="equippedCharacterAvatar(item.location, item.equippedCharacterId)"
                  :src="equippedCharacterAvatar(item.location, item.equippedCharacterId)"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  class="relic-equip-avatar"
                />{{ equippedCharacterLabel(item.location, item.equippedCharacterId) }}</span
              ><span v-else class="relic-equip-tag unequipped">未装备</span>
            </td>
            <td v-if="!readOnly" class="detail-cell relic-cell-action">
              <Button
                class="row-action"
                type="button"
                text
                @click.stop="emit('detail', 'relic', item.itemId)"
                >查看</Button
              >
            </td>
          </tr>
        </template>
        <template v-else>
          <tr
            v-for="item in lightCones()"
            :key="item.itemId"
            v-memo="[
              item.itemId,
              selectedIds.has(item.itemId),
              activeDetailId === item.itemId,
              item.level,
              item.superimposition,
              item.location,
              readOnly,
            ]"
            class="inventory-lightcone-row"
            :role="readOnly ? 'button' : undefined"
            :aria-label="readOnly ? `查看${item.name}` : undefined"
            :aria-current="activeDetailId === item.itemId ? 'true' : undefined"
            :tabindex="readOnly ? 0 : undefined"
            @click="readOnly && emit('detail', 'lightCone', item.itemId)"
            @keydown.enter="readOnly && emit('detail', 'lightCone', item.itemId)"
            @keydown.space.prevent="readOnly && emit('detail', 'lightCone', item.itemId)"
          >
            <td v-if="readOnly" colspan="5" class="mobile-lightcone-cell">
              <MobileLightConeCard :item="item" />
            </td>
            <template v-else>
              <td v-if="!readOnly" class="check-cell">
                <Checkbox
                  binary
                  :model-value="selectedIds.has(item.itemId)"
                  @update:model-value="emit('toggle-selected', item.itemId)"
                />
              </td>
              <td class="lightcone-cell-identity">
                <div class="relic-name-cell">
                  <div class="relic-icon-box">
                    <img
                      v-if="lightConeImage(item)"
                      :src="lightConeImage(item)"
                      :alt="item.name"
                      loading="lazy"
                      decoding="async"
                      class="light-cone-image"
                    /><span v-else class="relic-icon-star">☆</span>
                  </div>
                  <div class="relic-name-info">
                    <strong class="item-name">{{ item.name }}</strong>
                  </div>
                </div>
              </td>
              <td class="lightcone-cell-level">
                <b>Lv.{{ item.level }}</b>
              </td>
              <td class="lightcone-cell-super">
                <span
                  :class="[
                    'relic-substat-item',
                    'light-cone-superimposition',
                    `hit-${item.superimposition}`,
                  ]"
                >
                  <span class="substat-name">叠影</span
                  ><strong class="substat-value">{{ item.superimposition }}</strong>
                </span>
              </td>
              <td class="lightcone-cell-equip">
                <span
                  v-if="item.location"
                  :class="[
                    'relic-equip-tag',
                    `element-${characterElement(item.location, item.equippedCharacterId)}`,
                  ]"
                  ><img
                    v-if="equippedCharacterAvatar(item.location, item.equippedCharacterId)"
                    :src="equippedCharacterAvatar(item.location, item.equippedCharacterId)"
                    alt=""
                    class="relic-equip-avatar"
                  />{{ equippedCharacterLabel(item.location, item.equippedCharacterId) }}</span
                ><span v-else class="relic-equip-tag unequipped">未装备</span>
              </td>
              <td class="detail-cell lightcone-cell-action">
                <Button
                  class="row-action"
                  type="button"
                  text
                  @click.stop="emit('detail', 'lightCone', item.itemId)"
                  >查看</Button
                >
              </td>
            </template>
          </tr>
        </template>
        <tr v-if="!items.length">
          <td :colspan="kind === 'lightCone' ? 6 : 7" class="table-empty">
            <LoadingState v-if="busy" variant="list" label="正在检索数据库…" :rows="5" />
            <template v-else>
              <span>◇</span><strong>没有符合条件的数据</strong
              ><small>{{
                readOnly
                  ? "请在同步页面下载电脑端上传的数据"
                  : "启动游戏数据直读并重新登录后，档案会自动出现"
              }}</small>
            </template>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else class="character-card-grid">
      <div
        v-for="item in characters()"
        :key="item.characterId"
        :class="[
          'character-card',
          {
            'has-build-plan': item.hasBuildPlan,
            'is-plan-outdated': characterPlanOutdated(item),
          },
        ]"
        :style="
          !readOnly && characterBackground(item)
            ? { '--character-card-backdrop': `url(${characterBackground(item)})` }
            : undefined
        "
        :aria-current="activeDetailId === item.characterId ? 'true' : undefined"
        @click="emit('detail', 'character', item.characterId)"
      >
        <MobileCharacterCard
          v-if="readOnly"
          :item="item"
          :current-game-version="currentGameVersion"
        />
        <template v-else>
          <div class="character-card-header">
            <img
              v-if="characterAvatar(item)"
              :class="['character-card-avatar', `rarity-${characterRarity(item)}`]"
              :src="characterAvatar(item)"
              :alt="`${characterLabel(item)} 头像`"
              loading="lazy"
              decoding="async"
            />
            <div
              v-else
              class="character-card-avatar-fallback"
              :style="{ background: avatarColor(item.name) }"
            >
              {{ item.name.charAt(0) }}
            </div>
            <div class="character-card-meta-row">
              <div class="character-path">
                <img
                  class="path-icon"
                  :src="pathIconSrc(item.path)"
                  :alt="pathLabel(item.path)"
                  loading="lazy"
                  decoding="async"
                /><span class="path-text">{{ pathLabel(item.path) }}</span>
              </div>
              <span
                v-if="characterCatalogueEntry(item)?.element"
                :class="[
                  'character-element-pill',
                  `elem-${characterCatalogueEntry(item)?.element}`,
                ]"
              >
                <img
                  v-if="characterCatalogueEntry(item)?.elementIcon"
                  :src="characterCatalogueEntry(item)?.elementIcon"
                  :alt="characterCatalogueEntry(item)?.element"
                  loading="lazy"
                  decoding="async"
                />
                <span>{{ characterCatalogueEntry(item)?.element }}</span>
              </span>
            </div>
            <div class="character-name">{{ characterLabel(item) }}</div>
            <div
              :class="['character-stars', `rarity-${characterRarity(item)}`]"
              :aria-label="`${characterRarity(item)} 星`"
            >
              {{ characterStars(item) }}
            </div>
          </div>
          <div class="character-card-stats">
            <div class="stat-col">
              <span class="stat-label">等级</span
              ><strong :class="['stat-val', { 'is-max': item.level === 80 }]"
                >Lv.{{ item.level }}</strong
              >
            </div>
            <div class="stat-col">
              <span class="stat-label">星魂</span
              ><strong :class="['stat-val', { 'is-active': item.eidolon > 0 }]"
                >E{{ item.eidolon }}</strong
              >
            </div>
          </div>
          <div class="character-card-actions">
            <button
              :class="[
                'character-build-action',
                {
                  'has-build-plan': item.hasBuildPlan,
                  'is-outdated': characterPlanOutdated(item),
                },
              ]"
              type="button"
              :title="
                item.hasBuildPlan ? characterPlanUpdatedTitle(item) : '点击设置培养方案与毕业目标'
              "
              @click.stop="emit('edit-build', item)"
            >
              <template v-if="item.hasBuildPlan">
                <span class="character-build-action-head">
                  <span class="character-build-status">
                    <span class="character-build-dot" aria-hidden="true" />
                    已设培养方案
                  </span>
                  <span
                    v-if="characterPlanVersionTag(item)"
                    :class="[
                      'character-build-version',
                      { 'is-outdated': characterPlanOutdated(item) },
                    ]"
                  >
                    {{ characterPlanVersionTag(item)
                    }}<template v-if="characterPlanOutdated(item)"> · 旧版</template>
                  </span>
                </span>
                <span class="character-build-action-meta">
                  <span class="character-build-updated">{{ characterPlanUpdatedText(item) }}</span>
                  <span class="character-build-cta">{{
                    characterPlanOutdated(item) ? "回顾方案 ›" : "编辑方案 ›"
                  }}</span>
                </span>
              </template>
              <template v-else>
                <span class="character-build-action-head">
                  <span class="character-build-status is-empty">未设培养方案</span>
                  <span class="character-build-cta">+ 设置目标</span>
                </span>
                <span class="character-build-action-meta">
                  <span class="character-build-updated">配置套装、词条与毕业目标</span>
                </span>
              </template>
            </button>
          </div>
        </template>
      </div>
      <div v-if="!items.length" class="table-empty">
        <LoadingState v-if="busy" variant="cards" label="正在检索数据库…" :rows="4" />
        <template v-else>
          <span>◇</span><strong>没有符合条件的数据</strong
          ><small>{{
            readOnly
              ? "请在同步页面下载电脑端上传的数据"
              : "启动游戏数据直读并重新登录后，档案会自动出现"
          }}</small>
        </template>
      </div>
    </div>
    <div v-if="appending" class="loading-more">
      <span class="loading-spinner">↻</span> 加载更多数据中...
    </div>
  </div>
</template>
