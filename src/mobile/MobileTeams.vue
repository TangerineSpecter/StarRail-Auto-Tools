<script setup lang="ts">
import { onActivated, ref } from "vue";
import { characterDisplayName, resolveCharacterCatalogue } from "@/shared/catalogue";
import { useMobileData } from "./useMobileData";
const { teams, loading, error, total, load } = useMobileData();
const search = ref("");
onActivated(() => load("team", search.value));
</script>
<template>
  <section class="mobile-teams">
    <div class="mobile-teams-heading">
      <p>{{ total }} 支配队 · 来自电脑端档案</p>
    </div>
    <form class="mobile-list-tools" role="search" @submit.prevent="load('team', search)">
      <label class="mobile-search"
        ><span class="visually-hidden">搜索配队</span
        ><input v-model="search" type="search" placeholder="搜索配队" enterkeyhint="search"
      /></label>
      <button class="mobile-tool-button" :disabled="loading">搜索</button>
    </form>
    <p v-if="error" role="alert" class="feedback error">
      {{ error }} <button class="text-button" @click="load('team', search)">重试</button>
    </p>
    <p v-if="loading">正在读取配队…</p>
    <p v-else-if="!teams.length" class="state">暂无配队，请先从电脑同步。</p>
    <div class="mobile-team-list">
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
        <p v-if="team.note" class="mobile-team-note">{{ team.note }}</p>
      </article>
    </div>
    <button
      v-if="teams.length < total"
      class="mobile-more"
      :disabled="loading"
      @click="load('team', search, true)"
    >
      加载更多
    </button>
  </section>
</template>
