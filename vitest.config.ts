import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests target the pure `src/lib` domains (no React, no DB), so a plain
 * Node environment is all we need. The `@` alias mirrors tsconfig's paths so
 * tests import the same way the app does.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
