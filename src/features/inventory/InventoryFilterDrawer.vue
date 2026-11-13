<script setup lang="ts">
import { useMobileView } from "@/shared/contracts/mobile-view";
import { computed, watch } from "vue";
import Button from "primevue/button";
import Drawer from "primevue/drawer";
import Select from "primevue/select";
import MobileSegmentedControl from "@/shared/ui/MobileSegmentedControl.vue";
import { useSheetDragDismiss } from "@/shared/ui/useSheetDragDismiss";
import type { InventoryKind } from "@/types";
import type { InventoryFilterForm } from "./filter";
import { relicMainStats, relicSlots, relicSubStats, statLabel } from "./options";
import FilterCheckIcon from "./FilterCheckIcon.vue";

const mobile = useMobileView();
const props = withDefaults(
  defineProps<{ kind: InventoryKind; busy: boolean; extraFilterCount?: number }>(),
  { extraFilterCount: 0 },
);
const filters = defineModel<InventoryFilterForm>("filters", { required: true });
const visible = defineModel<boolean>({ required: true });
const emit = defineEmits<{ apply: []; reset: [] }>();
const sheetDrag = useSheetDragDismiss(() => {
  visible.value = false;
});
watch(visible, (open) => {
  if (!open) sheetDrag.reset();
});
const availableMainStats = computed(() => {
  const slots = filters.value.slots.length
    ? filters.value.slots
    : relicSlots.map((slot) => slot.value);
  return [...new Set(slots.flatMap((slot) => relicMainStats[slot] ?? []))];
});
const lockedOptions = [
  { label: "全部", value: "" },
  { label: "已锁定", value: "true" },
  { label: "未锁定", value: "false" },
];
const discardOptions = [
  { label: "全部", value: "" },
  { label: "已弃置", value: "true" },
  { label: "未弃置", value: "false" },
];
const equippedOptions = [
  { label: "全部", value: "" },
  { label: "已装备", value: "true" },
  { label: "未装备", value: "false" },
];
const buildPlanOptions = [
  { label: "全部", value: "" },
  { label: "已设置", value: "true" },
  { label: "未设置", value: "false" },
];
const draftFilterCount = computed(() => {
  const form = filters.value;
  const baseValues =
    props.kind === "relic"
      ? [
          form.slots.length > 0,
          form.mainStats.length > 0,
          form.subStats.length > 0,
          String(form.minSubstatCount).trim() !== "",
          String(form.maxSubstatCount).trim() !== "",
          form.locked !== "",
          form.discard !== "",
          form.equipped !== "",
        ]
      : props.kind === "lightCone"
        ? [form.superimposition.length > 0, form.locked !== "", form.equipped !== ""]
        : [
            form.path.length > 0,
            form.eidolon.length > 0,
            form.element.length > 0,
            form.buildPlan !== "",
          ];
  return baseValues.filter(Boolean).length + props.extraFilterCount;
});
const paths = [
  { label: "毁灭", value: "Destruction" },
  { label: "巡猎", value: "Hunt" },
  { label: "智识", value: "Erudition" },
  { label: "同谐", value: "Harmony" },
  { label: "虚无", value: "Nihility" },
  { label: "存护", value: "Preservation" },
  { label: "丰饶", value: "Abundance" },
  { label: "记忆", value: "Remembrance" },
  { label: "欢愉", value: "Elation" },
];
const elements = [
  { label: "物理", color: "#888888" },
  { label: "火", color: "#f44336" },
  { label: "冰", color: "#29b6f6" },
  { label: "雷", color: "#ab47bc" },
  { label: "风", color: "#26a69a" },
  { label: "量子", color: "#26c6da" },
  { label: "虚数", color: "#ffa726" },
];
const substatCountOptions = [
  { label: "不限", value: "" },
  ...[0, 1, 2, 3, 4, 5].map((value) => ({ label: `${value} 次`, value })),
];
</script>

<template>
  <Drawer
    v-model:visible="visible"
    :position="mobile ? 'bottom' : 'right'"
    :block-scroll="mobile"
    class="filter-drawer"
    aria-label="筛选条件"
  >
    <form @submit.prevent="emit('apply')">
      <header class="filter-drawer-heading" v-on="mobile ? sheetDrag.handlers : {}">
        <div class="filter-drawer-title-row">
          <h2>筛选条件</h2>
          <span v-if="mobile && draftFilterCount > 0" class="mobile-filter-count-pill">
            已选 {{ draftFilterCount }} 项
          </span>
          <Button v-if="!mobile" class="filter-reset-btn" type="button" text @click="emit('reset')">
            <svg
              viewBox="0 0 24 24"
              width="1.2em"
              height="1.2em"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            重置
          </Button>
        </div>
        <small v-if="!mobile">可多选 · 未选即不限</small>
      </header>
      <div class="filter-scroll">
        <template v-if="mobile">
          <template v-if="kind === 'relic'">
            <fieldset class="filter-group filter-group-wide">
              <legend>部位 <em>可多选</em></legend>
              <div class="filter-chips filter-grid-3">
                <label v-for="slot in relicSlots" :key="slot.value" class="filter-chip"
                  ><input v-model="filters.slots" type="checkbox" :value="slot.value" /><span
                    >{{ slot.label
                    }}<FilterCheckIcon v-if="filters.slots.includes(slot.value)" /></span
                ></label>
              </div>
            </fieldset>
            <fieldset class="filter-group filter-group-wide">
              <legend>快捷状态</legend>
              <div class="mobile-filter-card">
                <div class="mobile-filter-row mobile-filter-row-compact">
                  <span class="mobile-filter-row-label">锁定</span>
                  <MobileSegmentedControl
                    v-model="filters.locked"
                    :options="lockedOptions"
                    aria-label="锁定状态"
                  />
                </div>
                <div class="mobile-filter-row mobile-filter-row-compact">
                  <span class="mobile-filter-row-label">弃置</span>
                  <MobileSegmentedControl
                    v-model="filters.discard"
                    :options="discardOptions"
                    aria-label="弃置状态"
                  />
                </div>
                <div class="mobile-filter-row mobile-filter-row-compact">
                  <span class="mobile-filter-row-label">装备</span>
                  <MobileSegmentedControl
                    v-model="filters.equipped"
                    :options="equippedOptions"
                    aria-label="装备状态"
                  />
                </div>
              </div>
            </fieldset>
            <slot name="relic-quality" />
            <fieldset class="filter-group filter-group-wide">
              <legend>主词条 <em>随部位联动 · 可多选</em></legend>
              <div class="filter-chips">
                <label v-for="stat in availableMainStats" :key="stat" class="filter-chip"
                  ><input v-model="filters.mainStats" type="checkbox" :value="stat" /><span
                    >{{ statLabel(stat)
                    }}<FilterCheckIcon v-if="filters.mainStats.includes(stat)" /></span
                ></label>
              </div>
            </fieldset>
            <fieldset class="filter-group filter-group-wide">
              <legend>副词条 <em>可多选</em></legend>
              <div class="filter-chips">
                <label v-for="stat in relicSubStats" :key="stat" class="filter-chip"
                  ><input v-model="filters.subStats" type="checkbox" :value="stat" /><span
                    >{{ statLabel(stat)
                    }}<FilterCheckIcon v-if="filters.subStats.includes(stat)" /></span
                ></label>
              </div>
            </fieldset>
            <fieldset class="filter-group filter-group-wide">
              <legend>副词条强化次数</legend>
              <div class="mobile-filter-card mobile-filter-range-card">
                <label class="mobile-filter-select-row">
                  <span class="mobile-filter-row-label">最少</span>
                  <Select
                    v-model="filters.minSubstatCount"
                    :options="substatCountOptions"
                    option-label="label"
                    option-value="value"
                    aria-label="副词条最少强化次数"
                    placeholder="不限"
                  />
                </label>
                <label class="mobile-filter-select-row">
                  <span class="mobile-filter-row-label">最多</span>
                  <Select
                    v-model="filters.maxSubstatCount"
                    :options="substatCountOptions"
                    option-label="label"
                    option-value="value"
                    aria-label="副词条最多强化次数"
                    placeholder="不限"
                  />
                </label>
              </div>
            </fieldset>
          </template>
          <template v-else-if="kind === 'lightCone'">
            <fieldset class="filter-group filter-group-wide">
              <legend>
                叠影
                <a
                  href="#"
                  class="filter-select-all"
                  @click.prevent="filters.superimposition = [1, 2, 3, 4, 5]"
                  >全选</a
                >
              </legend>
              <div class="filter-chips filter-grid-3">
                <label v-for="value in 5" :key="value" class="filter-chip"
                  ><input v-model="filters.superimposition" type="checkbox" :value="value" /><span
                    >{{ value }} 阶<FilterCheckIcon
                      v-if="filters.superimposition.includes(value)" /></span
                ></label>
              </div>
            </fieldset>
            <fieldset class="filter-group filter-group-wide">
              <legend>快捷状态</legend>
              <div class="mobile-filter-card">
                <div class="mobile-filter-row mobile-filter-row-compact">
                  <span class="mobile-filter-row-label">锁定</span>
                  <MobileSegmentedControl
                    v-model="filters.locked"
                    :options="lockedOptions"
                    aria-label="锁定状态"
                  />
                </div>
                <div class="mobile-filter-row mobile-filter-row-compact">
                  <span class="mobile-filter-row-label">装备</span>
                  <MobileSegmentedControl
                    v-model="filters.equipped"
                    :options="equippedOptions"
                    aria-label="装备状态"
                  />
                </div>
              </div>
            </fieldset>
          </template>
          <template v-else>
            <fieldset class="filter-group filter-group-wide">
              <legend>培养方案</legend>
              <div class="mobile-filter-card">
                <div class="mobile-filter-row">
                  <MobileSegmentedControl
                    v-model="filters.buildPlan"
                    :options="buildPlanOptions"
                    aria-label="培养方案"
                  />
                </div>
              </div>
            </fieldset>
            <fieldset class="filter-group filter-group-wide">
              <legend>
                命途 <em class="filter-count">{{ filters.path.length || paths.length }} 个</em>
              </legend>
              <div class="filter-chips filter-grid-3">
                <label v-for="path in paths" :key="path.value" class="filter-chip filter-path-chip"
                  ><input v-model="filters.path" type="checkbox" :value="path.value" /><span
                    ><img
                      :src="`/character-icons/paths/${path.label}.webp`"
                      class="filter-chip-img"
                      alt="" />{{ path.label
                    }}<FilterCheckIcon v-if="filters.path.includes(path.value)" /></span
                ></label>
              </div>
            </fieldset>
            <fieldset class="filter-group filter-group-wide">
              <legend>
                星魂
                <a
                  href="#"
                  class="filter-select-all"
                  @click.prevent="filters.eidolon = [0, 1, 2, 3, 4, 5, 6]"
                  >全选</a
                >
              </legend>
              <div class="filter-chips filter-grid-4">
                <label v-for="value in [0, 1, 2, 3, 4, 5, 6]" :key="value" class="filter-chip">
                  <input v-model="filters.eidolon" type="checkbox" :value="value" />
                  <span
                    >{{ value }} 魂<FilterCheckIcon v-if="filters.eidolon.includes(value)"
                  /></span>
                </label>
              </div>
            </fieldset>
            <fieldset class="filter-group filter-group-wide">
              <legend>属性</legend>
              <div class="filter-chips filter-grid-3">
                <label
                  v-for="element in elements"
                  :key="element.label"
                  class="filter-chip filter-element-chip"
                  ><input v-model="filters.element" type="checkbox" :value="element.label" /><span
                    ><i class="filter-element-dot" :style="{ backgroundColor: element.color }" />{{
                      element.label
                    }}<FilterCheckIcon v-if="filters.element.includes(element.label)" /></span
                ></label>
              </div>
            </fieldset>
          </template>
        </template>
        <template v-else>
          <slot v-if="kind === 'relic'" name="relic-quality" />
          <template v-if="kind === 'relic'">
            <fieldset class="filter-group filter-group-wide">
              <legend>部位 <em>可多选</em></legend>
              <div class="filter-chips">
                <label v-for="slot in relicSlots" :key="slot.value" class="filter-chip"
                  ><input v-model="filters.slots" type="checkbox" :value="slot.value" /><span
                    >{{ slot.label
                    }}<FilterCheckIcon v-if="filters.slots.includes(slot.value)" /></span
                ></label>
              </div>
            </fieldset>
            <fieldset class="filter-group filter-group-wide">
              <legend>主词条 <em>随部位更新 · 可多选</em></legend>
              <div class="filter-chips">
                <label v-for="stat in availableMainStats" :key="stat" class="filter-chip"
                  ><input v-model="filters.mainStats" type="checkbox" :value="stat" /><span
                    >{{ statLabel(stat)
                    }}<FilterCheckIcon v-if="filters.mainStats.includes(stat)" /></span
                ></label>
              </div>
            </fieldset>
            <fieldset class="filter-group filter-group-wide">
              <legend>副词条 <em>可多选</em></legend>
              <div class="filter-chips">
                <label v-for="stat in relicSubStats" :key="stat" class="filter-chip"
                  ><input v-model="filters.subStats" type="checkbox" :value="stat" /><span
                    >{{ statLabel(stat)
                    }}<FilterCheckIcon v-if="filters.subStats.includes(stat)" /></span
                ></label>
              </div>
            </fieldset>
            <fieldset class="filter-group filter-group-wide">
              <legend>副词条强化次数</legend>
              <div class="filter-range">
                <label
                  ><span>最少</span
                  ><Select
                    v-model="filters.minSubstatCount"
                    :options="substatCountOptions"
                    option-label="label"
                    option-value="value"
                    placeholder="不限"
                /></label>
                <label
                  ><span>最多</span
                  ><Select
                    v-model="filters.maxSubstatCount"
                    :options="substatCountOptions"
                    option-label="label"
                    option-value="value"
                    placeholder="不限"
                /></label>
              </div>
            </fieldset>
            <label
              ><span>锁定</span
              ><Select
                v-model="filters.locked"
                :options="lockedOptions"
                option-label="label"
                option-value="value"
                placeholder="全部"
            /></label>
            <label
              ><span>弃置</span
              ><Select
                v-model="filters.discard"
                :options="discardOptions"
                option-label="label"
                option-value="value"
                placeholder="全部"
            /></label>
          </template>
          <template v-else-if="kind === 'lightCone'">
            <fieldset class="filter-group filter-group-wide">
              <legend>
                叠影
                <a
                  href="#"
                  class="filter-select-all"
                  @click.prevent="filters.superimposition = [1, 2, 3, 4, 5]"
                  >全选</a
                >
              </legend>
              <div class="filter-chips filter-grid-4">
                <label v-for="value in 5" :key="value" class="filter-chip"
                  ><input v-model="filters.superimposition" type="checkbox" :value="value" /><span
                    >{{ value }} 阶<FilterCheckIcon
                      v-if="filters.superimposition.includes(value)" /></span
                ></label>
              </div>
            </fieldset>
            <label
              ><span>锁定</span
              ><Select
                v-model="filters.locked"
                :options="lockedOptions"
                option-label="label"
                option-value="value"
                placeholder="全部"
            /></label>
          </template>
          <template v-else>
            <label>
              <span>培养方案</span>
              <Select
                v-model="filters.buildPlan"
                :options="buildPlanOptions"
                option-label="label"
                option-value="value"
                placeholder="全部"
              />
            </label>
            <fieldset class="filter-group filter-group-wide">
              <legend>
                命途 <em class="filter-count">{{ filters.path.length || paths.length }} 个</em>
              </legend>
              <div class="filter-chips filter-grid-3">
                <label v-for="path in paths" :key="path.value" class="filter-chip filter-path-chip"
                  ><input v-model="filters.path" type="checkbox" :value="path.value" /><span
                    ><img
                      :src="`/character-icons/paths/${path.label}.webp`"
                      class="filter-chip-img"
                      alt="" />{{ path.label
                    }}<FilterCheckIcon v-if="filters.path.includes(path.value)" /></span
                ></label>
              </div>
            </fieldset>
            <fieldset class="filter-group filter-group-wide">
              <legend>
                星魂
                <a
                  href="#"
                  class="filter-select-all"
                  @click.prevent="filters.eidolon = [0, 1, 2, 3, 4, 5, 6]"
                  >全选</a
                >
              </legend>
              <div class="filter-chips filter-grid-4">
                <label v-for="value in [0, 1, 2, 3, 4, 5, 6]" :key="value" class="filter-chip">
                  <input v-model="filters.eidolon" type="checkbox" :value="value" />
                  <span
                    >{{ value }} 魂<FilterCheckIcon v-if="filters.eidolon.includes(value)"
                  /></span>
                </label>
              </div>
            </fieldset>
            <fieldset class="filter-group filter-group-wide">
              <legend>元素</legend>
              <div class="filter-chips filter-grid-3">
                <label
                  v-for="element in elements"
                  :key="element.label"
                  class="filter-chip filter-element-chip"
                  ><input v-model="filters.element" type="checkbox" :value="element.label" /><span
                    ><i class="filter-element-dot" :style="{ backgroundColor: element.color }" />{{
                      element.label
                    }}<FilterCheckIcon v-if="filters.element.includes(element.label)" /></span
                ></label>
              </div>
            </fieldset>
          </template>
          <label v-if="kind !== 'character'"
            ><span>装备状态</span
            ><Select
              v-model="filters.equipped"
              :options="equippedOptions"
              option-label="label"
              option-value="value"
              placeholder="全部"
          /></label>
        </template>
      </div>
      <div class="filter-actions">
        <Button class="filter-reset" type="button" outlined @click="emit('reset')">重置全部</Button
        ><Button class="filter-submit" type="submit" :disabled="busy">查看结果</Button>
      </div>
    </form>
  </Drawer>
</template>
