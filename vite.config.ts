import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { HOST, WEB_PORT } from "./shared/constants.js";

/**
 * The app is a static bundle: it talks straight to api.github.com and
 * api.anthropic.com with the user's own keys, so there is no API to proxy and
 * nothing server-side to deploy.
 */
export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
      "@core": fileURLToPath(new URL("./core", import.meta.url)),
    },
  },
  server: {
    host: HOST,
    port: WEB_PORT,
    strictPort: true,
  },
  build: {
    outDir: fileURLToPath(new URL("./web/dist", import.meta.url)),
    emptyOutDir: true,
  },
});
