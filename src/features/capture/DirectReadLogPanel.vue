<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import type { DirectReadSnapshot } from "@/types";

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const props = defineProps<{ direct: DirectReadSnapshot; running: boolean }>();
const logView = ref<HTMLElement | null>(null);

const formattedLogs = computed(() =>
  (props.direct.logs ?? []).map((entry, index) => {
    const date = new Date(entry.at);
    return {
      key: `${entry.at}-${index}`,
      level: entry.level,
      message: entry.message,
      iso: date.toISOString(),
      timeLabel: timeFormatter.format(date),
    };
  }),
);

onMounted(() => {
  if (logView.value) logView.value.scrollTop = logView.value.scrollHeight;
});

watch(
  () => props.direct.logs?.at(-1)?.at,
  async () => {
    const view = logView.value;
    if (!view || view.scrollTop + view.clientHeight < view.scrollHeight - 32) return;
    await nextTick();
    if (logView.value) logView.value.scrollTop = logView.value.scrollHeight;
  },
);
</script>

<template>
  <article class="panel direct-log-panel" aria-label="游戏数据监听日志">
    <div class="panel-heading compact">
      <div>
        <p class="eyebrow">CAPTURE ACTIVITY</p>
        <h2>监听日志</h2>
      </div>
      <span :class="['direct-log-state', { active: running }]">
        <span class="direct-log-indicator" />{{ running ? "监听中" : "未监听" }}
      </span>
    </div>
    <div
      ref="logView"
      class="direct-log-lines"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
    >
      <p v-if="!formattedLogs.length" class="direct-log-empty">
        {{ direct.message || "等待启动监听…" }}
      </p>
      <p
        v-for="entry in formattedLogs"
        :key="entry.key"
        :class="['direct-log-line', `direct-log-${entry.level}`]"
      >
        <time :datetime="entry.iso">{{ entry.timeLabel }}</time
        ><span>{{ entry.message }}</span>
      </p>
    </div>
  </article>
</template>
