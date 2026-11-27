<script setup lang="ts">
import { computed, onActivated, ref, watch } from "vue";
import Select from "primevue/select";
import { inventoryApi } from "@/shared/api/inventory";
import { relicCatalogue, relicSetById } from "@/shared/catalogue";

const props = defineProps<{
  revision?: number;
}>();

const setIds = defineModel<number[]>("setIds", { required: true });
const emit = defineEmits<{ change: [] }>();

const countBySetId = ref<Map<number, number>>(new Map());
let countRequestId = 0;

async function loadCounts() {
  const currentId = ++countRequestId;
  try {
    const counts = await inventoryApi.equipmentCounts();
    if (currentId !== countRequestId) return;
    countBySetId.value = new Map(counts.relics.map((item) => [item.setId, item.count]));
  } catch {
    // Keep last known counts if the desktop bridge is unavailable.
  }
}

watch(
  () => props.revision,
  () => {
    void loadCounts();
  },
  { immediate: true },
);
onActivated(() => {
  void loadCounts();
});

const groupedSetOptions = computed(() => {
  const counts = countBySetId.value;
  const toOption = (set: (typeof relicCatalogue.sets)[number]) => ({
    id: set.id,
    name: set.name,
    image: set.image,
    count: counts.get(set.id) ?? 0,
  });
  const cavern = relicCatalogue.sets
    .filter((set) => set.kind === "cavern")
    .sort((left, right) => right.id - left.id)
    .map(toOption);
  const planar = relicCatalogue.sets
    .filter((set) => set.kind === "planar")
    .sort((left, right) => right.id - left.id)
    .map(toOption);
  return [
    { label: "隧洞遗器（4件套）", items: cavern },
    { label: "位面饰品（2件套）", items: planar },
  ];
});

const selectedSetId = computed<number | null>({
  get: () => setIds.value[0] ?? null,
  set: (next) => {
    setIds.value = next != null ? [next] : [];
    emit("change");
  },
});

const selectedSet = computed(() =>
  selectedSetId.value != null ? relicSetById.get(selectedSetId.value) : undefined,
);
const selectedCount = computed(() =>
  selectedSetId.value != null ? (countBySetId.value.get(selectedSetId.value) ?? 0) : 0,
);
const selectTitle = computed(() =>
  selectedSet.value ? `${selectedSet.value.name}（${selectedCount.value} 件）` : "按套装筛选遗器",
);
</script>

<template>
  <Select
    v-model="selectedSetId"
    class="relic-set-filter-select"
    :class="{ 'is-active': selectedSetId != null }"
    panel-class="relic-set-filter-panel"
    :title="selectTitle"
    :options="groupedSetOptions"
    option-group-label="label"
    option-group-children="items"
    option-label="name"
    option-value="id"
    filter
    filter-placeholder="搜索套装名称"
    show-clear
    placeholder="全部套装"
    aria-label="按套装筛选遗器"
  >
    <template #value>
      <span v-if="selectedSet" class="relic-set-filter-value">
        <img v-if="selectedSet.image" :src="selectedSet.image" alt="" />
        <span>{{ selectedSet.name }}</span>
      </span>
      <span v-else class="relic-set-filter-placeholder">全部套装</span>
    </template>
    <template #option="{ option }">
      <span class="relic-set-filter-option" :class="{ 'is-empty': option.count === 0 }">
        <img v-if="option.image" :src="option.image" alt="" />
        <span class="relic-set-filter-name">{{ option.name }}</span>
        <span class="relic-set-filter-count">{{ option.count }} 件</span>
      </span>
    </template>
  </Select>
</template>

<style scoped>
.relic-set-filter-select.p-select {
  flex: 0 0 auto;
  width: 146px;
  min-width: 132px;
  max-width: 164px;
  height: 34px;
  min-height: 34px;
  border: 1px solid rgba(46, 78, 119, 0.15);
  border-radius: 6px;
  background: #fff;
  box-sizing: border-box;
  transition: all 0.2s;
}
.relic-set-filter-select.p-select:hover {
  background: #f8fbff;
  border-color: rgba(46, 78, 119, 0.25);
}
.relic-set-filter-select.p-select.is-active {
  border-color: rgba(36, 86, 166, 0.34);
  background: #f2f7fe;
}
.relic-set-filter-select :deep(.p-select-label) {
  display: flex;
  align-items: center;
  min-width: 0;
  height: 32px;
  padding: 0 4px 0 10px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  color: var(--ink-soft);
}
.relic-set-filter-select :deep(.p-select-dropdown) {
  width: 26px;
}
.relic-set-filter-select :deep(.p-select-clear-icon) {
  right: 26px;
  width: 12px;
  height: 12px;
}
.relic-set-filter-select.is-active :deep(.p-select-label) {
  padding-right: 18px;
  color: var(--blue);
}
.relic-set-filter-value {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.relic-set-filter-value img {
  flex: none;
  width: 16px;
  height: 16px;
  object-fit: contain;
}
.relic-set-filter-value span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.relic-set-filter-placeholder {
  color: var(--ink-soft);
}
</style>
