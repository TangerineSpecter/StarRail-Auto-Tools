<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import { characterDisplayName, pathIconSrc, resolveCharacterCatalogue } from "@/shared/catalogue";
import { pathLabel } from "@/shared/catalogue/relic-options";
import type { CharacterListItem, Team, TeamInput } from "@/types";
import { listAllOwnedCharacters } from "./list-owned-characters";
import TeamCharacterPicker from "./TeamCharacterPicker.vue";
import {
  MAX_TEAM_NAME_LEN,
  MAX_TEAM_NOTE_LEN,
  TEAM_SLOT_COUNT,
  characterIdsFromTeam,
  emptyCharacterIds,
  memberInitial,
  normalizeTeamInput,
} from "./team-utils";

const props = defineProps<{
  team: Team | null;
  busy: boolean;
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
      <header>
        <div>
          <p class="eyebrow">TEAM COMPOSITION</p>
          <h2>{{ title }}</h2>
          <small>从已拥有角色中编排 4 人配队，槽位可留空。</small>
        </div>
        <button type="button" aria-label="关闭配队编辑" @click="emit('close')">×</button>
      </header>

      <div class="team-editor-body">
        <label class="team-field">
          <span>配队名称</span>
          <InputText
            v-model="draft.name"
            :maxlength="MAX_TEAM_NAME_LEN"
            placeholder="例如：末日一队"
          />
        </label>
        <label class="team-field">
          <span>备注</span>
          <Textarea
            v-model="draft.note"
            :maxlength="MAX_TEAM_NOTE_LEN"
            rows="3"
            auto-resize
            placeholder="可选：用途、轮次、注意事项"
          />
        </label>

        <section class="team-editor-slots">
          <div class="team-editor-slots-heading">
            <h3>角色槽位</h3>
            <small v-if="loadingCharacters">同步角色列表…</small>
          </div>
          <div class="team-editor-slot-grid">
            <div v-for="index in TEAM_SLOT_COUNT" :key="index" class="team-editor-slot">
              <button type="button" class="team-editor-slot-main" @click="openPicker(index - 1)">
                <template v-if="slotMember(index - 1)">
                  <img
                    v-if="slotAvatar(index - 1)"
                    class="team-slot-avatar"
                    :src="slotAvatar(index - 1)"
                    :alt="slotDisplayName(index - 1)"
                  />
                  <div v-else class="team-slot-avatar-fallback">
                    {{ memberInitial(slotMember(index - 1)!) }}
                  </div>
                  <div class="team-slot-meta">
                    <strong>{{ slotDisplayName(index - 1) }}</strong>
                    <small v-if="slotMember(index - 1)?.owned">
                      <img
                        v-if="slotMember(index - 1)?.path"
                        class="team-slot-path"
                        :src="pathIconSrc(slotMember(index - 1)!.path)"
                        :alt="pathLabel(slotMember(index - 1)!.path)"
                      />
                      Lv.{{ slotMember(index - 1)?.level }}
                    </small>
                    <small v-else class="team-slot-orphan">已不在档案，点击替换</small>
                  </div>
                </template>
                <template v-else>
                  <div class="team-editor-slot-empty">
                    <span>槽位 {{ index }}</span>
                    <strong>选择角色</strong>
                  </div>
                </template>
              </button>
              <button
                v-if="draft.characterIds[index - 1] != null"
                type="button"
                class="team-editor-slot-clear"
                @click="clearSlot(index - 1)"
              >
                清除
              </button>
            </div>
          </div>
        </section>
      </div>

      <footer class="team-editor-footer">
        <Button type="button" text :disabled="busy" @click="emit('close')">取消</Button>
        <Button class="capture-action-btn" type="button" :disabled="busy" @click="submit"
          >保存配队</Button
        >
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
