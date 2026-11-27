<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  damageKindLabel,
  DEFAULT_ENEMY_PRESET,
  formatDamageCompact,
  formatDamageExact,
  runMonteCarloSimulation,
  type CombatantInput,
  type DamageKind,
  type EnemyPreset,
} from "@/shared/utils/combat";
import CombatBreakdownPanel from "./CombatBreakdownPanel.vue";
import CombatLogList from "./CombatLogList.vue";

const props = defineProps<{
  title: string;
  subtitle?: string;
  mode: "single" | "team";
  combatants: CombatantInput[];
  unavailableNotes?: string[];
  loading?: boolean;
  error?: string;
}>();

const emit = defineEmits<{ close: [] }>();

const cycles = ref<1 | 3 | 5 | 10>(5);
const targetCount = ref<1 | 3 | 5>(3);
const enemyLevel = ref<80 | 90 | 95>(95);
const weaknessMatched = ref(true);
const seed = ref<number>(20261127);
const activeTab = ref<"logs" | "skills" | "rules">("logs");

const cyclePresets: ReadonlyArray<1 | 3 | 5 | 10> = [1, 3, 5, 10];
const targetPresets: ReadonlyArray<{ value: 1 | 3 | 5; label: string }> = [
  { value: 1, label: "单目标" },
  { value: 3, label: "3 目标" },
  { value: 5, label: "5 目标" },
];
const levelPresets: ReadonlyArray<80 | 90 | 95> = [80, 90, 95];

const enemyPreset = computed<EnemyPreset>(() => ({
  ...DEFAULT_ENEMY_PRESET,
  level: enemyLevel.value,
  targetCount: targetCount.value,
  weaknessMatched: weaknessMatched.value,
}));

const simulation = computed(() => {
  if (!props.combatants.length) return null;
  return runMonteCarloSimulation(
    props.combatants,
    {
      cycles: cycles.value,
      enemy: enemyPreset.value,
      seed: seed.value,
      useTechniques: true,
    },
    24,
    true,
  );
});

const damageKindEntries = computed(() => {
  if (!simulation.value) return [];
  const total = simulation.value.meanDamage || 1;
  const order: DamageKind[] = ["superBreak", "break", "direct", "additional", "dot", "elation"];
  return order
    .map((kind) => ({
      kind,
      label: damageKindLabel(kind),
      amount: simulation.value!.byKindMean[kind],
      share: simulation.value!.byKindMean[kind] / total,
    }))
    .filter((entry) => entry.amount > 0.5);
});

const memberColors = ["#2563eb", "#0891b2", "#d97706", "#7c3aed"];

function rerollSeed() {
  seed.value = (seed.value * 1664525 + 1013904223) >>> 0 || 1337;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && !event.isComposing) emit("close");
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div class="detail-backdrop combat-sim-backdrop" @click.self="emit('close')">
    <aside class="detail-drawer combat-sim-drawer" aria-labelledby="combat-sim-title">
      <header class="combat-sim-header">
        <div class="combat-sim-header-copy">
          <p class="eyebrow">COMBAT SIMULATOR · LIGHTWEIGHT SANDBOX</p>
          <h2 id="combat-sim-title">{{ title }}</h2>
          <small>
            {{
              subtitle ||
              (mode === "team"
                ? "多随机种子回合制战斗演播 · 覆盖 1/3/5/10 轮伤害预期区间与首轮一整套爆发"
                : "单角色技能期望拆解与轻量 1/3/5/10 轮自主战斗模拟")
            }}
          </small>
        </div>
        <button
          type="button"
          class="combat-sim-close-btn"
          aria-label="关闭战斗模拟"
          @click="emit('close')"
        >
          ×
        </button>
      </header>

      <div class="combat-sim-body">
        <div v-if="loading" class="combat-sim-loading">正在汇总角色面板、装备与技能配置…</div>
        <div v-else-if="error" class="combat-sim-error">{{ error }}</div>
        <div v-else-if="!combatants.length" class="combat-sim-empty-panel">
          <strong>当前无法启动战斗模拟</strong>
          <p>请确认角色已达到 Lv.80 满突破并装备满级光锥。</p>
          <ul v-if="unavailableNotes?.length">
            <li v-for="note in unavailableNotes" :key="note">{{ note }}</li>
          </ul>
        </div>
        <template v-else-if="simulation">
          <!-- Controls bar -->
          <section class="combat-sim-controls" aria-label="模拟环境设置">
            <div class="combat-sim-control-group">
              <span>轮次</span>
              <div class="combat-sim-seg">
                <button
                  v-for="preset in cyclePresets"
                  :key="preset"
                  type="button"
                  :class="{ active: cycles === preset }"
                  @click="cycles = preset"
                >
                  {{ preset }}轮
                </button>
              </div>
            </div>
            <div class="combat-sim-control-group">
              <span>目标数</span>
              <div class="combat-sim-seg">
                <button
                  v-for="item in targetPresets"
                  :key="item.value"
                  type="button"
                  :class="{ active: targetCount === item.value }"
                  @click="targetCount = item.value"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>
            <div class="combat-sim-control-group">
              <span>敌方等级</span>
              <div class="combat-sim-seg">
                <button
                  v-for="lv in levelPresets"
                  :key="lv"
                  type="button"
                  :class="{ active: enemyLevel === lv }"
                  @click="enemyLevel = lv"
                >
                  Lv.{{ lv }}
                </button>
              </div>
            </div>
            <div class="combat-sim-control-group">
              <span>弱点环境</span>
              <button
                type="button"
                :class="['combat-sim-toggle', { active: weaknessMatched }]"
                @click="weaknessMatched = !weaknessMatched"
              >
                {{ weaknessMatched ? "弱点匹配 (0%抗)" : "无弱点 (20%抗)" }}
              </button>
            </div>
            <button type="button" class="combat-sim-reroll-btn" @click="rerollSeed">
              ↻ 重随演播 (#{{ seed % 10000 }})
            </button>
          </section>

          <aside v-if="unavailableNotes?.length" class="combat-sim-warn-banner">
            <strong>部分成员未计入本次模拟：</strong>{{ unavailableNotes.join("；") }}
          </aside>

          <!-- Primary summary metrics -->
          <section class="combat-sim-kpi-grid" aria-label="伤害预期概览">
            <article class="combat-sim-kpi-card is-primary">
              <span>{{ simulation.comboLabel }}</span>
              <strong>{{ formatDamageCompact(simulation.comboDamage) }}</strong>
              <small>精准均值 {{ formatDamageExact(simulation.comboDamage) }}</small>
            </article>
            <article class="combat-sim-kpi-card is-accent">
              <span>{{ cycles }} 轮模拟预期（{{ simulation.runs }} 次随机采样）</span>
              <strong>{{ formatDamageCompact(simulation.meanDamage) }}</strong>
              <small>
                预期区间 {{ formatDamageCompact(simulation.p10Damage) }} ~
                {{ formatDamageCompact(simulation.p90Damage) }}
              </small>
            </article>
            <article class="combat-sim-kpi-card">
              <span>伤害类型构成</span>
              <div class="combat-sim-kind-bar" aria-label="伤害类型占比条">
                <i
                  v-for="entry in damageKindEntries"
                  :key="entry.kind"
                  :class="`kind-${entry.kind}`"
                  :style="{ width: `${Math.max(4, entry.share * 100)}%` }"
                  :title="`${entry.label} ${(entry.share * 100).toFixed(1)}%`"
                />
              </div>
              <div class="combat-sim-kind-legend">
                <span v-for="entry in damageKindEntries" :key="entry.kind">
                  <i :class="`kind-${entry.kind}`" />{{ entry.label }}
                  <b>{{ (entry.share * 100).toFixed(0) }}%</b>
                </span>
              </div>
            </article>
          </section>

          <!-- 1 / 3 / 5 / 10 Cycle comparison strip -->
          <section class="combat-sim-cycles-strip" aria-label="1、3、5、10 轮伤害预期对比">
            <button
              v-for="row in simulation.cycleComparisons"
              :key="row.cycles"
              type="button"
              :class="['combat-sim-cycle-tile', { active: cycles === row.cycles }]"
              @click="cycles = row.cycles"
            >
              <div class="combat-sim-cycle-tile-top">
                <b>{{ row.cycles }} 轮</b>
                <small>{{ row.actions }} 动</small>
              </div>
              <strong>{{ formatDamageCompact(row.meanDamage) }}</strong>
              <span class="combat-sim-cycle-range">
                {{ formatDamageCompact(row.p10Damage) }} ~ {{ formatDamageCompact(row.p90Damage) }}
              </span>
            </button>
          </section>

          <!-- Team contributions -->
          <section
            v-if="simulation.contributionsMean.length > 1"
            class="combat-sim-contrib-card"
            aria-label="成员伤害贡献占比"
          >
            <div class="combat-sim-section-head">
              <h3>成员伤害占比（{{ cycles }} 轮均值）</h3>
              <small
                >弱点击破 {{ simulation.sampleRun.breakCount }} 次 · 总计
                {{ simulation.sampleRun.logs.length }} 步</small
              >
            </div>
            <div class="combat-sim-contrib-list">
              <div
                v-for="(item, idx) in simulation.contributionsMean"
                :key="item.characterId"
                class="combat-sim-contrib-row"
              >
                <div class="combat-sim-contrib-who">
                  <img v-if="item.avatar" :src="item.avatar" :alt="item.name" />
                  <span v-else class="combat-sim-avatar-fallback">{{ item.name.slice(0, 1) }}</span>
                  <div>
                    <strong>{{ item.name }}</strong>
                    <small
                      >{{ item.actions }} 动 ·
                      {{ item.modelingDepth === "deep" ? "深度建模" : "通用估算" }}</small
                    >
                  </div>
                </div>
                <div class="combat-sim-contrib-bar-wrap">
                  <div class="combat-sim-contrib-track">
                    <span
                      :style="{
                        width: `${Math.max(2, item.share * 100)}%`,
                        background: memberColors[idx % memberColors.length],
                      }"
                    />
                  </div>
                </div>
                <div class="combat-sim-contrib-val">
                  <strong>{{ formatDamageCompact(item.totalDamage) }}</strong>
                  <small>{{ (item.share * 100).toFixed(1) }}%</small>
                </div>
              </div>
            </div>
          </section>

          <!-- Tabs: Battle Log / Skill Breakdown / Active Rules -->
          <div class="combat-sim-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'logs'"
              :class="{ active: activeTab === 'logs' }"
              @click="activeTab = 'logs'"
            >
              战斗演播过程 ({{ simulation.sampleRun.logs.length }})
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'skills'"
              :class="{ active: activeTab === 'skills' }"
              @click="activeTab = 'skills'"
            >
              单技能伤害与乘区
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'rules'"
              :class="{ active: activeTab === 'rules' }"
              @click="activeTab = 'rules'"
            >
              机制与口径说明
            </button>
          </div>

          <CombatLogList
            v-if="activeTab === 'logs'"
            :logs="simulation.sampleRun.logs"
            :cycles="cycles"
          />
          <CombatBreakdownPanel
            v-else-if="activeTab === 'skills'"
            :combatants="combatants"
            :enemy="enemyPreset"
          />
          <section v-else class="combat-sim-rules-panel">
            <div class="combat-sim-rules-block">
              <h4>模拟环境假设</h4>
              <ul>
                <li v-for="item in simulation.assumptions" :key="item">{{ item }}</li>
              </ul>
            </div>
            <div v-if="simulation.activeMechanisms.length" class="combat-sim-rules-block">
              <h4>已生效的角色与装备战斗机制</h4>
              <ul>
                <li v-for="item in simulation.activeMechanisms" :key="item">✓ {{ item }}</li>
              </ul>
            </div>
            <div class="combat-sim-rules-block is-warn">
              <h4>说明与限制</h4>
              <ul>
                <li v-for="item in simulation.unmodeledWarnings" :key="item">△ {{ item }}</li>
              </ul>
            </div>
          </section>
        </template>
      </div>
    </aside>
  </div>
</template>

<style src="./combat-simulator.css"></style>
