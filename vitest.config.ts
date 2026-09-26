import { defineConfig } from "vitest/config";
import path from "node:path";
import { warnIfRemoteDatabaseUrl } from "./scripts/warn-remote-database-url.mjs";

// Local safety guard (SAN-1361): a remote DATABASE_URL makes storage.ts build a real
// PostgresStore against that host, so a local test run can read or write hosted data.
// Warning only — it never blocks the run, and it stays silent under CI.
warnIfRemoteDatabaseUrl();

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
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
