<script setup lang="ts">
import type { CharacterCatalogueEntry } from "@/types";
defineProps<{ characters: CharacterCatalogueEntry[] }>();
const emit = defineEmits<{ select: [character: CharacterCatalogueEntry] }>();
</script>
<template>
  <div class="character-catalogue-grid">
    <button
      v-for="character in characters"
      :key="character.slug"
      class="character-catalogue-card"
      type="button"
      aria-haspopup="dialog"
      :aria-label="`查看${character.name}的 80 级基础属性`"
      @click="emit('select', character)"
    >
      <div
        v-if="character.image"
        class="character-catalogue-portrait"
        :style="
          character.backgroundImage
            ? { backgroundImage: `url(${character.backgroundImage})` }
            : undefined
        "
      >
        <img class="character-image" :src="character.image" :alt="character.name" />
        <div class="character-icons">
          <img
            v-if="character.elementIcon"
            :src="character.elementIcon"
            alt=""
            class="element-icon"
          /><img v-if="character.pathIcon" :src="character.pathIcon" alt="" class="path-icon" />
        </div>
      </div>
      <span v-else>◇</span>
      <div class="character-info">
        <h4>{{ character.name }}</h4>
        <div class="character-text-tags">
          <span class="tag-element">{{ character.element }}</span
          ><span class="tag-divider" /><span class="tag-path">{{ character.path }}</span>
        </div>
      </div>
    </button>
  </div>
</template>
