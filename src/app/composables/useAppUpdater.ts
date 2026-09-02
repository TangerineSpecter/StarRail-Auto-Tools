import { onMounted, ref } from "vue";
import { checkForAppUpdate, type AppUpdate } from "@/shared/api/updater";

export function useAppUpdater() {
  const update = ref<AppUpdate | null>(null);
  const isInstalling = ref(false);

  onMounted(() => {
    void checkForAppUpdate()
      .then((availableUpdate) => {
        update.value = availableUpdate;
      })
      // 离线、开发版或 Release 尚未发布时不干扰正常使用。
      .catch(() => undefined);
  });

  async function installAvailableUpdate() {
    if (!update.value || isInstalling.value) return;
    isInstalling.value = true;
    await update.value.install();
  }

  return { update, isInstalling, installAvailableUpdate };
}
