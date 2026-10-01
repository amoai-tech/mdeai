import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Tests never need real CSS. An inline (empty) PostCSS config stops Vite from
  // loading the app's Tailwind pipeline for the inlined CopilotKit stylesheet.
  css: { postcss: { plugins: [] } },
  test: {
    globalSetup: [path.resolve(__dirname, "./vitest.global-setup.ts")],
    environment: "node",
    globals: true,
    // The real CopilotKit v2 entry imports its stylesheet. Processing just this
    // package through Vite lets provider tests render the REAL providers (CSS
    // becomes an empty module) instead of mocking the thing under test.
    server: { deps: { inline: ["@copilotkit/react-core"] } },
    // `e2e/**/*.test.ts` only — Playwright keeps ownership of `*.spec.ts`, so
    // e2e helper logic that needs deterministic fakes lives in a `.test.ts` beside it.
    include: [
      "src/**/*.{test,spec}.ts",
      "src/**/*.{test,spec}.tsx",
      "e2e/**/*.test.ts",
    ],
  },
});
