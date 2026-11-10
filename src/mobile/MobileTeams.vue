<script setup lang="ts">
import { onActivated } from "vue";
import { characterDisplayName, resolveCharacterCatalogue } from "@/shared/catalogue";
import { useMobileData } from "./useMobileData";
const { teams, loading, error, total, load } = useMobileData();
onActivated(() => load("team", ""));
</script>
<template>
  <section>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading">正在读取配队…</p>
    <p v-else-if="!teams.length" class="state">暂无配队，请先从电脑同步。</p>
    <article v-for="team in teams" :key="team.teamId" class="mobile-team">
      <h2>{{ team.name }}</h2>
      <div class="mobile-team-members">
        <div v-for="(member, index) in team.members" :key="index">
          <template v-if="member"
            ><img
              v-if="resolveCharacterCatalogue(member)?.image"
              :src="resolveCharacterCatalogue(member)?.image ?? undefined"
              :alt="member.name"
            /><strong>{{ characterDisplayName(member) }}</strong
            ><small>{{ member.level }} 级</small
            ><small v-if="member.score"
              >毕业度 {{ member.score.completionPct.toFixed(1) }}%</small
            ></template
          ><span v-else>空位</span>
        </div>
      </div>
      <p v-if="team.note">{{ team.note }}</p>
    </article>
    <button
      v-if="teams.length < total"
      class="mobile-more"
      :disabled="loading"
      @click="load('team', '', true)"
    >
      加载更多
    </button>
  </section>
</template>
