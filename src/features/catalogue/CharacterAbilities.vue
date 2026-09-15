<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  characterAbilityGroups,
  catalogueAbilityLevels,
  defaultCatalogueAbilityLevel,
  catalogueAbilitySlotLabel,
  reviewedCatalogueAbilityRuleCount,
} from "@/shared/catalogue/mechanics";
import { resolveAbility } from "@/shared/utils/catalogue-rules";
import type { CharacterCatalogueEntry } from "@/types";

const props = defineProps<{ character: CharacterCatalogueEntry }>();
const selectedLevels = ref<Record<string, number>>({});
const groups = computed(() =>
  characterAbilityGroups(props.character).filter(
    (group) =>
      group.sourceKind !== "trace" &&
      !group.abilities.every(
        (ability) => ability.slot === "trace" || ability.groupId.startsWith("servant-traces"),
      ),
  ),
);
watch(
  () => props.character.slug,
  () => {
    selectedLevels.value = {};
  },
);
const displayedGroups = computed(() =>
  groups.value.map((group) => ({
    ...group,
    abilities: group.abilities.map((ability) => {
      const levels = catalogueAbilityLevels(ability);
      const selected = selectedLevels.value[ability.id];
      const level =
        selected != null && levels.includes(selected)
          ? selected
          : defaultCatalogueAbilityLevel(ability);
      return {
        ability,
        levels,
        level,
        description: resolveAbility(ability, level ?? undefined).description,
        reviewedRuleCount: reviewedCatalogueAbilityRuleCount(ability),
      };
    }),
  })),
);
</script>

<template>
  <section
    v-if="displayedGroups.length"
    class="catalogue-character-abilities"
    aria-label="技能与机制图鉴"
  >
    <header>
      <h3>技能与机制</h3>
      <p>图鉴等级默认为来源 1 级；可选择来源提供的等级，不代表账号培养状态。</p>
    </header>
    <section
      v-for="group in displayedGroups"
      :key="group.id"
      class="catalogue-ability-group"
      :data-owner-id="group.ownerId"
      :data-source-kind="group.sourceKind"
    >
      <h4>{{ group.label }}</h4>
      <article
        v-for="item in group.abilities"
        :key="item.ability.id"
        class="catalogue-ability"
        :data-ability-id="item.ability.id"
        :data-group-id="item.ability.groupId"
      >
        <header>
          <div>
            <small>{{ catalogueAbilitySlotLabel(item.ability.slot) }}</small>
            <h5>{{ item.ability.name }}</h5>
          </div>
          <label v-if="item.levels.length > 1">
            <span>图鉴等级</span>
            <select
              :value="item.level"
              :aria-label="`${item.ability.name}图鉴等级`"
              @change="
                selectedLevels[item.ability.id] = Number(($event.target as HTMLSelectElement).value)
              "
            >
              <option v-for="level in item.levels" :key="level" :value="level">
                Lv.{{ level }}
              </option>
            </select>
          </label>
          <small v-else-if="item.level != null">Lv.{{ item.level }}</small>
        </header>
        <p>{{ item.description }}</p>
        <small class="catalogue-ability-audit">{{
          item.reviewedRuleCount
            ? `已记录 ${item.reviewedRuleCount} 条规则，完整机制待审核`
            : "机制待审核"
        }}</small>
      </article>
    </section>
  </section>
</template>

<style scoped>
.catalogue-character-abilities {
  margin-top: 22px;
  color: var(--ink);
}
.catalogue-character-abilities > header p {
  margin: 8px 0 16px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
}
.catalogue-ability-group {
  margin-top: 16px;
}
.catalogue-ability-group h4 {
  margin: 0 0 8px;
  font-size: 14px;
}
.catalogue-ability {
  padding: 12px 0;
  border-top: 1px solid rgba(46, 80, 123, 0.18);
}
.catalogue-ability > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.catalogue-ability h5 {
  margin: 4px 0 0;
  font-size: 14px;
}
.catalogue-ability small,
.catalogue-ability label {
  color: var(--muted);
  font-size: 11px;
}
.catalogue-ability label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.catalogue-ability select {
  padding: 4px;
  border: 1px solid rgba(46, 80, 123, 0.25);
  border-radius: 4px;
  background: #fff;
  color: var(--ink);
}
.catalogue-ability p {
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
