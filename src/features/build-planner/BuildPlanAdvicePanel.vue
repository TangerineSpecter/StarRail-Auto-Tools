<script setup lang="ts">
import type { CharacterBuildAdvice } from "@/types";
import type { AdviceChoice, AdviceCompareRow } from "./plan-advice";

const GROUP_LABELS: Record<AdviceCompareRow["group"], string> = {
  set: "套装",
  mainStat: "主词条",
  targets: "属性目标",
  substats: "有效副词条",
  weight: "词条权重",
  misc: "其他目标",
};

const props = defineProps<{
  disabled: boolean;
  loading: boolean;
  error: string;
  advice: CharacterBuildAdvice | null;
  rows: AdviceCompareRow[];
  selections: Record<string, AdviceChoice>;
  pendingCount: number;
}>();
const emit = defineEmits<{
  query: [];
  choose: [key: string, choice: AdviceChoice];
  apply: [];
}>();

function groupedRows() {
  const groups: Array<{ id: AdviceCompareRow["group"]; label: string; rows: AdviceCompareRow[] }> =
    [];
  for (const row of props.rows) {
    const last = groups.at(-1);
    if (!last || last.id !== row.group) {
      groups.push({ id: row.group, label: GROUP_LABELS[row.group], rows: [row] });
    } else {
      last.rows.push(row);
    }
  }
  return groups;
}
</script>

<template>
  <section class="build-advice-pane" aria-label="当前版本配装对照">
    <header>
      <p class="eyebrow">VERSION META</p>
      <h3>AI 推荐对照</h3>
      <small>点「使用推荐」会立刻写入右侧对应项；不会自动保存。</small>
    </header>
    <div class="build-advice-toolbar">
      <button
        type="button"
        class="advisor-query"
        :disabled="disabled || loading"
        @click="emit('query')"
      >
        {{ loading ? "正在检索…" : advice ? "重新查询" : "查询当前版本配装" }}
      </button>
      <button
        type="button"
        class="advisor-apply"
        :disabled="disabled || loading || !advice || pendingCount === 0"
        @click="emit('apply')"
      >
        全部使用推荐
      </button>
    </div>
    <div class="build-advice-body">
      <p v-if="loading" class="score-hint">
        检索攻略并生成符合表单约束的套装、主词条、目标和权重。
      </p>
      <p v-else-if="error" class="advisor-error">{{ error }}</p>
      <p v-else-if="!advice" class="score-hint">
        查询后会对照查询时的表单和 AI 推荐。点「使用推荐」立即写入该项。
      </p>
      <template v-else>
        <p v-if="advice.summary" class="advisor-summary">{{ advice.summary }}</p>
        <p v-if="advice.warnings.length" class="advisor-warning">{{ advice.warnings.join(" ") }}</p>
        <section v-for="group in groupedRows()" :key="group.id" class="advice-group">
          <h4>{{ group.label }}</h4>
          <article v-for="row in group.rows" :key="row.key" class="advice-row">
            <div>
              <strong>{{ row.label }}</strong>
              <p>当前：{{ row.currentLabel }}</p>
              <p>推荐：{{ row.aiLabel }}</p>
            </div>
            <p v-if="row.equal" class="advice-same">一致</p>
            <div v-else class="advice-choice" role="group" :aria-label="row.label">
              <button
                type="button"
                :class="{ selected: selections[row.key] === 'current' }"
                @click="emit('choose', row.key, 'current')"
              >
                保留当前
              </button>
              <button
                type="button"
                :class="{ selected: selections[row.key] === 'ai' }"
                @click="emit('choose', row.key, 'ai')"
              >
                使用推荐
              </button>
            </div>
          </article>
        </section>
      </template>
    </div>
  </section>
</template>

<style scoped>
.build-advice-pane {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  margin: 16px 12px 16px 16px;
  padding: 16px 16px 18px;
  overflow: hidden;
  border: 1px solid rgba(42, 72, 113, 0.16);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(244, 248, 253, 0.9) 100%);
  box-shadow: 0 18px 40px rgba(30, 49, 79, 0.1);
}
.build-advice-pane header {
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}
.build-advice-pane .eyebrow {
  margin: 0;
  color: var(--muted);
  font-size: 8px;
  letter-spacing: 0.08em;
  font-weight: 600;
}
.build-advice-pane h3 {
  margin: 4px 0 0;
  color: var(--ink);
  font-size: 16px;
}
.build-advice-pane header small {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
}
.build-advice-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0 8px;
}
.build-advice-pane button {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid #173d7a;
  border-radius: 3px;
  font: 700 12px/1 var(--font-ui);
  cursor: pointer;
}
.advisor-query {
  color: #fff;
  background: #173d7a;
}
.advisor-apply {
  color: #173d7a;
  background: #fff;
}
.build-advice-pane button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.score-hint,
.advisor-summary {
  margin: 8px 0;
  color: var(--ink);
  font-size: 12px;
  line-height: 1.5;
}
.advisor-error,
.advisor-warning {
  margin: 8px 0;
  color: #9a4b1f;
  font-size: 11px;
  line-height: 1.5;
}
.build-advice-body {
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
}
.advice-group {
  margin-top: 12px;
}
.advice-group h4 {
  margin: 0 0 6px;
  color: var(--blue);
  font-size: 11px;
  letter-spacing: 0.04em;
}
.advice-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin-bottom: 8px;
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.78);
  font-size: 11px;
  line-height: 1.45;
}
.advice-row p {
  margin: 2px 0 0;
  color: var(--ink-soft);
}
.advice-same {
  align-self: center;
  color: #2f6b46;
  font-weight: 700;
}
.advice-choice {
  display: grid;
  gap: 4px;
  align-content: center;
}
.advice-choice button {
  min-height: 26px;
  border-color: #6c7f99;
  color: #233954;
  background: #fff;
}
.advice-choice button.selected {
  border-color: #173d7a;
  color: #fff;
  background: #173d7a;
}
@media (max-width: 980px) {
  .build-advice-pane {
    margin: 12px 12px 0;
  }
}
</style>
