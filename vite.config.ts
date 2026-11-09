import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    {
      name: "mobile-entry",
      transformIndexHtml: {
        order: "pre",
        handler(html) {
          return mode === "mobile" ? html.replace("/src/main.ts", "/src/mobile/main.ts") : html;
        },
      },
    },
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
