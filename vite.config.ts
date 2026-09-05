import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { API_URL, HOST, WEB_PORT } from "./shared/constants.js";

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  server: {
    host: HOST,
    port: WEB_PORT,
    strictPort: true,
    proxy: {
      "/api": {
        target: API_URL,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./web/dist", import.meta.url)),
    emptyOutDir: true,
  },
});
