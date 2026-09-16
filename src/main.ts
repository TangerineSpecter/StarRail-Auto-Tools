import { createApp } from "vue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import ToastService from "primevue/toastservice";
import App from "./App.vue";
import { frontendDiagnostics } from "./shared/diagnostics/frontend";
import { StarRailPreset } from "./theme";
import "./styles.css";

const app = createApp(App);

app.config.errorHandler = (error, instance, info) => {
  const component = instance?.$options.name ?? "unknown";
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  frontendDiagnostics.record("error", "vue", `${component} ${info}: ${detail}`);
};

app.use(createPinia());
app.use(ToastService);
app.use(PrimeVue, {
  theme: {
    preset: StarRailPreset,
    options: {
      darkModeSelector: false,
      cssLayer: true,
    },
  },
});

app.mount("#app");
