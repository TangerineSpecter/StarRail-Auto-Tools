import { createApp } from "vue";
import PrimeVue from "primevue/config";
import App from "./App.vue";
import { StarRailPreset } from "./theme";
import "./styles.css";

const app = createApp(App);

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
