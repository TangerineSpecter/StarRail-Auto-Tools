<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

type ParticleType = "sparkle" | "dust" | "nebula";

interface Particle {
  id: number;
  type: ParticleType;
  x: number;
  y: number;
  baseY: number;
  vx: number;
  vy: number;
  size: number;
  maxSize: number;
  spikes: number;
  rotation: number;
  rotSpeed: number;
  color: string;
  alpha: number;
  maxAlpha: number;
  age: number;
  maxAge: number;
  waveOffset: number;
}

const CROSSING_DURATION_MS = 40_000;
const lane = ref<HTMLElement | null>(null);
const train = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

let firstFrameAt = 0;
let animFrameId: number | undefined;
let nextParticleId = 0;
let frameCounter = 0;

const particles: Particle[] = [];

// 崩坏：星穹铁道 银河星轨主题色系
const PALETTE = [
  "#38bdf8", // 蔚蓝
  "#60a5fa", // 亮蓝
  "#818cf8", // 幻紫
  "#c084fc", // 晶紫
  "#fbbf24", // 璀璨金
  "#fef08a", // 浅金
  "#ffffff", // 晶白
];

function drawSparkleStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spikes: number,
  outerRadius: number,
  innerRadius: number,
  rotation: number,
  color: string,
  alpha: number,
) {
  if (outerRadius <= 0.5 || alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  ctx.beginPath();
  const step = Math.PI / spikes;
  let rot = -Math.PI / 2;
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(Math.cos(rot) * outerRadius, Math.sin(rot) * outerRadius);
    rot += step;
    ctx.lineTo(Math.cos(rot) * innerRadius, Math.sin(rot) * innerRadius);
    rot += step;
  }
  ctx.closePath();

  ctx.shadowColor = color;
  ctx.shadowBlur = outerRadius * 1.5;
  ctx.fillStyle = color;
  ctx.fill();

  // 核心微亮点
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(0.6, outerRadius * 0.2), 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  ctx.restore();
}

function spawnParticles(engineX: number, engineY: number, dir: number) {
  // 减少生成频率，避免车尾处密集堆积
  // 1. 光芒星 (Sparkle)：降低概率，分散在车尾后方
  if (frameCounter % 3 === 0 && Math.random() < 0.6) {
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const isEightSpike = Math.random() < 0.2;
    particles.push({
      id: nextParticleId++,
      type: "sparkle",
      x: engineX + dir * (Math.random() * 8), // 微偏移
      y: engineY + (Math.random() - 0.5) * 12,
      baseY: engineY + (Math.random() - 0.5) * 12,
      vx: dir * (1.2 + Math.random() * 2.2), // 往车后漂移
      vy: (Math.random() - 0.5) * 0.8,
      size: 2,
      maxSize: 4 + Math.random() * 9,
      spikes: isEightSpike ? 8 : 4,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.05,
      color,
      alpha: 0,
      maxAlpha: 0.7 + Math.random() * 0.3,
      age: 0,
      maxAge: 50 + Math.floor(Math.random() * 40),
      waveOffset: Math.random() * Math.PI * 2,
    });
  }

  // 2. 星尘细微点 (Dust)：轻盈散落
  if (frameCounter % 2 === 0) {
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    particles.push({
      id: nextParticleId++,
      type: "dust",
      x: engineX + dir * (Math.random() * 6),
      y: engineY + (Math.random() - 0.5) * 10,
      baseY: engineY + (Math.random() - 0.5) * 10,
      vx: dir * (0.8 + Math.random() * 2.0),
      vy: (Math.random() - 0.5) * 1.2,
      size: 1,
      maxSize: 1.5 + Math.random() * 2.5,
      spikes: 4,
      rotation: 0,
      rotSpeed: 0,
      color,
      alpha: 0,
      maxAlpha: 0.6 + Math.random() * 0.35,
      age: 0,
      maxAge: 40 + Math.floor(Math.random() * 35),
      waveOffset: Math.random() * Math.PI * 2,
    });
  }

  // 3. 超柔云雾光斑 (Nebula)：代替原先生硬的折线，在背景衬托浪漫星辉
  if (frameCounter % 6 === 0) {
    const color = PALETTE[Math.floor(Math.random() * (PALETTE.length - 2))];
    particles.push({
      id: nextParticleId++,
      type: "nebula",
      x: engineX,
      y: engineY + (Math.random() - 0.5) * 8,
      baseY: engineY,
      vx: dir * (0.6 + Math.random() * 1.4),
      vy: (Math.random() - 0.5) * 0.6,
      size: 4,
      maxSize: 14 + Math.random() * 16,
      spikes: 0,
      rotation: 0,
      rotSpeed: 0,
      color,
      alpha: 0,
      maxAlpha: 0.15 + Math.random() * 0.15, // 非常透亮的软晕
      age: 0,
      maxAge: 60 + Math.floor(Math.random() * 30),
      waveOffset: Math.random() * Math.PI * 2,
    });
  }
}

function render() {
  const cvs = canvas.value;
  const laneEl = lane.value;
  const trainEl = train.value;

  if (!cvs || !laneEl || !trainEl) {
    animFrameId = requestAnimationFrame(render);
    return;
  }

  const ctx = cvs.getContext("2d");
  if (!ctx) return;

  // 处理 Canvas 视口大小与 Retina 缩放
  const rect = laneEl.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(rect.width);
  const height = Math.floor(rect.height);

  if (cvs.width !== width * dpr || cvs.height !== height * dpr) {
    cvs.width = width * dpr;
    cvs.height = height * dpr;
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  frameCounter++;

  // 计算列车运行阶段
  const now = performance.now();
  if (firstFrameAt === 0) firstFrameAt = now;
  const phase = ((now - firstFrameAt) % CROSSING_DURATION_MS) / CROSSING_DURATION_MS;

  const movingLeft = phase >= 0.06 && phase <= 0.44;
  const movingRight = phase >= 0.56 && phase <= 0.94;
  const isMoving = movingLeft || movingRight;

  if (isMoving) {
    const trainRect = trainEl.getBoundingClientRect();
    const laneRect = rect;

    const engine = movingLeft
      ? {
          // 向左行驶，尾巴在右侧 (trainRect.right)
          x: trainRect.right - laneRect.left,
          y: trainRect.top - laneRect.top + trainRect.height * 0.5,
          dir: 1,
        }
      : {
          // 向右行驶，尾巴在左侧 (trainRect.left)
          x: trainRect.left - laneRect.left,
          y: trainRect.top - laneRect.top + trainRect.height * 0.5,
          dir: -1,
        };

    spawnParticles(engine.x, engine.y, engine.dir);
  }

  // 渲染并更新粒子
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age++;
    p.x += p.vx;
    p.y += p.vy + Math.sin(frameCounter * 0.04 + p.waveOffset) * 0.25;
    p.rotation += p.rotSpeed;

    const progress = p.age / p.maxAge;

    // 平滑正弦透明度曲线：刚从车尾出来时透明度为 0，慢慢升起并在中段绽放，随后自然隐去
    p.alpha = Math.sin(progress * Math.PI) * p.maxAlpha;

    if (p.age >= p.maxAge) {
      particles.splice(i, 1);
      continue;
    }

    if (p.type === "nebula") {
      // 柔和背景气云圆斑
      const curSize = p.size + (p.maxSize - p.size) * Math.sin(progress * Math.PI);
      ctx.save();
      ctx.globalAlpha = p.alpha;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, curSize);
      grad.addColorStop(0, p.color);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, curSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (p.type === "sparkle") {
      // 四角/八角光芒星 (从车尾离开后在空中自然放大闪烁)
      const curSize = p.size + (p.maxSize - p.size) * Math.sin(progress * Math.PI);
      drawSparkleStar(
        ctx,
        p.x,
        p.y,
        p.spikes,
        curSize,
        curSize * 0.2,
        p.rotation,
        p.color,
        p.alpha,
      );
    } else if (p.type === "dust") {
      // 飘散星尘点
      const curSize = p.size + (p.maxSize - p.size) * Math.sin(progress * Math.PI);
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 4;

      ctx.beginPath();
      ctx.arc(p.x, p.y, curSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.restore(); // 还原 compositeOperation
  ctx.restore(); // 还原 dpr scale

  animFrameId = requestAnimationFrame(render);
}

onMounted(() => {
  animFrameId = requestAnimationFrame(render);
});

onUnmounted(() => {
  if (animFrameId !== undefined) {
    cancelAnimationFrame(animFrameId);
  }
});
</script>

<template>
  <div ref="lane" class="express-lane" aria-hidden="true">
    <canvas ref="canvas" class="express-canvas"></canvas>
    <div ref="train" class="express-pass">
      <img src="/illustrations/express-sprite.png" alt="" />
    </div>
  </div>
</template>

<style scoped>
.express-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.express-pass {
  z-index: 2;
}
</style>
