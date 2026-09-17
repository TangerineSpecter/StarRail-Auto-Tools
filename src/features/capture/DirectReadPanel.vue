<script setup lang="ts">
import Button from "primevue/button";
import ExpressPassage from "./ExpressPassage.vue";
import FloatingDanmaku from "./FloatingDanmaku.vue";
import type { DirectReadSnapshot } from "@/types";

defineProps<{ direct: DirectReadSnapshot; busy: boolean; running: boolean }>();
const emit = defineEmits<{ toggle: []; "switch-account": [] }>();
</script>

<template>
  <article class="panel direct-panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">GAME DATA SYNC</p>
        <h2>游戏数据直读</h2>
        <p class="panel-description">在进入游戏前开启监听，登录后自动归档遗器、光锥与角色。</p>
      </div>
    </div>

    <div :class="['signal-vessel', { running }]">
      <div class="nebula nebula-1" />
      <div class="nebula nebula-2" />
      <div class="nebula nebula-3" />
      <div class="stellar-bg">
        <div v-for="index in 10" :key="`far-${index}`" :class="['star-far', `sf${index}`]" />
        <div v-for="index in 5" :key="`star-${index}`" :class="['star', `s${index}`]" />
        <div v-for="index in 3" :key="`bright-${index}`" :class="['star-bright', `sb${index}`]" />
        <div class="grid-lines" />
        <div v-for="index in 3" :key="`meteor-${index}`" :class="['meteor', `m${index}`]" />
      </div>
      <ExpressPassage />
      <div class="orbit-system">
        <div class="orbit-track track-inner"><div class="satellite sat-march7" /></div>
        <div class="orbit-track track-middle">
          <div class="satellite sat-danheng" />
          <div class="satellite sat-himeko" />
        </div>
        <div class="orbit-track track-outer">
          <div class="satellite sat-welt" />
          <div class="satellite sat-bronya" />
          <div class="satellite sat-seele" />
        </div>
        <div class="astral-core">
          <div class="core-diamond" aria-label="数据星体">
            <img src="/illustrations/soft-planet-core.png" alt="" class="planet-core-image" />
          </div>
        </div>
      </div>
      <FloatingDanmaku />
      <div v-if="direct.phase !== 'unsupported'" class="visual-status">
        <span :class="['status-dot', { pulse: running }]" />
        <span class="status-text">{{
          direct.phase === "ready" ? "LIVE" : direct.phase.toUpperCase()
        }}</span>
      </div>
    </div>

    <div class="capture-counts">
      <div class="count-card count-relics">
        <div class="count-card-header">
          <div class="count-card-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
              />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <div class="count-card-title">
            <span>遗器</span>
            <small>RELICS</small>
          </div>
        </div>
        <div class="count-card-body">
          <b>{{ direct.relics.toLocaleString() }}</b>
        </div>
      </div>

      <div class="count-card count-lightcones">
        <div class="count-card-header">
          <div class="count-card-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
              <path d="M8 7h8M8 11h8" />
            </svg>
          </div>
          <div class="count-card-title">
            <span>光锥</span>
            <small>LIGHT CONES</small>
          </div>
        </div>
        <div class="count-card-body">
          <b>{{ direct.lightCones.toLocaleString() }}</b>
        </div>
      </div>

      <div class="count-card count-characters">
        <div class="count-card-header">
          <div class="count-card-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div class="count-card-title">
            <span>角色</span>
            <small>CHARACTERS</small>
          </div>
        </div>
        <div class="count-card-body">
          <b>{{ direct.characters.toLocaleString() }}</b>
        </div>
      </div>
    </div>
    <div v-if="direct.requiresAccountSwitch" class="account-warning">
      <div>
        <strong>检测到不同账号</strong>
        <p>当前数据与本次登录不一致。切换将清空现有本地档案。</p>
      </div>
      <Button type="button" severity="danger" :disabled="busy" @click="emit('switch-account')"
        >确认切换</Button
      >
    </div>
    <Button
      class="primary-action"
      :disabled="busy || direct.phase === 'unsupported'"
      @click="emit('toggle')"
    >
      <span class="action-symbol" aria-hidden="true"
        ><span v-if="running">■</span
        ><svg v-else viewBox="0 0 24 24" width="14" height="14">
          <path d="M6 3.8v16.4L19 12 6 3.8Z" fill="currentColor" /></svg
      ></span>
      <span class="action-text-wrapper"
        ><small>GAME DATA SYNC</small>{{ running ? "停止实时监听" : "启动游戏数据直读" }}</span
      >
    </Button>
    <p class="privilege-note">游戏数据直读仅支持 Windows；启动后请从游戏的登录界面重新登录。</p>
  </article>
</template>
