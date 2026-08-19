<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import { characterDisplayName, resolveCharacterCatalogue } from "@/shared/catalogue";
import type { CharacterBuildScore, CharacterListItem, Team, TeamInput } from "@/types";
import { listAllOwnedCharacters } from "./list-owned-characters";
import TeamCharacterPicker from "./TeamCharacterPicker.vue";
import {
  MAX_TEAM_NAME_LEN,
  MAX_TEAM_NOTE_LEN,
  TEAM_SLOT_COUNT,
  characterIdsFromTeam,
  emptyCharacterIds,
  gradeClass,
  memberInitial,
  normalizeTeamInput,
} from "./team-utils";

const props = defineProps<{
  team: Team | null;
  busy: boolean;
  memberScores?: Map<number, CharacterBuildScore>;
}>();
const emit = defineEmits<{
  close: [];
  save: [input: TeamInput];
  error: [message: string];
}>();

const draft = reactive({
  name: "",
  note: "",
  characterIds: emptyCharacterIds() as Array<number | null>,
});
const characterMap = ref<Map<number, CharacterListItem>>(new Map());
const pickingSlot = ref<number | null>(null);
const loadingCharacters = ref(false);

function slotScore(index: number): CharacterBuildScore | null {
  const id = draft.characterIds[index];
  if (id == null) return null;
  return props.memberScores?.get(id) ?? null;
}

const isEdit = computed(() => props.team != null);
const title = computed(() => (isEdit.value ? "编辑配队" : "新建配队"));

const excludeIds = computed(() =>
  draft.characterIds.filter(
    (id): id is number => id != null && id !== draft.characterIds[pickingSlot.value ?? -1],
  ),
);

function resetDraft() {
  draft.name = props.team?.name ?? "";
  draft.note = props.team?.note ?? "";
  draft.characterIds = props.team ? characterIdsFromTeam(props.team) : emptyCharacterIds();
}

async function loadOwnedCharacters() {
  loadingCharacters.value = true;
  try {
    const items = await listAllOwnedCharacters();
    characterMap.value = new Map(items.map((item) => [item.characterId, item]));
  } catch (cause) {
    emit("error", String(cause));
  } finally {
    loadingCharacters.value = false;
  }
}

function slotMember(index: number) {
  const id = draft.characterIds[index];
  if (id == null) return null;
  const owned = characterMap.value.get(id);
  if (owned) {
    return {
      characterId: owned.characterId,
      name: owned.name,
      path: owned.path,
      level: owned.level,
      owned: true as const,
    };
  }
  const fromTeam = props.team?.members[index];
  if (fromTeam && fromTeam.characterId === id) {
    return { ...fromTeam, owned: false as const };
  }
  return {
    characterId: id,
    name: `角色 #${id}`,
    path: "",
    level: 0,
    owned: false as const,
  };
}

function slotDisplayName(index: number) {
  const member = slotMember(index);
  if (!member) return "";
  return characterDisplayName({
    characterId: member.characterId,
    name: member.name,
    path: member.path,
  });
}

function slotAvatar(index: number) {
  const member = slotMember(index);
  if (!member) return undefined;
  return (
    resolveCharacterCatalogue({
      characterId: member.characterId,
      name: member.name,
      path: member.path,
    })?.image ?? undefined
  );
}

function openPicker(index: number) {
  pickingSlot.value = index;
}

function clearSlot(index: number) {
  draft.characterIds[index] = null;
}

function onPick(characterId: number) {
  if (pickingSlot.value == null) return;
  draft.characterIds[pickingSlot.value] = characterId;
  pickingSlot.value = null;
}

function submit() {
  const normalized = normalizeTeamInput({
    teamId: props.team?.teamId ?? null,
    name: draft.name,
    note: draft.note,
    characterIds: draft.characterIds,
  });
  if (!normalized.ok) {
    emit("error", normalized.error);
    return;
  }
  emit("save", normalized.value);
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.isComposing) return;
  if (pickingSlot.value != null) {
    pickingSlot.value = null;
    return;
  }
  emit("close");
}

watch(
  () => props.team,
  () => resetDraft(),
  { immediate: true },
);
onMounted(() => {
  window.addEventListener("keydown", closeOnEscape);
  void loadOwnedCharacters();
});
onUnmounted(() => window.removeEventListener("keydown", closeOnEscape));
</script>

<template>
  <div class="detail-backdrop team-editor-backdrop" @click.self="emit('close')">
    <aside class="detail-drawer team-editor-drawer">
      <header class="team-editor-header">
        <div>
          <p class="eyebrow">TEAM COMPOSITION</p>
          <h2>{{ title }}</h2>
          <small class="team-editor-subtitle">从已拥有角色中编排 4 人配队，槽位可留空。</small>
        </div>
        <button
          type="button"
          class="team-editor-close-btn"
          aria-label="关闭配队编辑"
          @click="emit('close')"
        >
          ×
        </button>
      </header>

      <div class="team-editor-body">
        <label class="team-field">
          <div class="team-field-header">
            <span>配队名称</span>
            <small class="team-field-counter"
              >{{ draft.name.length }}/{{ MAX_TEAM_NAME_LEN }}</small
            >
          </div>
          <InputText
            v-model="draft.name"
            :maxlength="MAX_TEAM_NAME_LEN"
            placeholder="例如：末日一队、飞霄追击队"
          />
        </label>

        <label class="team-field">
          <div class="team-field-header">
            <span>备注</span>
            <small class="team-field-counter"
              >{{ draft.note.length }}/{{ MAX_TEAM_NOTE_LEN }}</small
            >
          </div>
          <Textarea
            v-model="draft.note"
            :maxlength="MAX_TEAM_NOTE_LEN"
            rows="3"
            auto-resize
            placeholder="可选：用途、输出轮次、替换注意事项等"
          />
        </label>

        <section class="team-editor-slots">
          <div class="team-editor-slots-heading">
            <h3>角色槽位 ({{ draft.characterIds.filter((id) => id != null).length }}/4)</h3>
            <small v-if="loadingCharacters" class="team-loading-hint">同步角色列表中…</small>
          </div>
          <div class="team-editor-slot-grid">
            <div
              v-for="index in TEAM_SLOT_COUNT"
              :key="index"
              :class="['team-editor-slot-wrapper', { 'is-filled': slotMember(index - 1) != null }]"
            >
              <button
                type="button"
                :class="['team-editor-slot-main', { 'is-empty': !slotMember(index - 1) }]"
                @click="openPicker(index - 1)"
              >
                <template v-if="slotMember(index - 1)">
                  <div class="team-slot-avatar-wrap">
                    <img
                      v-if="slotAvatar(index - 1)"
                      class="team-slot-avatar"
                      :src="slotAvatar(index - 1)"
                      :alt="slotDisplayName(index - 1)"
                    />
                    <div v-else class="team-slot-avatar-fallback">
                      {{ memberInitial(slotMember(index - 1)!) }}
                    </div>
                    <span
                      v-if="slotScore(index - 1)"
                      :class="[
                        'team-score-badge',
                        'avatar-corner-badge',
                        gradeClass(slotScore(index - 1)!.letterGrade),
                      ]"
                      :title="`评级 ${slotScore(index - 1)!.letterGrade}`"
                    >
                      {{ slotScore(index - 1)!.letterGrade }}
                    </span>
                  </div>
                  <div class="team-slot-meta">
                    <strong class="team-slot-name">{{ slotDisplayName(index - 1) }}</strong>
                    <div class="team-slot-subinfo">
                      <small v-if="slotMember(index - 1)?.owned" class="team-slot-level-tag">
                        Lv.{{ slotMember(index - 1)?.level }}
                      </small>
                      <small v-else class="team-slot-orphan">已不在档案</small>
                      <span class="team-slot-replace-hint">点击替换</span>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="team-editor-slot-empty">
                    <div class="team-slot-plus-icon">+</div>
                    <div class="team-slot-empty-text">
                      <span>槽位 {{ index }}</span>
                      <strong>选择角色</strong>
                    </div>
                  </div>
                </template>
              </button>

              <button
                v-if="draft.characterIds[index - 1] != null"
                type="button"
                class="team-editor-slot-clear"
                title="清除槽位角色"
                @click="clearSlot(index - 1)"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                清除
              </button>
            </div>
          </div>
        </section>
      </div>

      <footer class="team-editor-footer">
        <Button class="team-cancel-btn" type="button" text :disabled="busy" @click="emit('close')">
          取消
        </Button>
        <Button class="team-save-btn" type="button" :disabled="busy" @click="submit">
          保存配队
        </Button>
      </footer>

      <div v-if="pickingSlot != null" class="team-picker-overlay" @click.self="pickingSlot = null">
        <TeamCharacterPicker
          :exclude-ids="excludeIds"
          @select="onPick"
          @close="pickingSlot = null"
        />
      </div>
    </aside>
  </div>
</template>
