<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from "vue";
import {
  actionAxisHorizon,
  countStaticActions,
  cycleBoundaries,
  simulateStaticActionAxis,
} from "@/shared/utils/action-axis";
import type { Team } from "@/types";
import type { TeamActionAxisProfile } from "./team-action-axis";
import { useTeamActionAxis } from "./useTeamActionAxis";

const props = defineProps<{ team: Team; revision: number }>();
const emit = defineEmits<{ close: []; error: [message: string] }>();
const axis = useTeamActionAxis();
const cycles = ref(5);
const cyclePresets = [1, 3, 5, 10];
const memberPalette = [
  { color: "#1677b8", soft: "rgba(22, 119, 184, 0.12)" },
  { color: "#d78a14", soft: "rgba(215, 138, 20, 0.13)" },
  { color: "#6657c8", soft: "rgba(102, 87, 200, 0.12)" },
  { color: "#c34f86", soft: "rgba(195, 79, 134, 0.12)" },
];

const horizon = computed(() => actionAxisHorizon(cycles.value));
const boundaries = computed(() => cycleBoundaries(cycles.value));
const rows = computed(() =>
  axis.profiles.value.map((profile) => ({
    profile,
    events:
      profile?.available && profile.speed != null
        ? simulateStaticActionAxis({
            speed: profile.speed,
            cycles: cycles.value,
            initialAdvance: profile.initialAdvance,
          })
        : [],
  })),
);
const totalActions = computed(() =>
  rows.value.reduce((total, row) => total + row.events.length, 0),
);

function countAt(profile: TeamActionAxisProfile, targetCycles: number) {
  if (!profile.available || profile.speed == null) return null;
  return countStaticActions({
    speed: profile.speed,
    cycles: targetCycles,
    initialAdvance: profile.initialAdvance,
  });
}

function percentAt(actionValue: number) {
  return `${Math.min(100, Math.max(0, (actionValue / horizon.value) * 100))}%`;
}

function cycleWidth(index: number) {
  const width = index === 0 ? 150 : 100;
  return `${(width / horizon.value) * 100}%`;
}

function memberStyle(index: number) {
  const palette = memberPalette[index % memberPalette.length]!;
  return { "--axis-color": palette.color, "--axis-soft": palette.soft };
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === "Escape" && !event.isComposing) emit("close");
}

let active = true;

function attachKeyboardListener() {
  window.addEventListener("keydown", closeOnEscape);
}

function detachKeyboardListener() {
  window.removeEventListener("keydown", closeOnEscape);
}

watch(
  () => [props.team.teamId, props.revision],
  () => {
    if (active) void axis.load(props.team);
  },
  { immediate: true },
);
watch(
  () => axis.error.value,
  (message) => {
    if (message) emit("error", message);
  },
);
onMounted(attachKeyboardListener);
onActivated(() => {
  const resumed = !active;
  active = true;
  attachKeyboardListener();
  if (resumed) void axis.load(props.team);
});
onDeactivated(() => {
  active = false;
  axis.cancel();
  detachKeyboardListener();
});
onUnmounted(() => {
  axis.cancel();
  detachKeyboardListener();
});
</script>

<template>
  <div class="detail-backdrop team-axis-backdrop" @click.self="emit('close')">
    <aside class="detail-drawer team-axis-drawer" aria-labelledby="team-axis-title">
      <header class="team-axis-header">
        <div>
          <p class="eyebrow">ACTION TIMELINE</p>
          <h2 id="team-axis-title">{{ team.name }} · 行动轴</h2>
          <small>四名角色共享同一行动值刻度，横向位置越靠左越先行动</small>
        </div>
        <button
          type="button"
          class="team-editor-close-btn"
          aria-label="关闭排轴"
          @click="emit('close')"
        >
          ×
        </button>
      </header>

      <div class="team-axis-body">
        <section class="team-axis-console" aria-label="排轴范围">
          <div class="team-axis-console-copy">
            <span>观察范围</span>
            <strong>{{ cycles }} 轮 · {{ horizon }} AV</strong>
          </div>
          <div class="team-axis-cycle-presets">
            <button
              v-for="preset in cyclePresets"
              :key="preset"
              type="button"
              :class="{ active: cycles === preset }"
              :aria-pressed="cycles === preset"
              @click="cycles = preset"
            >
              {{ preset }}轮
            </button>
          </div>
          <div class="team-axis-console-metric">
            <span>队伍总行动</span><strong>{{ totalActions }}</strong>
          </div>
        </section>

        <div class="team-axis-scope-note">
          <span class="team-axis-scope-dot" />
          <span>
            首轮 150 AV，后续每轮 100
            AV。已计入装备站街速度、启用行迹和翁瓦克；动态变速与拉条暂不模拟。
          </span>
        </div>

        <div v-if="axis.loading.value" class="team-axis-loading" aria-live="polite">
          <div v-for="index in 4" :key="index" />
          <span>正在汇总角色速度与装备…</span>
        </div>

        <section v-else class="team-axis-parallel-chart" aria-label="配队平行行动轴">
          <header class="team-axis-scale-row">
            <span class="team-axis-scale-side">角色 / 速度</span>
            <div class="team-axis-cycle-bands">
              <span v-for="index in cycles" :key="index" :style="{ width: cycleWidth(index - 1) }">
                <b>第{{ index }}轮</b>
                <small
                  >{{ index === 1 ? "0—150" : `${index * 100 - 50}—${index * 100 + 50}` }} AV</small
                >
              </span>
            </div>
            <span class="team-axis-scale-side end">行动次数</span>
          </header>

          <article
            v-for="(row, index) in rows"
            :key="row.profile?.characterId ?? `empty-${index}`"
            class="team-axis-parallel-row"
            :style="memberStyle(index)"
          >
            <template v-if="row.profile">
              <div class="team-axis-member">
                <img v-if="row.profile.avatar" :src="row.profile.avatar" :alt="row.profile.name" />
                <span v-else class="team-axis-avatar-fallback">{{
                  row.profile.name.slice(0, 1)
                }}</span>
                <div>
                  <strong>{{ row.profile.name }}</strong>
                  <span v-if="row.profile.speed != null"
                    >SPD {{ row.profile.speed.toFixed(1) }}</span
                  >
                  <span v-else>速度不可用</span>
                </div>
              </div>

              <div class="team-axis-lane-cell">
                <div v-if="row.profile.available" class="team-axis-lane">
                  <i
                    v-for="boundary in boundaries.slice(0, -1)"
                    :key="boundary"
                    class="team-axis-boundary"
                    :style="{ left: percentAt(boundary) }"
                  />
                  <span class="team-axis-lane-line" />
                  <span
                    v-for="event in row.events"
                    :key="event.ordinal"
                    :class="['team-axis-action-marker', { initial: event.initialAdvanceApplied }]"
                    :style="{ left: percentAt(event.actionValue) }"
                    tabindex="0"
                    :aria-label="`${row.profile.name}第 ${event.ordinal} 次行动，${event.actionValue.toFixed(2)} AV`"
                  >
                    <b>{{ event.ordinal }}</b>
                    <small role="tooltip">
                      第{{ event.ordinal }}次 · 第{{ event.cycle }}轮 ·
                      {{ event.actionValue.toFixed(1) }} AV
                    </small>
                  </span>
                </div>
                <div v-else class="team-axis-unavailable">{{ row.profile.reason }}</div>

                <div
                  v-if="row.profile.initialAdvanceLabel || row.profile.warnings.length"
                  class="team-axis-row-notes"
                >
                  <span v-if="row.profile.initialAdvanceLabel" class="included">
                    ✓ {{ row.profile.initialAdvanceLabel }}
                  </span>
                  <span v-for="warning in row.profile.warnings" :key="warning"
                    >△ {{ warning }}</span
                  >
                </div>
              </div>

              <div class="team-axis-count">
                <strong>{{ row.events.length }}</strong>
                <span>首轮 {{ countAt(row.profile, 1) ?? "—" }}</span>
                <small>10轮 {{ countAt(row.profile, 10) ?? "—" }}</small>
              </div>
            </template>
            <div v-else class="team-axis-empty-row">空位</div>
          </article>
        </section>

        <footer v-if="!axis.loading.value" class="team-axis-legend">
          <span><i class="natural" />圆点编号为该角色第几次行动</span>
          <span><i class="initial" />金色表示开局行动提前后的首次行动</span>
          <small>悬停圆点查看精确 AV。</small>
        </footer>
      </div>
    </aside>
  </div>
</template>
