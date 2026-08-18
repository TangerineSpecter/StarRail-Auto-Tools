<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from "vue";
import { pathIconSrc } from "@/shared/catalogue";
import type { CharacterCatalogueEntry } from "@/types";

defineOptions({ name: "CharacterGrid" });

const props = defineProps<{ characters: CharacterCatalogueEntry[] }>();
const emit = defineEmits<{ select: [character: CharacterCatalogueEntry] }>();

const PATH_ORDER = ["毁灭", "巡猎", "智识", "同谐", "虚无", "存护", "丰饶", "记忆", "欢愉"];
const ELEMENT_ORDER = ["物理", "火", "冰", "雷", "风", "量子", "虚数"];

const selectedPath = ref<string>("all");
const selectedElement = ref<string>("all");
const selectedRarity = ref<number | "all">("all");

const animKey = ref(0);
const triggerAnimation = () => {
  animKey.value++;
};
onMounted(triggerAnimation);
onActivated(triggerAnimation);
watch([selectedPath, selectedElement, selectedRarity], triggerAnimation);

const availablePaths = computed(() => {
  const present = new Set(props.characters.map((item) => item.path).filter(Boolean));
  const ordered = PATH_ORDER.filter((path) => present.has(path));
  for (const path of present) {
    if (!ordered.includes(path)) ordered.push(path);
  }
  return ordered;
});

const availableElements = computed(() => {
  const present = new Set(props.characters.map((item) => item.element).filter(Boolean));
  const ordered = ELEMENT_ORDER.filter((elem) => present.has(elem));
  for (const elem of present) {
    if (!ordered.includes(elem)) ordered.push(elem);
  }
  return ordered;
});

const filteredCharacters = computed(() => {
  return props.characters.filter((item) => {
    if (selectedPath.value !== "all" && item.path !== selectedPath.value) {
      return false;
    }
    if (selectedElement.value !== "all" && item.element !== selectedElement.value) {
      return false;
    }
    if (selectedRarity.value !== "all" && item.rarity !== selectedRarity.value) {
      return false;
    }
    return true;
  });
});
</script>
<template>
  <div class="character-catalogue-section">
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
            :class="['catalogue-filter-pill', { active: selectedElement === 'all' }]"
            @click="selectedElement = 'all'"
            @keydown.enter.prevent="selectedElement = 'all'"
            @keydown.space.prevent="selectedElement = 'all'"
          >
            全部属性
          </div>
          <div
            v-for="elem in availableElements"
            :key="elem"
            role="button"
            tabindex="0"
            :class="[
              'catalogue-filter-pill',
              `element-pill-${elem}`,
              { active: selectedElement === elem },
            ]"
            @click="selectedElement = selectedElement === elem ? 'all' : elem"
            @keydown.enter.prevent="selectedElement = selectedElement === elem ? 'all' : elem"
            @keydown.space.prevent="selectedElement = selectedElement === elem ? 'all' : elem"
          >
            {{ elem }}
          </div>
        </div>

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
            v-for="rarity in [5, 4]"
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
      </div>
    </div>

    <!-- 超紧凑左右布局角色网格 -->
    <div v-if="filteredCharacters.length > 0" :key="animKey" class="character-catalogue-grid">
      <button
        v-for="(character, index) in filteredCharacters"
        :key="character.slug"
        :class="[
          'character-catalogue-card',
          `rarity-${character.rarity}`,
          `elem-theme-${character.element}`,
        ]"
        :style="{ '--row-i': Math.floor(index / 4) }"
        type="button"
        aria-haspopup="dialog"
        :aria-label="`查看${character.name}的 80 级基础属性`"
        @click="emit('select', character)"
      >
        <!-- 背景命途水印装饰 -->
        <img
          v-if="character.pathIcon || pathIconSrc(character.path)"
          class="character-card-watermark"
          :src="character.pathIcon || pathIconSrc(character.path)"
          alt=""
          aria-hidden="true"
        />

        <!-- 左侧：贯穿式宽幅立绘切片舱 -->
        <div class="character-portrait-slice">
          <div class="character-portrait-viewport">
            <img
              v-if="character.image"
              class="character-portrait-img"
              :src="character.image"
              :alt="character.name"
            />
            <span v-else class="character-portrait-placeholder">◇</span>
          </div>

          <!-- 12度科技斜切高光金属轨线 -->
          <div class="character-slice-rail" />

          <!-- 底部稀有度流光品质晶条 -->
          <div class="character-slice-rarity-bar" />

          <!-- 嵌合式属性能量晶章 -->
          <div v-if="character.elementIcon" class="character-element-crest">
            <img
              class="character-element-crest-icon"
              :src="character.elementIcon"
              :alt="character.element"
            />
          </div>
        </div>

        <!-- 右侧：两行紧凑信息 -->
        <div class="character-catalogue-body">
          <div class="character-card-top-row">
            <h4 :title="character.name">{{ character.name }}</h4>
            <span class="character-catalogue-stars">{{ "★".repeat(character.rarity ?? 4) }}</span>
          </div>

          <div class="character-card-bottom-row">
            <p class="character-catalogue-meta">
              <img
                v-if="character.pathIcon || pathIconSrc(character.path)"
                class="character-path-icon"
                :src="character.pathIcon || pathIconSrc(character.path)"
                alt=""
              />
              <span>{{ character.path }}</span>
            </p>
            <span :class="['character-element-tag', `elem-tag-${character.element}`]">
              {{ character.element }}
            </span>
          </div>
        </div>
      </button>
    </div>

    <!-- 空状态 -->
    <div v-else class="catalogue-empty">
      <span>◇</span>
      <strong>未找到匹配的角色</strong>
      <p>请尝试更换筛选条件或清空搜索关键词</p>
    </div>
  </div>
</template>
