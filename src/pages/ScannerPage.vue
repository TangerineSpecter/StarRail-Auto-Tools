<script setup lang="ts">
import RelicMainStatScanner from "@/features/relic-scanner/RelicMainStatScanner.vue";
import InventoryDetailDrawer from "@/features/inventory/InventoryDetailDrawer.vue";
import { useInventoryDetail } from "@/features/inventory/useInventoryDetail";
import { relicImage } from "@/shared/catalogue";
import { useRuntimeContext } from "@/shared/contracts/runtime";

const { error } = useRuntimeContext();
const inventoryDetail = useInventoryDetail((message) => (error.value = message));
const imageFor = (item: { setId: number; slot: string }) => relicImage(item.setId, item.slot);
</script>
<template>
  <RelicMainStatScanner
    :image-for="imageFor"
    @open-relic="inventoryDetail.open('relic', $event.itemId)"
  /><InventoryDetailDrawer
    v-if="inventoryDetail.detail.value || inventoryDetail.loading.value"
    :detail="inventoryDetail.detail.value"
    :loading="inventoryDetail.loading.value"
    @close="inventoryDetail.close"
  />
</template>
