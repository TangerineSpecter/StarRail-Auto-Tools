import { createApp } from "vue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import { StarRailPreset } from "@/theme";
import MobileApp from "./MobileApp.vue";
import "@/styles.css";
import "./mobile.css";
import "./content.css";
import { initContentRegionWatcher } from "./useLayoutRegions";
import { initDevicePostureWatcher } from "./device-posture";

if (import.meta.env.DEV) {
  const { demoEnabled, mobileMock } = await import("@/shared/dev/mobile-mock");
  if (demoEnabled(localStorage)) {
    const { setDevelopmentInvokeHandler } = await import("@/shared/api/invoke");
    setDevelopmentInvokeHandler(mobileMock);
  }
}

document.documentElement.classList.add("mobile-view");
const stopDevicePostureWatcher = initDevicePostureWatcher();

const app = createApp(MobileApp)
  .use(createPinia())
  .use(PrimeVue, {
    theme: { preset: StarRailPreset, options: { darkModeSelector: false, cssLayer: true } },
  });
app.onUnmount(stopDevicePostureWatcher);
app.mount("#app");

const stopContentRegionWatcher = initContentRegionWatcher();
app.onUnmount(stopContentRegionWatcher);
