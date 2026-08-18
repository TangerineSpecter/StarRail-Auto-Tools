<script setup lang="ts">
import { computed, ref } from "vue";
import { pathIconSrc } from "@/shared/catalogue";
import type { LightConeCatalogueEntry } from "@/types";
import { ownedCountOf } from "./owned-counts";

const props = defineProps<{
  lightCones: LightConeCatalogueEntry[];
  ownedCounts: Map<number, number>;
}>();
const emit = defineEmits<{ select: [lightCone: LightConeCatalogueEntry] }>();

const PATH_ORDER = ["毁灭", "巡猎", "智识", "同谐", "虚无", "存护", "丰饶", "记忆", "欢愉"];

const selectedPath = ref<string>("all");
const selectedRarity = ref<number | "all">("all");
const selectedOwned = ref<"all" | "owned" | "unowned">("all");
const searchQuery = ref("");

const availablePaths = computed(() => {
  const present = new Set(props.lightCones.map((item) => item.path).filter(Boolean));
  const ordered = PATH_ORDER.filter((path) => present.has(path));
  for (const path of present) {
    if (!ordered.includes(path)) ordered.push(path);
  }
  return ordered;
});

const ownedCount = (id: number) => ownedCountOf(props.ownedCounts, id);

const filteredLightCones = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return props.lightCones.filter((item) => {
    if (selectedPath.value !== "all" && item.path !== selectedPath.value) {
      return false;
    }
    if (selectedRarity.value !== "all" && item.rarity !== selectedRarity.value) {
      return false;
    }
    const count = ownedCount(item.id);
    if (selectedOwned.value === "owned" && count <= 0) {
      return false;
    }
    if (selectedOwned.value === "unowned" && count > 0) {
      return false;
    }
    if (query && !item.name.toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });
});
</script>
<template>
  <div class="lightcone-catalogue-section">
    <!-- 极简单行紧凑过滤工具栏 -->
    <div class="catalogue-filter-bar compact-toolbar">
      <div class="catalogue-filter-group">
        <div
          role="button"
          tabindex="0"
          :class="['catalogue-filter-pill', { active: selectedPath === 'all' }]"
          @click="selectedPath = 'all'"
          @keydown.enter.prevent="selectedPath = 'all'"
          @keydown.space.prevent="selectedPath = 'all'"
        >
          全部命途
        </div>
        <div
          v-for="path in availablePaths"
          :key="path"
          role="button"
          tabindex="0"
          :class="['catalogue-filter-pill', { active: selectedPath === path }]"
          @click="selectedPath = selectedPath === path ? 'all' : path"
          @keydown.enter.prevent="selectedPath = selectedPath === path ? 'all' : path"
          @keydown.space.prevent="selectedPath = selectedPath === path ? 'all' : path"
        >
          <img v-if="pathIconSrc(path)" :src="pathIconSrc(path)" alt="" class="filter-path-icon" />
          <span>{{ path }}</span>
        </div>
      </div>

      <div class="catalogue-filter-group catalogue-filter-right">
        <div class="catalogue-filter-subgroup">
          <div
            role="button"
            tabindex="0"
            :class="['catalogue-filter-pill', { active: selectedRarity === 'all' }]"
            @click="selectedRarity = 'all'"
            @keydown.enter.prevent="selectedRarity = 'all'"
            @keydown.space.prevent="selectedRarity = 'all'"
          >
            全部星级
          </div>
          <div
            v-for="rarity in [5, 4, 3]"
            :key="rarity"
            role="button"
            tabindex="0"
            :class="[
              'catalogue-filter-pill',
              `rarity-pill-${rarity}`,
              { active: selectedRarity === rarity },
            ]"
            @click="selectedRarity = selectedRarity === rarity ? 'all' : rarity"
            @keydown.enter.prevent="selectedRarity = selectedRarity === rarity ? 'all' : rarity"
            @keydown.space.prevent="selectedRarity = selectedRarity === rarity ? 'all' : rarity"
          >
            {{ rarity }}★
          </div>
        </div>

        <div class="catalogue-filter-subgroup">
          <div
            role="button"
            tabindex="0"
            :class="['catalogue-filter-pill', { active: selectedOwned === 'all' }]"
            @click="selectedOwned = 'all'"
            @keydown.enter.prevent="selectedOwned = 'all'"
            @keydown.space.prevent="selectedOwned = 'all'"
          >
            全部
          </div>
          <div
            role="button"
            tabindex="0"
            :class="['catalogue-filter-pill', { active: selectedOwned === 'owned' }]"
            @click="selectedOwned = selectedOwned === 'owned' ? 'all' : 'owned'"
            @keydown.enter.prevent="selectedOwned = selectedOwned === 'owned' ? 'all' : 'owned'"
            @keydown.space.prevent="selectedOwned = selectedOwned === 'owned' ? 'all' : 'owned'"
          >
            已持有
          </div>
          <div
            role="button"
            tabindex="0"
            :class="['catalogue-filter-pill', { active: selectedOwned === 'unowned' }]"
            @click="selectedOwned = selectedOwned === 'unowned' ? 'all' : 'unowned'"
            @keydown.enter.prevent="selectedOwned = selectedOwned === 'unowned' ? 'all' : 'unowned'"
            @keydown.space.prevent="selectedOwned = selectedOwned === 'unowned' ? 'all' : 'unowned'"
          >
            未持有
          </div>
        </div>

        <div class="catalogue-search-box">
          <input
            v-model="searchQuery"
            type="search"
            placeholder="搜索光锥..."
            class="catalogue-search-input"
          />
        </div>
      </div>
    </div>

    <!-- 超紧凑左右布局光锥网格 -->
    <div v-if="filteredLightCones.length > 0" class="lightcone-catalogue-grid">
      <button
        v-for="item in filteredLightCones"
        :key="item.id"
        :class="['lightcone-catalogue-card', `rarity-${item.rarity}`]"
        type="button"
        aria-haspopup="dialog"
        :aria-label="`查看${item.name}的图鉴信息`"
        @click="emit('select', item)"
      >
        <!-- 左侧：紧凑方形缩略图 -->
        <div class="lightcone-catalogue-thumb">
          <img
            v-if="item.image"
            class="lightcone-catalogue-art"
            :src="item.image"
            :alt="item.name"
          />
          <span v-else class="lightcone-catalogue-art catalogue-placeholder">◇</span>
        </div>

        <!-- 右侧：紧凑两行信息 -->
        <div class="lightcone-catalogue-body">
          <div class="lightcone-card-top-row">
            <h4 :title="item.name">{{ item.name }}</h4>
            <small :class="['catalogue-owned', { empty: ownedCount(item.id) === 0 }]">
              <template v-if="ownedCount(item.id) > 0"
                >持有 <b>{{ ownedCount(item.id) }}</b> 把</template
              >
              <template v-else>未持有</template>
            </small>
          </div>

          <div class="lightcone-card-bottom-row">
            <p class="lightcone-catalogue-meta">
              <img
                v-if="item.path"
                class="lightcone-catalogue-path-icon"
                :src="pathIconSrc(item.path)"
                alt=""
              />
              <span>{{ item.path }}</span>
            </p>
            <p class="lightcone-catalogue-stars">{{ "★".repeat(item.rarity) }}</p>
          </div>
        </div>
      </button>
    </div>

    <!-- 空状态 -->
    <div v-else class="catalogue-empty">
      <span>◇</span>
      <strong>未找到匹配的光锥</strong>
      <p>请尝试更换筛选条件或清空搜索关键词</p>
    </div>
  </div>
</template>
