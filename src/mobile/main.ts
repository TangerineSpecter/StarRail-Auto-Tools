import { createApp } from "vue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import { StarRailPreset } from "@/theme";
import MobileApp from "./MobileApp.vue";
import "@/styles.css";
import "./mobile.css";
document.documentElement.classList.add("mobile-view");
createApp(MobileApp)
  .use(createPinia())
  .use(PrimeVue, {
    theme: { preset: StarRailPreset, options: { darkModeSelector: false, cssLayer: true } },
  })
  .mount("#app");
