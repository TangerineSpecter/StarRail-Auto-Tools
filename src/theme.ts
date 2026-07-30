import { definePreset } from "@primeuix/themes";
import Aura from "@primeuix/themes/aura";

/**
 * The app uses a single set of semantic tokens so native screens and PrimeVue
 * controls share the same visual language.
 */
export const StarRailPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: "#edf4ff",
      100: "#d8e7fb",
      200: "#b9d2f3",
      300: "#8db5e6",
      400: "#5d90d0",
      500: "#3d70bb",
      600: "#2456a6",
      700: "#1d478d",
      800: "#173d7a",
      900: "#142f60",
      950: "#0d203f",
    },
    colorScheme: {
      light: {
        surface: {
          0: "#ffffff",
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e6edf4",
          300: "#d5e0eb",
          400: "#9aaabd",
          500: "#72839a",
          600: "#52627b",
          700: "#394b66",
          800: "#293b55",
          900: "#172643",
          950: "#0d1729",
        },
      },
    },
    focusRing: {
      width: "2px",
      style: "solid",
      color: "rgba(36, 86, 166, 0.34)",
      offset: "2px",
    },
    formField: {
      borderRadius: "4px",
      paddingX: "0.7rem",
      paddingY: "0.5rem",
    },
  },
  components: {
    button: {
      root: {
        borderRadius: "4px",
        label: {
          fontWeight: "600",
        },
      },
    },
    drawer: {
      root: {
        background: "#f8fafc",
      },
    },
  },
});
