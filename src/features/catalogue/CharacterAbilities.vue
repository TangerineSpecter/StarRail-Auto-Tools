<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  characterAbilityGroups,
  catalogueAbilityLevels,
  defaultCatalogueAbilityLevel,
  catalogueAbilitySlotLabel,
  catalogueAbilityMechanicStatus,
} from "@/shared/catalogue/mechanics";
import { resolveAbility } from "@/shared/utils/catalogue-rules";
import type { CatalogueAbility } from "@/shared/contracts/catalogue-rules";
import type { CharacterCatalogueEntry } from "@/types";
import AbilityExplanation from "./AbilityExplanation.vue";

interface AbilityDescriptionSegment {
  text: string;
  isParam: boolean;
}

const props = defineProps<{ character: CharacterCatalogueEntry }>();
const selectedLevels = ref<Record<string, number>>({});

const groups = computed(() =>
  characterAbilityGroups(props.character).filter(
    (group) =>
      group.sourceKind !== "trace" &&
      !group.abilities.every(
        (ability) => ability.slot === "trace" || ability.groupId.startsWith("servant-traces"),
      ),
  ),
);

const availableCategories = computed(() => {
  const categories: Array<{ key: string; label: string }> = [];
  const hasSkills = groups.value.some((g) => g.sourceKind === "character");
  const hasEidolons = groups.value.some((g) => g.sourceKind === "eidolon");
  const hasSummons = groups.value.some((g) => g.sourceKind === "summon");

  if (hasSkills) categories.push({ key: "character", label: "角色技能" });
  if (hasEidolons) categories.push({ key: "eidolon", label: "角色星魂" });
  if (hasSummons) categories.push({ key: "summon", label: "忆灵能力" });

  return categories;
});

const activeCategory = ref<string>("character");

function updateActiveCategory() {
  const hasSkills = groups.value.some((g) => g.sourceKind === "character");
  if (hasSkills) {
    activeCategory.value = "character";
  } else if (groups.value.length > 0) {
    activeCategory.value = groups.value[0].sourceKind;
  }
}

updateActiveCategory();

watch(
  () => props.character.slug,
  () => {
    selectedLevels.value = {};
    updateActiveCategory();
  },
);

function resolveAbilitySegments(
  ability: CatalogueAbility,
  level: number | null,
): { description: string; segments: AbilityDescriptionSegment[] } {
  const resolved = resolveAbility(ability, level ?? undefined);
  const template = ability.descriptionTemplate ?? "";

  const segments: AbilityDescriptionSegment[] = [];
  const regex = /\{([^{}:]+)(?::([^{}]+))?\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      segments.push({
        text: template.slice(lastIndex, matchIndex),
        isParam: false,
      });
    }

    const key = match[1];
    const format = match[2];
    const value = resolved.parameters ? resolved.parameters[key] : undefined;
    let formattedValue = "?";

    if (typeof value === "number") {
      if (format === "integer") formattedValue = String(Math.round(value));
      else if (format === "percentInteger") formattedValue = `${Math.round(value * 100)}%`;
      else if (format === "percentFixed1") formattedValue = `${(value * 100).toFixed(1)}%`;
      else if (format === "percentFixed2") formattedValue = `${(value * 100).toFixed(2)}%`;
      else if (format === "percent") formattedValue = `${Number((value * 100).toFixed(8))}%`;
      else if (format === "fixed1") formattedValue = value.toFixed(1);
      else if (format === "fixed2") formattedValue = value.toFixed(2);
      else formattedValue = String(value);
    } else if (typeof value === "string") {
      formattedValue = value;
    }

    segments.push({
      text: formattedValue,
      isParam: true,
    });

    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < template.length) {
    segments.push({
      text: template.slice(lastIndex),
      isParam: false,
    });
  }

  if (segments.length === 0) {
    segments.push({ text: resolved.description, isParam: false });
  }

  return {
    description: resolved.description,
    segments,
  };
}

const displayedGroups = computed(() =>
  groups.value.map((group) => ({
    ...group,
    abilities: group.abilities.map((ability, index) => {
      const levels = catalogueAbilityLevels(ability);
      const selected = selectedLevels.value[ability.id];
      const level =
        selected != null && levels.includes(selected)
          ? selected
          : defaultCatalogueAbilityLevel(ability);
      const eidolonRank =
        ability.sourceKind === "eidolon" ? Number(ability.sourceNodeId) || index + 1 : null;

      const { description, segments } = resolveAbilitySegments(ability, level);

      return {
        ability,
        levels,
        level,
        eidolonRank,
        description,
        segments,
        mechanicStatus: catalogueAbilityMechanicStatus(ability),
      };
    }),
  })),
);

function getSlotBadgeClass(slot: string): string {
  switch (slot) {
    case "basic":
      return "slot-badge--basic";
    case "skill":
      return "slot-badge--skill";
    case "ult":
      return "slot-badge--ult";
    case "talent":
      return "slot-badge--talent";
    case "technique":
      return "slot-badge--technique";
    default:
      return "slot-badge--other";
  }
}

function onSliderInput(abilityId: string, levels: readonly number[], index: number) {
  const targetLevel = levels[index];
  if (targetLevel != null) {
    selectedLevels.value[abilityId] = targetLevel;
  }
}

function stepLevel(
  abilityId: string,
  levels: readonly number[],
  currentLevel: number | null,
  delta: number,
) {
  const safeCurrent = currentLevel ?? levels[0];
  const currentIndex = levels.indexOf(safeCurrent);
  const nextIndex = Math.max(0, Math.min(levels.length - 1, currentIndex + delta));
  const targetLevel = levels[nextIndex];
  if (targetLevel != null) {
    selectedLevels.value[abilityId] = targetLevel;
  }
}
</script>

<template>
  <section
    v-if="displayedGroups.length"
    class="catalogue-character-abilities"
    aria-label="技能与机制图鉴"
  >
    <!-- 顶部主分段切换栏 -->
    <header class="abilities-header">
      <nav
        v-if="availableCategories.length > 1"
        class="category-tabs"
        role="tablist"
        aria-label="能力分类"
      >
        <button
          v-for="cat in availableCategories"
          :key="cat.key"
          type="button"
          role="tab"
          :aria-selected="activeCategory === cat.key"
          :class="['category-tab', { active: activeCategory === cat.key }]"
          @click="activeCategory = cat.key"
        >
          {{ cat.label }}
        </button>
      </nav>
      <small class="header-hint">图鉴等级默认为 1 级，不代表账号培养状态</small>
    </header>

    <div class="abilities-stack">
      <section
        v-for="group in displayedGroups"
        :key="group.id"
        class="catalogue-ability-group"
        :class="{
          'is-filtered-out': group.sourceKind !== activeCategory,
        }"
        :data-owner-id="group.ownerId"
        :data-source-kind="group.sourceKind"
      >
        <div class="abilities-list">
          <article
            v-for="item in group.abilities"
            :key="item.ability.id"
            class="catalogue-ability"
            :class="[
              group.sourceKind === 'eidolon'
                ? 'catalogue-ability--eidolon'
                : 'catalogue-ability--skill',
            ]"
            :data-ability-id="item.ability.id"
            :data-group-id="item.ability.groupId"
          >
            <!-- 星魂展示卡片（单列通栏秩序流） -->
            <template v-if="group.sourceKind === 'eidolon'">
              <div class="eidolon-card-main">
                <div class="eidolon-badge" :aria-label="`星魂第${item.eidolonRank}阶`">
                  <span>E{{ item.eidolonRank }}</span>
                </div>

                <div class="eidolon-body">
                  <header class="eidolon-header">
                    <span class="eidolon-rank-label">第 {{ item.eidolonRank }} 阶</span>
                    <h5>{{ item.ability.name }}</h5>
                  </header>

                  <p class="ability-desc">
                    <template v-for="(seg, sIdx) in item.segments" :key="sIdx">
                      <span v-if="seg.isParam" class="ability-param-tag">{{ seg.text }}</span>
                      <template v-else>{{ seg.text }}</template>
                    </template>
                  </p>

                  <footer class="ability-footer">
                    <small
                      class="catalogue-ability-audit"
                      :title="item.mechanicStatus.detail"
                      :data-stage="item.mechanicStatus.stage"
                      >{{ item.mechanicStatus.label }}</small
                    >
                  </footer>
                  <AbilityExplanation :ability="item.ability" :level="item.level" />
                </div>
              </div>
            </template>

            <!-- 主要技能 / 召唤物技能展示卡片（单列通栏舒展流） -->
            <template v-else>
              <header class="skill-header">
                <div class="skill-identity">
                  <span
                    v-if="catalogueAbilitySlotLabel(item.ability.slot)"
                    :class="['skill-slot-badge', getSlotBadgeClass(item.ability.slot)]"
                  >
                    {{ catalogueAbilitySlotLabel(item.ability.slot) }}
                  </span>
                  <h5>{{ item.ability.name }}</h5>
                </div>

                <div v-if="item.levels.length > 1" class="catalogue-level-control">
                  <span class="level-control-label">图鉴等级</span>

                  <div class="level-slider-container">
                    <button
                      type="button"
                      class="level-step-btn"
                      :disabled="item.levels.indexOf(item.level ?? item.levels[0]) <= 0"
                      aria-label="降低等级"
                      title="降低一级"
                      @click="stepLevel(item.ability.id, item.levels, item.level, -1)"
                    >
                      −
                    </button>

                    <div class="level-track-wrapper">
                      <input
                        type="range"
                        class="level-range-input"
                        :min="0"
                        :max="item.levels.length - 1"
                        :step="1"
                        :value="item.levels.indexOf(item.level ?? item.levels[0])"
                        :aria-label="`${item.ability.name}图鉴等级滑动条`"
                        :style="{
                          '--track-pct': `${(Math.max(0, item.levels.indexOf(item.level ?? item.levels[0])) / Math.max(1, item.levels.length - 1)) * 100}%`,
                        }"
                        @input="
                          onSliderInput(
                            item.ability.id,
                            item.levels,
                            Number(($event.target as HTMLInputElement).value),
                          )
                        "
                      />
                    </div>

                    <button
                      type="button"
                      class="level-step-btn"
                      :disabled="
                        item.levels.indexOf(item.level ?? item.levels[0]) >= item.levels.length - 1
                      "
                      aria-label="提升等级"
                      title="提升一级"
                      @click="stepLevel(item.ability.id, item.levels, item.level, 1)"
                    >
                      +
                    </button>
                  </div>

                  <label class="level-badge-trigger" :title="`当前 Lv.${item.level}，点击快速选择`">
                    <span class="level-val-text">Lv.{{ item.level }}</span>
                    <select
                      :value="item.level"
                      :aria-label="`${item.ability.name}图鉴等级`"
                      class="level-hidden-select"
                      @change="
                        selectedLevels[item.ability.id] = Number(
                          ($event.target as HTMLSelectElement).value,
                        )
                      "
                    >
                      <option v-for="level in item.levels" :key="level" :value="level">
                        Lv.{{ level }}
                      </option>
                    </select>
                  </label>
                </div>
              </header>

              <p class="ability-desc">
                <template v-for="(seg, sIdx) in item.segments" :key="sIdx">
                  <span v-if="seg.isParam" class="ability-param-tag">{{ seg.text }}</span>
                  <template v-else>{{ seg.text }}</template>
                </template>
              </p>

              <footer class="ability-footer">
                <small
                  class="catalogue-ability-audit"
                  :title="item.mechanicStatus.detail"
                  :data-stage="item.mechanicStatus.stage"
                  >{{ item.mechanicStatus.label }}</small
                >
              </footer>
              <AbilityExplanation :ability="item.ability" :level="item.level" />
            </template>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.catalogue-character-abilities {
  margin-top: 22px;
  color: var(--ink, #172643);
}

/* 顶部主分段切换控制 */
.abilities-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(48, 75, 117, 0.12);
}

.category-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  background: rgba(228, 237, 248, 0.65);
  border: 1px solid rgba(48, 75, 117, 0.12);
  border-radius: 8px;
}

.category-tab {
  border: none;
  background: transparent;
  padding: 4px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-soft, #52627b);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.category-tab:hover {
  color: var(--blue, #2456a6);
  background: rgba(255, 255, 255, 0.5);
}

.category-tab.active {
  background: #172643;
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(23, 38, 67, 0.2);
}

.header-hint {
  font-size: 11px;
  color: var(--muted, #8794a8);
}

/* 分组容器与单列卡片栈 */
.abilities-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.catalogue-ability-group.is-filtered-out {
  display: none !important;
}

.abilities-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 通用通栏卡片 */
.catalogue-ability {
  position: relative;
  border-radius: 8px;
  background: linear-gradient(145deg, #ffffff 0%, #f9fbfd 100%);
  border: 1px solid rgba(48, 75, 117, 0.12);
  box-shadow: 0 2px 6px rgba(27, 49, 85, 0.03);
  padding: 12px 14px;
  transition: all 0.2s ease-out;
}

.catalogue-ability:hover {
  border-color: rgba(36, 86, 166, 0.28);
  box-shadow: 0 4px 12px rgba(27, 49, 85, 0.06);
}

/* 主要技能卡片头部 */
.skill-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.skill-identity {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.skill-identity h5 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--ink, #172643);
  letter-spacing: 0.01em;
}

/* 低饱和度精致技能 Badge */
.skill-slot-badge {
  display: inline-flex;
  align-items: center;
  padding: 1.5px 7px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.3;
}

.slot-badge--basic {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}

.slot-badge--skill {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}

.slot-badge--ult {
  background: #fffbeb;
  color: #b45309;
  border: 1px solid #fde68a;
}

.slot-badge--talent {
  background: #faf5ff;
  color: #6d28d9;
  border: 1px solid #e9d5ff;
}

.slot-badge--technique {
  background: #f0fdf4;
  color: #047857;
  border: 1px solid #bbf7d0;
}

.slot-badge--other {
  background: #f8fafc;
  color: #64748b;
  border: 1px solid #e2e8f0;
}

/* 现代可拖动等级进度条控件 */
.catalogue-level-control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.level-control-label {
  font-size: 11px;
  color: var(--muted, #8794a8);
}

.level-slider-container {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 4px;
  background: rgba(235, 242, 250, 0.7);
  border: 1px solid rgba(48, 75, 117, 0.16);
  border-radius: 14px;
}

.level-step-btn {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: #ffffff;
  color: var(--blue, #2456a6);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  user-select: none;
  transition: all 0.15s ease;
}

.level-step-btn:hover:not(:disabled) {
  background: var(--blue, #2456a6);
  color: #ffffff;
}

.level-step-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  box-shadow: none;
}

.level-track-wrapper {
  position: relative;
  width: 86px;
  height: 18px;
  display: flex;
  align-items: center;
}

.level-range-input {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 18px;
  background: transparent;
  margin: 0;
  padding: 0;
  border: none;
  outline: none;
  cursor: pointer;
}

/* WebKit / Safari / Blink 轨道与高亮进度 */
.level-range-input::-webkit-slider-runnable-track {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    var(--blue, #2456a6) 0%,
    var(--blue, #2456a6) var(--track-pct, 0%),
    rgba(48, 75, 117, 0.18) var(--track-pct, 0%),
    rgba(48, 75, 117, 0.18) 100%
  );
  border: none;
}

/* WebKit / Safari / Blink 滑块 */
.level-range-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffffff;
  border: 2.5px solid var(--blue, #2456a6);
  box-shadow: 0 1px 4px rgba(23, 61, 122, 0.28);
  cursor: grab;
  margin-top: -5px; /* (14px - 4px) / -2 = -5px 垂直居中对齐 */
  transition:
    transform 0.12s ease,
    border-color 0.12s ease,
    box-shadow 0.12s ease;
}

.level-range-input::-webkit-slider-thumb:hover,
.level-range-input::-webkit-slider-thumb:active {
  transform: scale(1.15);
  border-color: #1d4ed8;
  box-shadow: 0 2px 6px rgba(29, 78, 216, 0.35);
  cursor: grabbing;
}

/* Firefox 轨道与滑块 */
.level-range-input::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: rgba(48, 75, 117, 0.18);
  border: none;
}

.level-range-input::-moz-range-progress {
  height: 4px;
  border-radius: 2px;
  background: var(--blue, #2456a6);
}

.level-range-input::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffffff;
  border: 2.5px solid var(--blue, #2456a6);
  box-shadow: 0 1px 4px rgba(23, 61, 122, 0.28);
  cursor: grab;
}

.level-badge-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 46px;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(36, 86, 166, 0.08);
  border: 1px solid rgba(36, 86, 166, 0.22);
  cursor: pointer;
  transition: all 0.2s;
}

.level-badge-trigger:hover {
  background: rgba(36, 86, 166, 0.14);
  border-color: var(--blue, #2456a6);
}

.level-val-text {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--blue, #2456a6);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.level-hidden-select {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

/* 技能与星魂正文描述 */
.ability-desc {
  margin: 9px 0 0;
  color: #334155;
  font-size: 12.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 内嵌数据胶囊 (Refined Data Pill) */
.ability-param-tag {
  display: inline-block;
  padding: 0.5px 4.5px;
  margin: 0 1.5px;
  border-radius: 3.5px;
  font-size: 11.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: rgba(36, 86, 166, 0.08);
  border: 1px solid rgba(36, 86, 166, 0.2);
  color: #1e40af;
  line-height: 1.35;
  vertical-align: baseline;
}

/* 底部状态 */
.ability-footer {
  margin-top: 6px;
  display: flex;
  justify-content: flex-end;
}

.catalogue-ability-audit {
  color: #94a3b8;
  font-size: 10.5px;
}

/* ============================
   星魂通栏卡片 (Eidolon Card)
   ============================ */
.eidolon-card-main {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 12px;
  align-items: flex-start;
}

.eidolon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #172643;
  border: 1.5px solid #d4af37;
  box-shadow: 0 2px 6px rgba(23, 38, 67, 0.2);
}

.eidolon-badge span {
  font-size: 13px;
  font-weight: 800;
  color: #fce7b0;
  letter-spacing: 0.02em;
}

.eidolon-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.eidolon-header {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}

.eidolon-rank-label {
  font-size: 11px;
  font-weight: 700;
  color: #9a7839;
}

.eidolon-header h5 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--ink, #172643);
}

@media (max-width: 480px) {
  .eidolon-card-main {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
