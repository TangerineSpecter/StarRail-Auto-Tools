<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { CatalogueAbility } from "@/shared/contracts/catalogue-rules";
import type { MechanismLibrary } from "@/shared/contracts/catalogue-mechanisms";
import { resolveAbility } from "@/shared/utils/catalogue-rules";

const props = defineProps<{ ability: CatalogueAbility; level: number | null }>();
const library = ref<MechanismLibrary>();
const error = ref("");
const open = ref(false);
const resolved = computed(() => resolveAbility(props.ability, props.level ?? 1));
const definition = computed(() =>
  library.value?.definitions.find(
    (d) =>
      d.sourceRef === props.ability.id &&
      d.sourceHash === props.ability.sourceHash &&
      d.ownerId === props.ability.ownerId,
  ),
);
const runnable = computed(() =>
  definition.value?.clauses.some(
    (c) => c.activation === "selectedAbility" && c.operations.some((o) => o.kind !== "unsupported"),
  ),
);
watch(open, async (value) => {
  if (!value || library.value) return;
  error.value = "";
  try {
    const result = await import("@/data/catalogue-mechanisms.json");
    library.value = result.default as unknown as MechanismLibrary;
  } catch {
    error.value = "拆解数据加载失败，请关闭后重试。";
  }
});
watch(
  () => props.ability.id,
  () => {
    open.value = false;
    error.value = "";
  },
);
</script>

<template>
  <details
    :open="open"
    class="catalogue-explanation"
    @toggle="open = ($event.target as HTMLDetailsElement).open"
  >
    <summary>查看参数与条款拆解</summary>
    <div v-if="open" class="catalogue-explanation-body">
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-else-if="!library">正在加载拆解记录…</p>
      <template v-else-if="definition">
        <p>{{ runnable ? "部分基础量可近似执行" : "已记录条款，操作尚未支持" }} · 非精确审核</p>
        <dl class="catalogue-explanation-parameters">
          <template v-for="(curve, key) in ability.parameters" :key="key">
            <dt>
              {{ key }}
              <small>{{ curve.kind === "constant" ? "常量" : `等级表 · Lv.${level}` }}</small>
            </dt>
            <dd>
              {{ resolved.parameters[key] ?? "未知"
              }}{{
                definition.unusedParameters.includes(String(key)) ? "（来源保留，描述未引用）" : ""
              }}
            </dd>
          </template>
        </dl>
        <ol class="catalogue-explanation-clauses">
          <li v-for="clause in definition.clauses" :key="clause.id">
            <p>{{ ability.descriptionTemplate.slice(clause.start, clause.end) }}</p>
            <small>参数：{{ clause.parameterRefs.join("、") || "无；数字以原文常量记录" }}</small>
            <p
              v-for="(operation, index) in clause.operations"
              :key="index"
              class="catalogue-explanation-limit"
            >
              {{
                operation.kind === "unsupported"
                  ? "跳过"
                  : `${operation.kind} · ${operation.target} · ${operation.scaling}`
              }}：{{ operation.limitation }}
            </p>
          </li>
        </ol>
        <p v-if="!definition.clauses.length">来源描述为空；未生成占位效果。</p>
      </template>
      <p v-else role="alert">尚无有效拆解记录，请重新生成机制数据。</p>
    </div>
  </details>
</template>

<style scoped>
.catalogue-explanation {
  margin-top: 12px;
  border-top: 1px solid var(--border-color, #dce3ee);
  color: inherit;
  font-size: 13px;
}
.catalogue-explanation summary {
  padding: 12px 0;
  cursor: pointer;
  font-weight: 600;
}
.catalogue-explanation summary:focus-visible {
  outline: 2px solid #2c64ae;
  outline-offset: 3px;
}
.catalogue-explanation-body {
  padding-bottom: 12px;
}
.catalogue-explanation-parameters {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) 2fr;
  gap: 8px 16px;
  font-variant-numeric: tabular-nums;
}
.catalogue-explanation-parameters dt {
  font-weight: 600;
}
.catalogue-explanation-parameters dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.catalogue-explanation-parameters small {
  font-weight: normal;
  opacity: 0.7;
}
.catalogue-explanation-clauses {
  padding-left: 20px;
}
.catalogue-explanation-clauses li {
  margin-top: 16px;
}
.catalogue-explanation-limit {
  opacity: 0.72;
  line-height: 1.6;
}
</style>
