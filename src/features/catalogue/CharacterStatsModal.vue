<script setup lang="ts">
import { formatBaseStat } from "@/shared/utils/display";
import type { CharacterCatalogueEntry } from "@/types";
defineProps<{ character: CharacterCatalogueEntry }>();
const emit = defineEmits<{ close: [] }>();
</script>
<template>
  <div class="catalogue-character-modal-backdrop" @click.self="emit('close')">
    <section
      class="catalogue-character-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="`${character.name}的基础属性`"
    >
      <button class="catalogue-character-modal-close" type="button" @click="emit('close')">
        ×
      </button>
      <div
        class="catalogue-character-modal-hero"
        :style="
          character.backgroundImage
            ? { backgroundImage: `url(${character.backgroundImage})` }
            : undefined
        "
      >
        <img v-if="character.image" :src="character.image" :alt="character.name" />
        <div class="catalogue-character-modal-title">
          <p>BASELINE PROFILE</p>
          <h2>{{ character.name }}</h2>
          <span>{{ character.element }} · {{ character.path }}</span>
        </div>
      </div>
      <div class="catalogue-character-modal-body">
        <header>
          <div>
            <p class="eyebrow">LEVEL 80 · MAX ASCENSION</p>
            <h3>基础属性</h3>
          </div>
          <small>满级</small>
        </header>
        <div v-if="character.baseStats" class="base-stat-grid">
          <div>
            <span>生命值</span><b>{{ formatBaseStat(character.baseStats.hp) }}</b
            ><small>HP</small>
          </div>
          <div>
            <span>攻击力</span><b>{{ formatBaseStat(character.baseStats.attack) }}</b
            ><small>ATK</small>
          </div>
          <div>
            <span>防御力</span><b>{{ formatBaseStat(character.baseStats.defense) }}</b
            ><small>DEF</small>
          </div>
          <div>
            <span>速度</span><b>{{ formatBaseStat(character.baseStats.speed) }}</b
            ><small>SPD</small>
          </div>
          <div>
            <span>嘲讽</span><b>{{ formatBaseStat(character.baseStats.taunt) }}</b
            ><small>TAUNT</small>
          </div>
        </div>
        <p v-else class="base-stat-empty">该角色的基础属性尚未同步。</p>
        <footer>不含光锥、遗器、行迹、星魂和战斗内增益</footer>
      </div>
    </section>
  </div>
</template>
