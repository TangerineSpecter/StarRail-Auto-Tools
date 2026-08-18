<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { inventoryApi } from "@/shared/api/inventory";
import { catalogueCharacterId, lightConeById, relicCatalogue } from "@/shared/catalogue";
import { formatStatValue, pathLabel, slotLabel, statLabel } from "@/shared/catalogue/relic-options";
import { formatBaseStat } from "@/shared/utils/display";
import type { CharacterCatalogueEntry } from "@/types";
import type { CatalogueCharacterEquipment, CatalogueEquippedRelic } from "./equipped-items";
import { useCloseOnEscape } from "./close-on-escape";

const props = defineProps<{ character: CharacterCatalogueEntry }>();
const emit = defineEmits<{ close: [] }>();
useCloseOnEscape(() => emit("close"));

const equipment = ref<CatalogueCharacterEquipment | null>(null);
const equipmentLoading = ref(true);
const equipmentError = ref(false);
let requestId = 0;

const equippedRelics = computed(() => equipment.value?.equippedRelics ?? []);
const equippedLightCone = computed(() => equipment.value?.equippedLightCone ?? null);
const lightConeImage = computed(() =>
  equippedLightCone.value
    ? (lightConeById.get(equippedLightCone.value.templateId)?.image ?? undefined)
    : undefined,
);
const relicPieceImage = (relic: CatalogueEquippedRelic) =>
  relicCatalogue.sets
    .find((set) => set.id === relic.setId)
    ?.pieces?.find((piece) => piece.slot === relic.slot)?.image;

async function loadEquipment() {
  const currentRequest = ++requestId;
  equipmentLoading.value = true;
  equipmentError.value = false;
  try {
    const characters = await inventoryApi.listCharacters({
      page: 1,
      pageSize: 20,
      names: [props.character.name],
    });
    const expectedId = catalogueCharacterId(props.character);
    const inventoryCharacter =
      characters.items.find((item) => expectedId != null && item.characterId === expectedId) ??
      characters.items.find((item) => pathLabel(item.path) === props.character.path) ??
      characters.items[0];
    if (!inventoryCharacter) {
      if (currentRequest === requestId) equipment.value = null;
      return;
    }
    const detail = await inventoryApi.detail("character", inventoryCharacter.characterId);
    if (currentRequest === requestId)
      equipment.value = detail.data as unknown as CatalogueCharacterEquipment;
  } catch {
    if (currentRequest === requestId) equipmentError.value = true;
  } finally {
    if (currentRequest === requestId) equipmentLoading.value = false;
  }
}

onMounted(loadEquipment);
onBeforeUnmount(() => {
  requestId += 1;
});
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
        <section class="catalogue-character-equipment">
          <header>
            <div>
              <p class="eyebrow">CURRENT EQUIPMENT</p>
              <h3>当前装备</h3>
            </div>
            <small v-if="equipment">{{ equippedRelics.length }} / 6 件遗器</small>
          </header>
          <p v-if="equipmentLoading" class="equipment-empty">正在读取本地背包装备…</p>
          <p v-else-if="equipmentError" class="equipment-empty">
            本地背包读取失败，暂无法展示装备。
          </p>
          <p v-else-if="!equipment" class="equipment-empty">本地背包中尚未同步该角色。</p>
          <div v-else class="equipment-layout">
            <article :class="['equipment-light-cone', { empty: !equippedLightCone }]">
              <img v-if="lightConeImage" :src="lightConeImage" alt="" />
              <span v-else>◇</span>
              <div>
                <small>光锥</small>
                <b>{{ equippedLightCone?.name ?? "未装备光锥" }}</b>
                <em v-if="equippedLightCone"
                  >Lv.{{ equippedLightCone.level }} · 叠影
                  {{ equippedLightCone.superimposition }}</em
                >
              </div>
            </article>
            <div class="equipment-relic-grid">
              <article v-for="relic in equippedRelics" :key="relic.itemId" class="equipment-relic">
                <img v-if="relicPieceImage(relic)" :src="relicPieceImage(relic)" alt="" />
                <span v-else>{{ slotLabel(relic.slot).slice(0, 1) }}</span>
                <div>
                  <small>{{ slotLabel(relic.slot) }} · +{{ relic.level }}</small>
                  <b>{{ relic.name }}</b>
                  <em
                    >{{ statLabel(relic.mainStat) }}
                    {{ formatStatValue(relic.mainStat, relic.mainStatValue) }}</em
                  >
                </div>
              </article>
              <p v-if="!equippedRelics.length" class="equipment-empty">尚未装备遗器或位面饰品。</p>
            </div>
          </div>
        </section>
        <footer>基础属性不含光锥、遗器、行迹、星魂和战斗内增益；当前装备来自本地背包。</footer>
      </div>
    </section>
  </div>
</template>
