import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globalSetup: [path.resolve(__dirname, "./vitest.global-setup.ts")],
    environment: "node",
    globals: true,
    // `e2e/**/*.test.ts` only — Playwright keeps ownership of `*.spec.ts`, so
    // e2e helper logic that needs deterministic fakes lives in a `.test.ts` beside it.
    include: [
      "src/**/*.{test,spec}.ts",
      "src/**/*.{test,spec}.tsx",
      "e2e/**/*.test.ts",
    ],
  },
});
