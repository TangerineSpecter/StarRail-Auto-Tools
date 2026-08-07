<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { buildPlanApi } from "@/shared/api/build-plan";
import { qualityTagFromScore, resolvePlanWeights, scoreRelic } from "@/shared/utils/relic-score";
import type { BuildDashboardEntry, CharacterBuildPlan, RelicListItem } from "@/types";

const props = defineProps<{
  items: RelicListItem[];
}>();

const emit = defineEmits<{
  "update:display-items": [items: RelicListItem[]];
  notice: [message: string];
  error: [message: string];
}>();

const plans = ref<BuildDashboardEntry[]>([]);
const selectedCharacterId = ref<number | null>(null);
const sortMode = ref<"default" | "score-desc" | "score-asc">("default");
const minGrade = ref("");
const tagPreview = ref<Array<{ itemId: number; tag: string; grade: string | null; score: number }>>(
  [],
);
const confirmAction = ref<"lock" | "discard" | null>(null);

const planOptions = computed(() =>
  plans.value.map((entry) => ({
    label: entry.character.name,
    value: entry.character.characterId,
  })),
);

const activePlan = computed<CharacterBuildPlan | null>(() => {
  const found = plans.value.find(
    (entry) => entry.character.characterId === selectedCharacterId.value,
  );
  return found?.plan ?? null;
});

const gradeOrder = [
  "AEON",
  "WTF+",
  "WTF",
  "SSS+",
  "SSS",
  "SS+",
  "SS",
  "S+",
  "S",
  "A+",
  "A",
  "B+",
  "B",
  "C+",
  "C",
  "D+",
  "D",
  "F+",
  "F",
];

const gradeOptions = [
  { label: "不限等级", value: "" },
  ...gradeOrder.map((grade) => ({ label: `≥ ${grade}`, value: grade })),
];

const sortOptions = [
  { label: "默认顺序", value: "default" },
  { label: "加权分从高到低", value: "score-desc" },
  { label: "加权分从低到高", value: "score-asc" },
];

function gradeRank(grade: string | null): number {
  if (!grade) return gradeOrder.length;
  const index = gradeOrder.indexOf(grade);
  return index === -1 ? gradeOrder.length : index;
}

function scoreItem(item: RelicListItem) {
  const weights = resolvePlanWeights({
    substatWeights: activePlan.value?.substatWeights,
    effectiveSubstats: activePlan.value?.effectiveSubstats,
  });
  return scoreRelic(
    {
      slot: item.slot,
      mainStat: item.mainStat,
      substats: item.substats,
      rarity: item.rarity,
      level: item.level,
    },
    weights,
    { allowedMainStats: activePlan.value?.mainStats },
  );
}

const displayItems = computed(() => {
  let list = [...props.items];
  const min = minGrade.value;
  if (min) {
    const threshold = gradeRank(min);
    list = list.filter((item) => gradeRank(scoreItem(item).letterGrade) <= threshold);
  }
  if (sortMode.value === "score-desc") {
    list.sort((a, b) => scoreItem(b).weightedRolls - scoreItem(a).weightedRolls);
  } else if (sortMode.value === "score-asc") {
    list.sort((a, b) => scoreItem(a).weightedRolls - scoreItem(b).weightedRolls);
  }
  return list;
});

watch(displayItems, (items) => emit("update:display-items", items), { immediate: true });

async function loadPlans() {
  try {
    plans.value = await buildPlanApi.dashboard();
  } catch (cause) {
    emit("error", String(cause));
  }
}

function previewTags() {
  const preview = props.items.map((item) => {
    const score = scoreItem(item);
    const tag = qualityTagFromScore(score, {
      minPotentialPct: activePlan.value?.minPotentialPct ?? 40,
    });
    return {
      itemId: item.itemId,
      tag,
      grade: score.letterGrade,
      score: score.weightedRolls,
    };
  });
  tagPreview.value = preview;
  const counts = preview.reduce(
    (acc, row) => {
      acc[row.tag] = (acc[row.tag] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  emit(
    "notice",
    `质量标签预览：建议锁定 ${counts.lock ?? 0} · 可继续刷 ${counts.farm ?? 0} · 分解候选 ${counts["discard-candidate"] ?? 0}（尚未修改背包）`,
  );
}

function applyConfirmed() {
  if (!confirmAction.value || !tagPreview.value.length) return;
  if (confirmAction.value === "lock") {
    const ids = tagPreview.value.filter((row) => row.tag === "lock").map((row) => row.itemId);
    if (!ids.length) emit("notice", "没有标记为「建议锁定」的遗器。");
    else
      emit(
        "notice",
        `已确认 ${ids.length} 件建议锁定（#${ids.slice(0, 8).join(", ")}${ids.length > 8 ? "…" : ""}）。请人工锁定，不会自动写入。`,
      );
  } else {
    const ids = tagPreview.value
      .filter((row) => row.tag === "discard-candidate")
      .map((row) => row.itemId);
    if (!ids.length) emit("notice", "没有分解候选遗器。");
    else
      emit(
        "notice",
        `已确认 ${ids.length} 件分解候选（#${ids.slice(0, 8).join(", ")}${ids.length > 8 ? "…" : ""}）。请人工复核后再弃置。`,
      );
  }
  confirmAction.value = null;
}

onMounted(() => {
  void loadPlans();
});
</script>

<template>
  <section class="score-toolbar" aria-label="词条质量排序与标签">
    <div class="score-toolbar-fields">
      <label>
        <span>评分方案</span>
        <select v-model="selectedCharacterId">
          <option :value="null">默认权重</option>
          <option v-for="opt in planOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <label>
        <span>排序</span>
        <select v-model="sortMode">
          <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <label>
        <span>最低字母等级</span>
        <select v-model="minGrade">
          <option v-for="opt in gradeOptions" :key="opt.value || 'any'" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>
    </div>
    <div class="score-toolbar-actions">
      <button type="button" class="score-action" @click="previewTags">预览质量标签</button>
      <button
        type="button"
        class="score-action"
        :disabled="!tagPreview.length"
        @click="confirmAction = 'lock'"
      >
        确认锁定建议…
      </button>
      <button
        type="button"
        class="score-action score-action--warn"
        :disabled="!tagPreview.length"
        @click="confirmAction = 'discard'"
      >
        确认分解候选…
      </button>
    </div>
    <p class="score-toolbar-hint">
      排序 / 筛选仅作用于<strong>当前已加载列表页</strong>（滚动加载后会重新计算，不是全库 SQL
      排序）。标签不会自动改锁定或弃置，需二次确认。
    </p>
    <div v-if="confirmAction" class="score-toolbar-confirm">
      <p>
        {{
          confirmAction === "lock"
            ? "确认查看「建议锁定」清单？（不会自动写入锁定状态）"
            : "确认查看「分解候选」清单？（不会自动弃置）"
        }}
      </p>
      <div>
        <button type="button" class="score-action" @click="applyConfirmed">确认</button>
        <button
          type="button"
          class="score-action score-action--ghost"
          @click="confirmAction = null"
        >
          取消
        </button>
      </div>
    </div>
  </section>
</template>
