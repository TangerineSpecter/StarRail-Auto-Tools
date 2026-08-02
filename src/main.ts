import { createApp } from "vue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import ToastService from "primevue/toastservice";
import App from "./App.vue";
import { StarRailPreset } from "./theme";
import "./styles.css";

const app = createApp(App);

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
