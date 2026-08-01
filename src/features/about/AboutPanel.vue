<script setup lang="ts">
import { APP_NAME, APP_SLUG, APP_VERSION, PROJECT_URL } from "@/shared/app-info";
import { openExternalUrl } from "@/shared/utils/open-external-url";

async function openProject() {
  await openExternalUrl(PROJECT_URL);
}
</script>

<template>
  <section class="about-workspace" aria-labelledby="about-title">
    <div class="constellation constellation-left" aria-hidden="true"><i /><i /><i /></div>
    <div class="constellation constellation-right" aria-hidden="true"><i /><i /></div>

    <article class="about-profile">
      <div class="profile-copy">
        <p class="eyebrow">LOCAL STAR RAIL COMPANION</p>
        <h2 id="about-title">{{ APP_NAME }}</h2>
        <p class="about-slug">{{ APP_SLUG }}</p>
        <p class="about-intro">在本地整理游戏背包、查看图鉴，并为角色规划一条清晰的培养轨道。</p>

        <div class="profile-meta">
          <span class="version-label"><small>VERSION</small>v{{ APP_VERSION }}</span>
          <button
            class="github-tag"
            type="button"
            aria-label="在默认浏览器打开 GitHub 项目"
            @click="openProject"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16">
              <path
                d="M8 1.1a6.9 6.9 0 0 0-2.18 13.44c.35.06.47-.15.47-.34v-1.33c-1.92.42-2.32-.81-2.32-.81-.31-.8-.77-1.01-.77-1.01-.63-.43.05-.43.05-.43.7.05 1.07.72 1.07.72.62 1.06 1.63.75 2.03.57.06-.45.24-.75.44-.93-1.53-.17-3.14-.77-3.14-3.4 0-.75.27-1.37.71-1.85-.07-.17-.31-.88.07-1.83 0 0 .58-.19 1.9.7A6.6 6.6 0 0 1 8 4.63a6.6 6.6 0 0 1 1.73.23c1.32-.89 1.9-.7 1.9-.7.38.95.14 1.66.07 1.83.44.48.71 1.1.71 1.85 0 2.64-1.61 3.22-3.15 3.39.25.21.47.61.47 1.23v1.83c0 .19.13.4.48.34A6.9 6.9 0 0 0 8 1.1Z"
                fill="currentColor"
              />
            </svg>
            GitHub
          </button>
        </div>
      </div>

      <div class="profile-sigil" aria-hidden="true">
        <span class="sigil-orbit orbit-a" />
        <span class="sigil-orbit orbit-b" />
        <span class="sigil-core">✦</span>
      </div>
    </article>

    <section class="capability-list" aria-label="当前功能">
      <article>
        <span>01</span>
        <div>
          <h3>数据同步</h3>
          <p>Windows 游戏数据直读与本地归档</p>
        </div>
      </article>
      <article>
        <span>02</span>
        <div>
          <h3>背包管理</h3>
          <p>筛选、详情、批量操作与 JSON 导出</p>
        </div>
      </article>
      <article>
        <span>03</span>
        <div>
          <h3>图鉴规划</h3>
          <p>套装参考与角色毕业目标管理</p>
        </div>
      </article>
      <article>
        <span>04</span>
        <div>
          <h3>本地识别</h3>
          <p>截图 OCR 与遗器主词条扫描辅助</p>
        </div>
      </article>
    </section>
  </section>
</template>

<style scoped>
.about-workspace {
  position: relative;
  display: grid;
  align-content: center;
  min-height: 0;
  padding: 46px;
  overflow: auto;
  isolation: isolate;
}
.constellation {
  position: absolute;
  z-index: -1;
  display: flex;
  gap: 40px;
  align-items: center;
  width: 290px;
  height: 110px;
  border-top: 1px dashed rgba(55, 99, 161, 0.18);
  transform: rotate(-20deg);
}
.constellation i {
  width: 5px;
  height: 5px;
  border: 1px solid rgba(197, 157, 61, 0.75);
  background: #fff;
  transform: rotate(45deg);
}
.constellation-left {
  top: 8%;
  left: -85px;
}
.constellation-right {
  right: -90px;
  bottom: 12%;
  transform: rotate(25deg);
}
.about-profile {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 250px;
  min-height: 320px;
  max-width: 1030px;
  overflow: hidden;
  border: 1px solid rgba(42, 72, 113, 0.15);
  background: linear-gradient(112deg, rgba(255, 255, 255, 0.84), rgba(247, 250, 253, 0.64));
  box-shadow: 0 24px 55px rgba(47, 73, 110, 0.1);
  clip-path: polygon(0 0, calc(100% - 28px) 0, 100% 28px, 100% 100%, 0 100%);
}
.profile-copy {
  z-index: 1;
  padding: 47px 50px;
}
.eyebrow {
  margin: 0;
  color: var(--blue);
  font:
    700 10px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.19em;
}
h2 {
  margin: 18px 0 0;
  color: var(--ink);
  font-size: clamp(35px, 4vw, 50px);
  letter-spacing: -0.04em;
}
.about-slug {
  margin: 7px 0 0;
  color: #8291a4;
  font:
    600 13px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.1em;
}
.about-intro {
  max-width: 540px;
  margin: 27px 0 0;
  color: var(--ink-soft);
  font-size: 16px;
  line-height: 1.9;
}
.profile-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 29px;
}
.version-label {
  display: grid;
  gap: 4px;
  padding: 8px 12px;
  border-left: 2px solid var(--gold);
  color: var(--ink);
  background: rgba(246, 249, 253, 0.75);
  font:
    700 14px/1 "Bahnschrift",
    sans-serif;
}
.version-label small {
  color: var(--muted);
  font:
    700 8px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.14em;
}
.github-tag {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 37px;
  padding: 0 12px;
  border: 1px solid #233954;
  color: #fff;
  background: #233954;
  font:
    700 11px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.05em;
  transition:
    background 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;
}
.github-tag svg {
  width: 15px;
  height: 15px;
}
.github-tag:hover,
.github-tag:focus-visible {
  background: var(--blue);
  box-shadow: 0 8px 18px rgba(41, 81, 136, 0.22);
  transform: translateY(-2px);
}
.profile-sigil {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 100%;
  background:
    radial-gradient(circle at 50% 50%, rgba(79, 130, 200, 0.17), transparent 16%, transparent 54%),
    linear-gradient(135deg, rgba(222, 233, 249, 0.18), rgba(230, 213, 173, 0.26));
}
.profile-sigil::before,
.profile-sigil::after {
  position: absolute;
  border: 1px solid rgba(61, 106, 167, 0.32);
  border-radius: 50%;
  content: "";
}
.profile-sigil::before {
  width: 220px;
  height: 220px;
}
.profile-sigil::after {
  width: 150px;
  height: 150px;
  border-color: rgba(198, 158, 69, 0.45);
  transform: rotate(45deg);
}
.sigil-core {
  z-index: 1;
  color: var(--gold);
  font-size: 46px;
  text-shadow: 0 0 22px rgba(219, 185, 105, 0.66);
}
.sigil-orbit {
  position: absolute;
  width: 250px;
  height: 92px;
  border: 1px solid rgba(56, 110, 186, 0.42);
  border-radius: 50%;
}
.orbit-a {
  transform: rotate(28deg);
}
.orbit-b {
  border-style: dashed;
  border-color: rgba(142, 111, 196, 0.36);
  transform: rotate(-40deg);
}
.capability-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  max-width: 1030px;
  margin-top: 15px;
  border: 1px solid rgba(42, 72, 113, 0.12);
  background: rgba(255, 255, 255, 0.52);
}
.capability-list article {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 11px;
  min-height: 102px;
  padding: 21px 19px;
  border-right: 1px solid rgba(42, 72, 113, 0.12);
}
.capability-list article:last-child {
  border-right: 0;
}
.capability-list > article > span {
  color: var(--gold);
  font:
    700 10px/1 "Bahnschrift",
    sans-serif;
  letter-spacing: 0.08em;
}
.capability-list h3 {
  margin: 0;
  color: var(--ink);
  font-size: 15px;
}
.capability-list p {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.55;
}
@media (max-width: 900px) {
  .about-workspace {
    padding: 28px;
    align-content: start;
  }
  .about-profile {
    grid-template-columns: 1fr;
  }
  .profile-sigil {
    display: none;
  }
  .capability-list {
    grid-template-columns: repeat(2, 1fr);
  }
  .capability-list article:nth-child(2) {
    border-right: 0;
  }
  .capability-list article:nth-child(-n + 2) {
    border-bottom: 1px solid rgba(42, 72, 113, 0.12);
  }
}
@media (max-width: 560px) {
  .profile-copy {
    padding: 34px 28px;
  }
  .capability-list {
    grid-template-columns: 1fr;
  }
  .capability-list article {
    border-right: 0;
    border-bottom: 1px solid rgba(42, 72, 113, 0.12);
  }
  .capability-list article:last-child {
    border-bottom: 0;
  }
}
</style>
