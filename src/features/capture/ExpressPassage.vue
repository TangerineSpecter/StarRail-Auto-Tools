<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

type StarParticle = {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  driftX: number;
  driftY: number;
  color: string;
};

const CROSSING_DURATION_MS = 40_000;
const particles = ref<StarParticle[]>([]);
const lane = ref<HTMLElement | null>(null);
const train = ref<HTMLElement | null>(null);

let firstFrameAt = 0;
let particleId = 0;
let spawnTimer: number | undefined;

function createParticle() {
  const laneRect = lane.value?.getBoundingClientRect();
  const trainRect = train.value?.getBoundingClientRect();
  if (!laneRect || !trainRect || firstFrameAt === 0) return;

  const phase = ((performance.now() - firstFrameAt) % CROSSING_DURATION_MS) / CROSSING_DURATION_MS;
  const movingLeft = phase >= 0.06 && phase <= 0.44;
  const movingRight = phase >= 0.56 && phase <= 0.94;
  if (!movingLeft && !movingRight) return;

  const travelDirection = movingLeft ? 1 : -1;
  const colors = ["#fff8bd", "#d9f7ff", "#9cddff", "#ffe2a8"];
  const duration = 3000 + Math.round(Math.random() * 2200);
  const particle: StarParticle = {
    id: particleId++,
    x: (movingLeft ? trainRect.right : trainRect.left) - laneRect.left,
    y: trainRect.top - laneRect.top + trainRect.height * (0.42 + Math.random() * 0.2),
    size: 4 + Math.random() * 5,
    duration,
    driftX: travelDirection * (5 + Math.random() * 24),
    driftY: -14 + Math.random() * 28,
    color: colors[Math.floor(Math.random() * colors.length)],
  };

  particles.value.push(particle);
  window.setTimeout(() => {
    particles.value = particles.value.filter(({ id }) => id !== particle.id);
  }, duration);
}

function scheduleParticle() {
  createParticle();
  spawnTimer = window.setTimeout(scheduleParticle, 45 + Math.random() * 90);
}

function particleStyle(particle: StarParticle) {
  return {
    "--particle-x": `${particle.x}px`,
    "--particle-y": `${particle.y}px`,
    "--particle-size": `${particle.size}px`,
    "--particle-duration": `${particle.duration}ms`,
    "--particle-drift-x": `${particle.driftX}px`,
    "--particle-drift-y": `${particle.driftY}px`,
    "--particle-color": particle.color,
  };
}

onMounted(() => {
  requestAnimationFrame(() => {
    firstFrameAt = performance.now();
    scheduleParticle();
  });
});

onUnmounted(() => {
  if (spawnTimer !== undefined) window.clearTimeout(spawnTimer);
});
</script>

<template>
  <div ref="lane" class="express-lane" aria-hidden="true">
    <div class="express-particle-layer">
      <i
        v-for="particle in particles"
        :key="particle.id"
        class="express-particle"
        :style="particleStyle(particle)"
      ></i>
    </div>
    <div ref="train" class="express-pass">
      <img src="/illustrations/express-sprite.png" alt="" />
    </div>
  </div>
</template>

<style scoped>
.express-particle-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.express-particle {
  position: absolute;
  top: var(--particle-y);
  left: var(--particle-x);
  width: var(--particle-size);
  height: var(--particle-size);
  background: transparent;
  isolation: isolate;
  mix-blend-mode: screen;
  animation: star-route var(--particle-duration) ease-out forwards;
}

.express-particle::before,
.express-particle::after {
  position: absolute;
  content: "";
}

.express-particle::before {
  z-index: -1;
  inset: -3px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--particle-color) 58%, transparent);
  filter: blur(2.5px);
  opacity: 0.62;
}

.express-particle::after {
  inset: 0;
  background: var(--particle-color);
  clip-path: polygon(50% 0%, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0% 50%, 38% 38%);
  filter: drop-shadow(0 0 1px #fffef0) drop-shadow(0 0 3px var(--particle-color));
}

@keyframes star-route {
  0% {
    opacity: 0;
    transform: translate3d(0, 0, 0) scale(0.25) rotate(0deg);
  }
  13% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1.15) rotate(20deg);
  }
  55% { opacity: 0.74; }
  100% {
    opacity: 0;
    transform: translate3d(var(--particle-drift-x), var(--particle-drift-y), 0) scale(0.2) rotate(90deg);
  }
}
</style>
