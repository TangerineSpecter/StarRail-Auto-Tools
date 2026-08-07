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
import { formatStatValue, pathLabel, slotLabel, statLabel } from "./options";
import { inventoryItemId } from "./useInventoryArchive";
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
const characterStars = (item: CharacterListItem) =>
  "★".repeat(characterCatalogueEntry(item)?.rarity ?? 5);
const characterLabel = (item: Pick<CharacterListItem, "characterId" | "name" | "path">) =>
  characterDisplayName({
    characterId: item.characterId,
    name: item.name,
    path: item.path,
  });
const characterElement = (name: string, characterId?: number | null) =>
  resolveCharacterCatalogue({ characterId, name })?.element ?? null;
const lightConeImage = (item: LightConeListItem) =>
  lightConeById.get(item.templateId)?.image ?? undefined;

function avatarColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}
</script>

<template>
  <div class="table-shell" @scroll="emit('scroll', $event)">
    <table v-if="kind !== 'character'" :class="['inventory-table', `inventory-table--${kind}`]">
      <colgroup>
        <col class="inventory-col-select" />
        <col class="inventory-col-name" />
        <col class="inventory-col-level" />
        <col class="inventory-col-primary" />
        <col class="inventory-col-secondary" />
        <col v-if="kind === 'relic'" class="inventory-col-equipped" />
        <col class="inventory-col-action" />
      </colgroup>
      <thead>
        <tr>
          <th class="check-cell">
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
          <tr v-for="item in relics()" :key="item.itemId">
            <td class="check-cell">
              <Checkbox
                binary
                :model-value="selectedIds.has(item.itemId)"
                @update:model-value="emit('toggle-selected', item.itemId)"
              />
            </td>
            <td>
              <div class="relic-name-cell">
                <div class="relic-icon-box">
                  <img
                    v-if="relicImage(item.setId, item.slot)"
                    :src="relicImage(item.setId, item.slot)"
                    :alt="slotLabel(item.slot)"
                    class="relic-piece-image"
                  /><span v-else class="relic-icon-star">☆</span>
                </div>
                <div class="relic-name-info">
                  <strong class="item-name">{{ item.name }}</strong>
                  <small class="relic-subtitle"
                    >{{ item.setName }} · {{ slotLabel(item.slot) }}</small
                  >
                </div>
              </div>
            </td>
            <td>
              <span :class="['relic-level-badge', { 'is-max': item.level === 15 }]"
                >+{{ item.level }}</span
              >
            </td>
            <td>
              <div class="relic-main-stat">
                <span class="stat-name">{{ statLabel(item.mainStat) }}</span
                ><strong class="stat-value">{{
                  formatStatValue(item.mainStat, item.mainStatValue)
                }}</strong>
              </div>
            </td>
            <td>
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
            <td>
              <span
                v-if="item.location"
                :class="[
                  'relic-equip-tag',
                  `element-${characterElement(item.location, item.equippedCharacterId)}`,
                ]"
                >{{ equippedCharacterLabel(item.location, item.equippedCharacterId) }}</span
              ><span v-else class="relic-equip-tag unequipped">未装备</span>
            </td>
            <td class="detail-cell">
              <Button
                class="row-action"
                type="button"
                text
                @click="emit('detail', 'relic', item.itemId)"
                >查看</Button
              >
            </td>
          </tr>
        </template>
        <template v-else>
          <tr v-for="item in lightCones()" :key="item.itemId">
            <td class="check-cell">
              <Checkbox
                binary
                :model-value="selectedIds.has(item.itemId)"
                @update:model-value="emit('toggle-selected', item.itemId)"
              />
            </td>
            <td>
              <div class="relic-name-cell">
                <div class="relic-icon-box">
                  <img
                    v-if="lightConeImage(item)"
                    :src="lightConeImage(item)"
                    :alt="item.name"
                    class="light-cone-image"
                  /><span v-else class="relic-icon-star">☆</span>
                </div>
                <div class="relic-name-info">
                  <strong class="item-name">{{ item.name }}</strong>
                </div>
              </div>
            </td>
            <td>
              <b>Lv.{{ item.level }}</b>
            </td>
            <td>
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
            <td>
              <span
                v-if="item.location"
                :class="[
                  'relic-equip-tag',
                  `element-${characterElement(item.location, item.equippedCharacterId)}`,
                ]"
                >{{ equippedCharacterLabel(item.location, item.equippedCharacterId) }}</span
              ><span v-else class="relic-equip-tag unequipped">未装备</span>
            </td>
            <td class="detail-cell">
              <Button
                class="row-action"
                type="button"
                text
                @click="emit('detail', 'lightCone', item.itemId)"
                >查看</Button
              >
            </td>
          </tr>
        </template>
        <tr v-if="!items.length">
          <td :colspan="kind === 'lightCone' ? 6 : 7" class="table-empty">
            <span>◇</span><strong>{{ busy ? "正在检索数据库…" : "没有符合条件的数据" }}</strong
            ><small>启动游戏数据直读并重新登录后，档案会自动出现</small>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else class="character-card-grid">
      <div
        v-for="item in characters()"
        :key="item.characterId"
        class="character-card"
        @click="emit('detail', 'character', item.characterId)"
      >
        <div
          class="character-card-header"
          :style="
            characterBackground(item)
              ? { '--character-card-backdrop': `url(${characterBackground(item)})` }
              : undefined
          "
        >
          <img
            v-if="characterAvatar(item)"
            class="character-card-avatar"
            :src="characterAvatar(item)"
            :alt="`${characterLabel(item)} 头像`"
          />
          <div
            v-else
            class="character-card-avatar-fallback"
            :style="{ background: avatarColor(item.name) }"
          >
            {{ item.name.charAt(0) }}
          </div>
          <div class="character-path">
            <img class="path-icon" :src="pathIconSrc(item.path)" :alt="pathLabel(item.path)" /><span
              class="path-text"
              >{{ pathLabel(item.path) }}</span
            >
          </div>
          <div class="character-name">{{ characterLabel(item) }}</div>
          <div
            class="character-stars"
            :aria-label="`${characterCatalogueEntry(item)?.rarity ?? 5} 星`"
          >
            {{ characterStars(item) }}
          </div>
        </div>
        <div class="character-card-stats">
          <div class="stat-col">
            <span class="stat-label">等级</span
            ><strong class="stat-val">Lv.{{ item.level }}</strong>
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
            :class="['character-build-action', { 'has-build-plan': item.hasBuildPlan }]"
            type="button"
            @click.stop="emit('edit-build', item)"
          >
            培养方案 / 毕业目标
          </button>
        </div>
      </div>
      <div v-if="!items.length" class="table-empty">
        <span>◇</span><strong>{{ busy ? "正在检索数据库…" : "没有符合条件的数据" }}</strong
        ><small>启动游戏数据直读并重新登录后，档案会自动出现</small>
      </div>
    </div>
    <div v-if="appending" class="loading-more">
      <span class="loading-spinner">↻</span> 加载更多数据中...
    </div>
  </div>
</template>
