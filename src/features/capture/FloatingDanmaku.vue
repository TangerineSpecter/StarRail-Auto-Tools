<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

const danmakuTexts = [
  "愿此行，终抵群星",
  "开拓继续向前✨",
  "星核猎手登场",
  "模拟宇宙启动",
  "存护永存",
  "毁灭万岁٩(°༥°)و",
  "同谐至上",
  "巡猎不息",
  "智识无尽",
  "虚无永寂",
  "欢愉乐无穷 (≧∇≦)",
  "繁育生生不息",
  "银河倒霉蛋",
  "0+0 起步",
  "2+1 毕业",
  "快刷遗器！",
  "出双爆！🎉",
  "别歪常驻！",
  "神君出击",
  "牢景上线",
  "存狐之志",
  "雨一直下",
  "人有五名，代价有三",
  "所以我出手了",
  "规则就是用来打破的",
  "银河幸运星⭐",
  "来一把赌局",
  "击破特攻拉满",
  "速度鞋在哪里 (｡・́ω・̀｡)",
  "抵抗别触发",
  "弱点破防！",
  "痛失双爆",
  "牢遗器启动",
  "忘却之庭开战",
  "寰宇蝗灾来袭",
  "碎片求求了",
  "别出防御！",
  "星神博弈",
  "列车出发🚂",
  "点赞的开拓者十连三金✨",
  "关注点一点，小保底不歪",
  "十连必出 UP 角色",
  "拒绝大保底！",
  "十连双黄降临",
  "星琼永不白费",
  "跃迁金光铺满屏幕 (≧∇≦)",
  "单抽出奇迹",
  "垫池出金",
  "远离常驻五虎",
  "金光不要停！",
  "遗器强化不歪🥺",
  "追词条全是双爆",
  "速度词条速速到来",
  "早日 2+1 毕业",
  "欧气传给每一位开拓者",
  "拒绝牢保底",
  "星神眷顾开拓者",
  "一发十连直接圆梦",
  "告别非酋身份",
  "金光抵达列车站台",
  "玄学跃迁，必出目标角色",
  "萤门永存！！！",
];

const danmakuStyles = [
  "style-trailblazer", // 金色
  "style-stellaron", // 玫红
  "style-stars", // 青色
  "style-abundance", // 绿色
  "style-nihility", // 紫色
];

interface Danmaku {
  id: number;
  text: string;
  styleClass: string;
  top: number;
  duration: number;
  delay: number;
}

const activeDanmakus = ref<Danmaku[]>([]);
let nextId = 0;
let timer: number | null = null;

const trackCount = 6;
const trackHeight = 100 / trackCount;
const trackLastFired = new Array(trackCount).fill(0);

const spawnDanmaku = () => {
  const activeTexts = activeDanmakus.value.map((d) => d.text);
  const availableTexts = danmakuTexts.filter((t) => !activeTexts.includes(t));

  if (availableTexts.length === 0) return; // 如果全部文本都在屏幕上，暂时不发

  const text = availableTexts[Math.floor(Math.random() * availableTexts.length)];
  const style = danmakuStyles[Math.floor(Math.random() * danmakuStyles.length)];
  const now = Date.now();

  let availableTracks = [];
  // 避开最顶部和最底部，保持视觉居中
  for (let i = 1; i < trackCount - 1; i++) {
    if (now - trackLastFired[i] > 2500) {
      availableTracks.push(i);
    }
  }

  if (availableTracks.length === 0) return;

  const trackIndex = availableTracks[Math.floor(Math.random() * availableTracks.length)];
  trackLastFired[trackIndex] = now;

  const topOffset = trackIndex * trackHeight + (Math.random() * 4 - 2);
  const duration = 6 + Math.random() * 4; // 6s - 10s

  const danmaku: Danmaku = {
    id: nextId++,
    text: text,
    styleClass: style,
    top: topOffset,
    duration: duration,
    delay: -(Math.random() * 4), // 初始相位错开，让浮动不同步
  };

  activeDanmakus.value.push(danmaku);

  // 动画结束后移除
  setTimeout(
    () => {
      activeDanmakus.value = activeDanmakus.value.filter((d) => d.id !== danmaku.id);
    },
    duration * 1000 + 100,
  );
};

onMounted(() => {
  // 初始发射
  setTimeout(spawnDanmaku, 500);
  setTimeout(spawnDanmaku, 1500);

  timer = window.setInterval(spawnDanmaku, 1200) as unknown as number;
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="floating-danmaku-container">
    <div
      v-for="item in activeDanmakus"
      :key="item.id"
      class="float-wrapper"
      :style="{ top: item.top + '%', animationDelay: item.delay + 's' }"
    >
      <div
        :class="['danmaku-item', item.styleClass]"
        :style="{ animationDuration: item.duration + 's' }"
      >
        {{ item.text }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.floating-danmaku-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
  overflow: hidden;
}

.float-wrapper {
  position: absolute;
  left: 0;
  width: 100%;
  will-change: transform;
  animation: float-y 4s ease-in-out infinite alternate;
}

@keyframes float-y {
  0% {
    transform: translateY(-6px);
  }
  100% {
    transform: translateY(6px);
  }
}

.danmaku-item {
  position: absolute;
  left: 100%; /* 起始位置在容器最右侧 */
  white-space: nowrap;
  display: flex;
  align-items: center;
  padding: 6px 16px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.5px;

  /* Remove glassmorphism */
  /* background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2); */

  /* Add slight text shadow for better readability on complex background */
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);

  /* Animation */
  will-change: transform, opacity;
  animation: slide-left linear forwards;
}

/* 样式 1: 星穹金色 (开拓/存护) */
.style-trailblazer {
  color: #fff;
  text-shadow:
    0 0 8px rgba(203, 163, 101, 0.8),
    0 2px 4px rgba(0, 0, 0, 0.5);
}

/* 样式 2: 星核猎手 (玫红/毁灭) */
.style-stellaron {
  color: #fff;
  text-shadow:
    0 0 8px rgba(216, 73, 126, 0.8),
    0 2px 4px rgba(0, 0, 0, 0.5);
}

/* 样式 3: 群星 (青白/巡猎) */
.style-stars {
  color: #e0f7fa;
  text-shadow:
    0 0 8px rgba(128, 222, 234, 0.8),
    0 2px 4px rgba(0, 0, 0, 0.5);
}

/* 样式 4: 丰饶 (翠绿/同谐) */
.style-abundance {
  color: #e8f5e9;
  text-shadow:
    0 0 8px rgba(129, 199, 132, 0.8),
    0 2px 4px rgba(0, 0, 0, 0.5);
}

/* 样式 5: 虚无 (暗紫/智识) */
.style-nihility {
  color: #f3e5f5;
  text-shadow:
    0 0 8px rgba(171, 71, 188, 0.8),
    0 2px 4px rgba(0, 0, 0, 0.5);
}

/* 主滑动动画 - 向左移动100vw保证能穿过整个屏幕 */
@keyframes slide-left {
  0% {
    transform: translateX(0) scale(0.9);
    opacity: 0;
  }
  5% {
    opacity: 1;
    transform: translateX(-5vw) scale(1);
  }
  95% {
    opacity: 1;
    transform: translateX(-95vw) scale(1);
  }
  100% {
    transform: translateX(-100vw) scale(0.9);
    opacity: 0;
  }
}
</style>
