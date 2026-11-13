<script setup lang="ts">
import { relicImage } from "@/shared/catalogue";
import { slotLabel, statLabel } from "@/shared/catalogue/relic-options";
import type { ScanReviewGroup } from "./scan-review";

defineProps<{ groups: ScanReviewGroup[] }>();
</script>

<template>
  <section class="scanner-review-cards" aria-label="按套装浏览待复核遗器">
    <div class="scanner-review-list">
      <article
        v-for="group in groups"
        :key="group.setId"
        class="scanner-review-card"
        :aria-label="`${group.setName}，共 ${group.groupTotal} 件待复核`"
      >
        <header class="scanner-review-set">
          <img
            v-if="relicImage(group.setId, group.isPlanar ? 'PlanarSphere' : 'Head')"
            :src="relicImage(group.setId, group.isPlanar ? 'PlanarSphere' : 'Head')"
            alt=""
          />
          <div>
            <h3>{{ group.setName }}</h3>
            <p>{{ group.isPlanar ? "位面饰品 · 2件套" : "隧洞遗器 · 4件套" }}</p>
          </div>
          <span
            ><b>{{ group.groupTotal }}</b> 件</span
          >
        </header>
        <div class="scanner-review-parts">
          <section v-for="part in group.parts" :key="part.slot" class="scanner-review-part">
            <h4>{{ slotLabel(part.slot) }}</h4>
            <dl>
              <div v-for="stat in part.stats" :key="stat.mainStat">
                <dt>{{ statLabel(stat.mainStat) }}</dt>
                <dd>
                  <b>{{ stat.count }}</b> 件
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.scanner-review-cards {
  min-width: 0;
}
.scanner-review-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.scanner-review-card {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  border: 1px solid #dce4ef;
  border-radius: 14px;
  background: white;
  overflow: hidden;
}
.scanner-review-set {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  background: #f1f6fd;
}
.scanner-review-set img {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  object-fit: contain;
}
.scanner-review-set > div {
  flex: 1;
  min-width: 0;
}
.scanner-review-set h3 {
  margin: 0;
  color: var(--ink);
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.scanner-review-set p {
  margin: 3px 0 0;
  color: #526784;
  font-size: 11px;
}
.scanner-review-set > span {
  flex-shrink: 0;
  color: #526784;
  font-size: 12px;
  white-space: nowrap;
}
.scanner-review-set > span b {
  color: var(--blue);
  font-size: 18px;
}
.scanner-review-parts {
  padding: 0 14px;
}
.scanner-review-part {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid #e9eef5;
}
.scanner-review-part:last-child {
  border-bottom: 0;
}
.scanner-review-part h4 {
  margin: 0;
  color: #526784;
  font-size: 12px;
  line-height: 24px;
  font-weight: 500;
}
.scanner-review-part dl {
  margin: 0;
  display: grid;
  gap: 8px;
}
.scanner-review-part dl > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  line-height: 24px;
}
.scanner-review-part dt {
  color: var(--ink);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.scanner-review-part dd {
  flex-shrink: 0;
  margin: 0;
  color: #526784;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.scanner-review-part dd b {
  color: var(--blue);
}
</style>
