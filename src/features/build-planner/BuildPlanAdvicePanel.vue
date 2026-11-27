<script setup lang="ts">
import { computed } from "vue";
import { openerApi } from "@/shared/api/opener";
import InlineSpinner from "@/shared/ui/InlineSpinner.vue";
import LoadingState from "@/shared/ui/LoadingState.vue";
import type { AdviceSource, CharacterBuildAdvice } from "@/types";
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
  gameVersion?: string;
}>();
const emit = defineEmits<{
  query: [];
  choose: [key: string, choice: AdviceChoice];
  apply: [];
}>();

const groupedRows = computed(() => {
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
});

const safeSources = computed(() =>
  (props.advice?.sources ?? []).filter((source) => isSafeHttpUrl(source.url)),
);

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function openSource(source: AdviceSource) {
  if (!isSafeHttpUrl(source.url)) return;
  void openerApi.openUrl(source.url).catch(() => {
    window.open(source.url, "_blank", "noopener,noreferrer");
  });
}
</script>

<template>
  <section class="build-advice-pane" aria-label="当前版本配装对照">
    <header>
      <div class="advice-header-top">
        <p class="eyebrow">VERSION META</p>
        <span v-if="gameVersion" class="advice-version-badge">v{{ gameVersion }}</span>
      </div>
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
        <InlineSpinner v-if="loading" size="xs" />
        <span>{{ loading ? "正在检索…" : advice ? "重新查询" : "查询当前版本配装" }}</span>
      </button>
      <button
        type="button"
        class="advisor-apply"
        :disabled="disabled || loading || !advice || pendingCount === 0"
        @click="emit('apply')"
      >
        全部使用推荐
      </button>
      <span
        v-if="advice && !loading"
        class="advice-diff-badge"
        :class="{ 'is-match': pendingCount === 0 }"
      >
        {{ pendingCount > 0 ? `${pendingCount} 项差异` : "已全部一致" }}
      </span>
    </div>
    <div class="build-advice-body">
      <LoadingState
        v-if="loading"
        variant="page"
        compact
        label="正在检索当前版本配装…"
        hint="综合客户端实装技能与最新公开攻略，生成符合表单约束的套装、主词条、目标和权重。"
      />
      <p v-else-if="error" class="advisor-error">{{ error }}</p>
      <p v-else-if="!advice" class="score-hint">
        查询后会对照查询时的表单和 AI 推荐。点「使用推荐」立即写入该项。
      </p>
      <template v-else>
        <div v-if="advice.summary" class="advisor-summary-card">
          <p class="advisor-summary">{{ advice.summary }}</p>
        </div>
        <ul v-if="advice.warnings.length" class="advisor-warning-list" aria-label="流派与机制提示">
          <li v-for="(warning, index) in advice.warnings" :key="index" class="advisor-warning">
            {{ warning }}
          </li>
        </ul>
        <section v-for="group in groupedRows" :key="group.id" class="advice-group">
          <h4>{{ group.label }}</h4>
          <article
            v-for="row in group.rows"
            :key="row.key"
            :class="[
              'advice-row',
              {
                'is-diff': !row.equal,
                'is-applied': !row.equal && selections[row.key] === 'ai',
              },
            ]"
          >
            <div class="advice-row-main">
              <strong>{{ row.label }}</strong>
              <p class="advice-line">
                <span class="advice-tag">当前</span>
                <span>{{ row.currentLabel }}</span>
              </p>
              <p class="advice-line is-recommend">
                <span class="advice-tag is-ai">推荐</span>
                <span>{{ row.aiLabel }}</span>
              </p>
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
        <section v-if="safeSources.length" class="advice-sources" aria-label="参考攻略来源">
          <h4>参考攻略</h4>
          <ul class="advice-source-list">
            <li v-for="(source, index) in safeSources" :key="`${source.url}-${index}`">
              <button
                type="button"
                class="advice-source-link"
                :title="source.url"
                @click="openSource(source)"
              >
                <span class="advice-source-title">{{
                  source.title || sourceHost(source.url)
                }}</span>
                <span v-if="sourceHost(source.url)" class="advice-source-host">{{
                  sourceHost(source.url)
                }}</span>
              </button>
            </li>
          </ul>
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
.advice-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.build-advice-pane .eyebrow {
  margin: 0;
  color: var(--muted);
  font-size: 8px;
  letter-spacing: 0.08em;
  font-weight: 600;
}
.advice-version-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(23, 61, 122, 0.1);
  color: #173d7a;
  font-size: 10px;
  font-weight: 700;
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
  align-items: center;
  gap: 8px;
  margin: 12px 0 8px;
}
.build-advice-pane button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
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
.advice-diff-badge {
  margin-left: auto;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(23, 61, 122, 0.08);
  color: #173d7a;
  font-size: 11px;
  font-weight: 600;
}
.advice-diff-badge.is-match {
  background: rgba(47, 107, 70, 0.1);
  color: #2f6b46;
}
.build-advice-pane button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.score-hint {
  margin: 8px 0;
  color: var(--ink);
  font-size: 12px;
  line-height: 1.5;
}
.advisor-summary-card {
  margin: 8px 0;
  padding: 10px 12px;
  border: 1px solid rgba(23, 61, 122, 0.14);
  border-radius: 6px;
  background: rgba(235, 242, 252, 0.65);
}
.advisor-summary {
  margin: 0;
  color: var(--ink);
  font-size: 12px;
  line-height: 1.55;
}
.advisor-error {
  margin: 8px 0;
  padding: 9px 11px;
  border: 1px solid rgba(154, 75, 31, 0.25);
  border-radius: 6px;
  background: rgba(254, 244, 236, 0.9);
  color: #9a4b1f;
  font-size: 11px;
  line-height: 1.5;
}
.advisor-warning-list {
  display: grid;
  gap: 6px;
  margin: 8px 0 10px;
  padding: 0;
  list-style: none;
}
.advisor-warning {
  position: relative;
  margin: 0;
  padding: 7px 10px 7px 20px;
  border: 1px solid rgba(178, 102, 42, 0.22);
  border-radius: 6px;
  background: rgba(255, 249, 240, 0.88);
  color: #7d4519;
  font-size: 11px;
  line-height: 1.5;
}
.advisor-warning::before {
  content: "•";
  position: absolute;
  left: 9px;
  top: 7px;
  color: #b2662a;
  font-weight: 700;
}
.build-advice-body {
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}
.advice-group {
  margin-top: 12px;
}
.advice-group h4,
.advice-sources h4 {
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
.advice-row.is-diff {
  border-left: 3px solid #2b5da8;
}
.advice-row.is-applied {
  border-left-color: #2f6b46;
  background: rgba(244, 251, 246, 0.88);
}
.advice-row-main {
  min-width: 0;
}
.advice-line {
  display: flex;
  align-items: baseline;
  gap: 5px;
  margin: 3px 0 0;
  color: var(--ink-soft);
  word-break: break-word;
}
.advice-line.is-recommend {
  color: var(--ink);
}
.advice-tag {
  flex: none;
  padding: 0 4px;
  border-radius: 3px;
  background: rgba(108, 127, 153, 0.14);
  color: #465a73;
  font-size: 10px;
  font-weight: 600;
}
.advice-tag.is-ai {
  background: rgba(23, 61, 122, 0.12);
  color: #173d7a;
}
.advice-same {
  align-self: center;
  margin: 0;
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
.advice-sources {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
.advice-source-list {
  display: grid;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.advice-source-link {
  width: 100%;
  min-height: 28px;
  justify-content: space-between;
  padding: 5px 9px;
  border: 1px solid rgba(42, 72, 113, 0.14);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.72);
  color: #233954;
  font-size: 11px;
  font-weight: 500;
  text-align: left;
}
.advice-source-link:hover {
  border-color: #2b5da8;
  background: #fff;
}
.advice-source-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.advice-source-host {
  flex: none;
  color: var(--muted);
  font-size: 10px;
}
@media (max-width: 980px) {
  .build-advice-pane {
    margin: 12px 12px 0;
  }
}
</style>
