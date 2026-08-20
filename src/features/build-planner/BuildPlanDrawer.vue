<script setup lang="ts">
import { computed, onMounted, onUnmounted, toRef } from "vue";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import InputNumber from "primevue/inputnumber";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import RelicSetCardPicker from "./RelicSetCardPicker.vue";
import SubstatWeightEditor from "./SubstatWeightEditor.vue";
import { useBuildPlanEditor } from "./useBuildPlanEditor";
import {
  relicMainStats,
  relicSubStats,
  selectableMainStatSlots,
  slotLabel,
  statLabel,
} from "@/shared/catalogue/relic-options";
import { formatBuildProgressValue } from "./progress";

const props = defineProps<{ characterId: number }>();
const emit = defineEmits<{
  close: [];
  error: [message: string];
  notice: [message: string];
  deleted: [];
}>();
const editor = useBuildPlanEditor({
  characterId: toRef(props, "characterId"),
  setError: (message) => emit("error", message),
  setNotice: (message) => emit("notice", message),
  onDeleted: () => emit("deleted"),
  onSaved: () => emit("close"),
});
const progressPercent = (progress: { current: number; target: number }) =>
  progress.target <= 0
    ? 100
    : Math.min(100, Math.max(0, (progress.current / progress.target) * 100));
const targetStatOptions = computed(() =>
  relicSubStats.map((stat) => ({ label: statLabel(stat), value: stat })),
);

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === "Escape" && !event.isComposing) emit("close");
}
onMounted(() => window.addEventListener("keydown", closeOnEscape));
onUnmounted(() => window.removeEventListener("keydown", closeOnEscape));
</script>
<template>
  <div class="detail-backdrop build-backdrop" @click.self="emit('close')">
    <aside class="detail-drawer build-drawer">
      <header>
        <div>
          <p class="eyebrow">BUILD BLUEPRINT</p>
          <h2>培养方案 / 毕业目标</h2>
          <small>属性统计包含已换算的主词条与同步的副词条。</small>
        </div>
        <button type="button" aria-label="关闭培养方案" @click="emit('close')">×</button>
      </header>
      <div v-if="editor.loading.value" class="detail-loading">正在读取培养方案…</div>
      <div v-else class="build-scroll">
        <section class="build-section">
          <h3>套装结构</h3>
          <div class="build-structure">
            <div class="build-cavern-mode-field">
              <span>四件遗器区</span>
              <div class="build-cavern-mode" role="radiogroup" aria-label="四件遗器区套装模式">
                <button
                  type="button"
                  role="radio"
                  :aria-checked="editor.plan.cavernMode === 'fourPiece'"
                  :class="{ selected: editor.plan.cavernMode === 'fourPiece' }"
                  @click="editor.setCavernMode('fourPiece')"
                >
                  4 件套
                </button>
                <button
                  type="button"
                  role="radio"
                  :aria-checked="editor.plan.cavernMode === 'twoPlusTwo'"
                  :class="{ selected: editor.plan.cavernMode === 'twoPlusTwo' }"
                  @click="editor.setCavernMode('twoPlusTwo')"
                >
                  2+2 件套
                </button>
              </div>
            </div>
            <div class="build-set-selections">
              <div class="build-cavern-set-primary">
                <RelicSetCardPicker
                  :model-value="editor.plan.cavernSetA"
                  :label="editor.plan.cavernMode === 'fourPiece' ? '四件套' : '第一组 2 件套'"
                  :options="editor.cavernSets"
                  @update:model-value="editor.setCavernSetA"
                />
              </div>
              <div
                v-if="editor.plan.cavernMode === 'twoPlusTwo'"
                class="build-cavern-set-secondary"
              >
                <RelicSetCardPicker
                  v-model="editor.plan.cavernSetB"
                  label="第二组 2 件套"
                  :options="editor.cavernSets.filter((set) => set.setId !== editor.plan.cavernSetA)"
                />
              </div>
              <div class="build-planar-set-picker">
                <RelicSetCardPicker
                  v-model="editor.plan.planarSetId"
                  label="位面饰品 2 件套"
                  :options="editor.planarSets"
                />
              </div>
            </div>
          </div>
        </section>
        <section class="build-section">
          <h3>各部位允许主词条</h3>
          <p class="main-stat-fixed-note">
            头部 / 手部主词条由游戏固定（生命值 / 攻击力），无需设置目标。
          </p>
          <div class="main-stat-grid">
            <fieldset v-for="slot in selectableMainStatSlots" :key="slot.value">
              <legend>{{ slot.label }}</legend>
              <label
                v-for="stat in relicMainStats[slot.value] ?? []"
                :key="stat"
                class="filter-chip"
                ><input
                  v-model="editor.plan.mainStats[slot.value]"
                  type="checkbox"
                  :value="stat"
                /><span>{{ statLabel(stat) }}</span></label
              >
            </fieldset>
          </div>
        </section>
        <section class="build-section">
          <div class="build-section-heading">
            <h3>属性目标 <small>按顺序决定优先级</small></h3>
            <button
              type="button"
              class="row-action"
              :disabled="editor.plan.targets.length >= 3"
              @click="editor.addTarget"
            >
              + 添加
            </button>
          </div>
          <div class="target-column-headings" aria-hidden="true">
            <span /><span /><span>属性</span><span>目标</span><span>最低标准</span><span />
          </div>
          <div
            v-for="(target, index) in editor.plan.targets"
            :key="index"
            :data-target-index="index"
            :class="[
              'target-row',
              {
                dragging: editor.draggedTargetIndex.value === index,
                'drag-over':
                  editor.draggedTargetIndex.value !== null &&
                  editor.dragTargetIndex.value === index &&
                  editor.draggedTargetIndex.value !== index,
              },
            ]"
          >
            <span
              class="drag-handle"
              title="按住拖拽以调整优先级"
              @pointerdown="editor.beginTargetDrag($event, index)"
              >⠿</span
            ><b>P{{ index + 1 }}</b
            ><Select
              v-model="target.statKey"
              :options="targetStatOptions"
              option-label="label"
              option-value="value"
              aria-label="属性"
            /><label aria-label="目标"><InputNumber v-model="target.target" :min="0" /></label
            ><label aria-label="最低标准"
              ><InputNumber v-model="target.minimum" :min="0" :max="target.target" /></label
            ><Button
              class="target-remove"
              type="button"
              severity="danger"
              text
              aria-label="删除属性目标"
              @click="editor.removeTarget(index)"
              >×</Button
            >
          </div>
          <div class="effective-substats-config">
            <h4>有效副词条 <small>用于毕业管理页统计当前装备的强化次数</small></h4>
            <div class="filter-chips">
              <label v-for="stat in relicSubStats" :key="stat" class="filter-chip"
                ><input
                  v-model="editor.plan.effectiveSubstats"
                  type="checkbox"
                  :value="stat"
                /><span>{{ statLabel(stat) }}</span></label
              >
            </div>
          </div>
        </section>
        <section class="build-section">
          <h3>词条权重 / Stat Score</h3>
          <SubstatWeightEditor
            v-model="editor.plan.substatWeights"
            v-model:min-potential-pct="editor.plan.minPotentialPct"
            v-model:spd-target="editor.plan.spdTarget"
            :effective-substats="editor.plan.effectiveSubstats"
          />
        </section>
        <section v-if="editor.recommendation.value" class="build-section build-results">
          <h3>当前进度</h3>
          <div
            v-for="progress in editor.recommendation.value.current"
            :key="progress.statKey"
            class="progress-row"
          >
            <div>
              <b>{{ statLabel(progress.statKey) }}</b
              ><span
                >{{ formatBuildProgressValue(progress.statKey, progress.current) }} /
                {{ progress.target }}</span
              >
            </div>
            <i><em :style="{ width: `${progressPercent(progress)}%` }" /></i
            ><small>{{
              progress.gap
                ? `缺 ${formatBuildProgressValue(progress.statKey, progress.gap)}`
                : "已达标"
            }}</small>
          </div>
          <h3>推荐组合</h3>
          <p class="build-message">{{ editor.recommendation.value.message }}</p>
          <div v-if="editor.recommendation.value.recommended" class="recommend-list">
            <div v-for="item in editor.recommendation.value.recommended" :key="item.itemId">
              <b>{{ slotLabel(item.slot) }}</b
              ><span>{{ item.name }} · {{ statLabel(item.mainStat) }}</span
              ><small v-if="item.borrowed">借用：{{ item.location }}</small>
            </div>
          </div>
          <div v-if="editor.recommendation.value.recommendedProgress" class="recommended-summary">
            <span
              v-for="progress in editor.recommendation.value.recommendedProgress"
              :key="progress.statKey"
              >{{ statLabel(progress.statKey) }}
              {{ formatBuildProgressValue(progress.statKey, progress.current)
              }}<b v-if="progress.gap">
                · 缺 {{ formatBuildProgressValue(progress.statKey, progress.gap) }}</b
              ></span
            >
          </div>
        </section>
        <section class="build-section build-note-section">
          <h3>说明</h3>
          <label class="build-note-field">
            <span class="visually-hidden">毕业目标说明</span>
            <Textarea
              v-model="editor.plan.note"
              class="build-note-input"
              rows="3"
              auto-resize
              maxlength="500"
              placeholder="可选：补充培养备注，例如优先级、配队用途或词条取舍"
              aria-label="毕业目标说明"
            />
          </label>
          <small class="build-note-hint">保存后会在毕业管理角色卡片中直接展示。</small>
        </section>
      </div>
      <footer class="build-actions" :aria-busy="editor.saving.value || editor.calculating.value">
        <label class="include-equipped"
          ><Checkbox v-model="editor.includeEquipped.value" binary /> 纳入已装备遗器</label
        ><span /><Button
          :class="['filter-reset', { 'confirm-delete': editor.deleteArmed.value }]"
          type="button"
          outlined
          @click="editor.remove"
          >{{ editor.deleteArmed.value ? "再次点击确认" : "删除方案" }}</Button
        ><Button
          class="filter-submit"
          type="button"
          :disabled="editor.saving.value || editor.calculating.value"
          @click="editor.save"
          >{{ editor.saving.value ? "保存中…" : "保存" }}</Button
        ><Button
          class="filter-submit"
          type="button"
          :disabled="!editor.plan.characterId || editor.saving.value || editor.calculating.value"
          @click="editor.calculate"
          >{{ editor.calculating.value ? "计算中…" : "重新计算" }}</Button
        >
      </footer>
    </aside>
  </div>
</template>
