import { defineConfig } from "vitest/config";

// A standalone config: vite.config.ts sets root to `web/` for the frontend build,
// which would otherwise hide the tests in `tests/`.
export default defineConfig({
  test: {
    root: ".",
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
