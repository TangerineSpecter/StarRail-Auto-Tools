<script setup lang="ts">
import { computed } from "vue";
import { protocolLabel } from "./sync-settings";
import type { SyncProtocol } from "@/types";

const props = defineProps<{
  protocol: SyncProtocol;
  busy: boolean;
  activeTransfer: "upload" | "download" | null;
}>();
defineEmits<{
  upload: [];
  download: [];
}>();

const destination = computed(() => `你的 ${protocolLabel(props.protocol)}`);
</script>

<template>
  <aside class="transfer-card">
    <div class="transfer-top">
      <p class="eyebrow">MANUAL TRANSFER</p>
      <span>02</span>
    </div>
    <h3>同步控制台</h3>
    <p>每次操作都会生成或读取一份完整的版本化数据快照。</p>
    <div class="transfer-route">
      <span>本地数据</span><i>⇄</i><span>{{ destination }}</span>
    </div>
    <button class="transfer-action upload" type="button" :disabled="busy" @click="$emit('upload')">
      <span class="transfer-icon">↑</span
      ><span
        ><b>{{ activeTransfer === "upload" ? "正在上传…" : "上传本地数据" }}</b
        ><small>备份当前录入与培养方案</small></span
      ><em>→</em>
    </button>
    <button
      class="transfer-action download"
      type="button"
      :disabled="busy"
      @click="$emit('download')"
    >
      <span class="transfer-icon">↓</span
      ><span
        ><b>{{ activeTransfer === "download" ? "正在下载…" : "下载远端快照" }}</b
        ><small>确认后完整覆盖本地数据</small></span
      ><em>→</em>
    </button>
    <div class="overwrite-note">
      <span>!</span>
      <p>下载不是合并操作。远端数据会替换当前本地的录入、培养方案与毕业目标。</p>
    </div>
  </aside>
</template>

<style scoped>
.transfer-card {
  position: relative;
  overflow: hidden;
  padding: 31px 28px;
  background: linear-gradient(160deg, #183c76, #214e91 58%, #2b67a9);
  color: #fff;
}
.transfer-card::after {
  position: absolute;
  right: -100px;
  bottom: -135px;
  width: 320px;
  height: 320px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 50%;
  box-shadow:
    0 0 0 35px rgba(255, 255, 255, 0.04),
    0 0 0 89px rgba(255, 255, 255, 0.03);
  content: "";
}
.transfer-card > * {
  position: relative;
  z-index: 1;
}
.transfer-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.transfer-top .eyebrow {
  color: #b8d7ff;
}
.transfer-top span {
  display: block;
  color: #e5c77d;
  font:
    700 19px/1 Bahnschrift,
    sans-serif;
  letter-spacing: 0.16em;
}
.transfer-card h3 {
  color: #fff;
  margin: 4px 0 0;
  margin-top: 18px;
  font-size: 23px;
  letter-spacing: -0.035em;
}
.transfer-card > p {
  margin: 9px 0 22px;
  color: rgba(235, 243, 255, 0.75);
  font-size: 13px;
  line-height: 1.65;
}
.transfer-route {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0 17px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.18);
  color: #c9e0fd;
  font-size: 11px;
  font-weight: 700;
}
.transfer-route i {
  color: #e7c979;
  font-style: normal;
  font-size: 19px;
}
.transfer-action {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 15px 0;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.17);
  color: #fff;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background 0.18s ease;
}
.transfer-action:hover:not(:disabled) {
  padding-right: 8px;
  background: rgba(255, 255, 255, 0.06);
  transform: translateX(3px);
}
.transfer-action:disabled {
  opacity: 0.5;
  cursor: wait;
}
.transfer-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.45);
  color: #f1d88d;
  font:
    700 18px/1 Bahnschrift,
    sans-serif;
}
.transfer-action b,
.transfer-action small {
  display: block;
}
.transfer-action b {
  font-size: 13px;
}
.transfer-action small {
  margin-top: 3px;
  color: #c4daf7;
  font-size: 10px;
}
.transfer-action em {
  margin-left: auto;
  color: #f1d88d;
  font-size: 18px;
  font-style: normal;
}
.overwrite-note {
  display: flex;
  gap: 8px;
  margin-top: 19px;
  color: #c5d9f4;
  font-size: 10px;
  line-height: 1.6;
}
.overwrite-note span {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 15px;
  height: 15px;
  margin-top: 1px;
  border: 1px solid #e9c875;
  border-radius: 50%;
  color: #e9c875;
  font-size: 10px;
  font-weight: 700;
}
.overwrite-note p {
  margin: 0;
}
@media (max-width: 680px) {
  .transfer-card {
    padding: 25px 20px;
  }
}
</style>
