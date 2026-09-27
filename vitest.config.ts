import { spawnSync } from "node:child_process";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Local safety guard (SAN-1361): a remote DATABASE_URL makes storage.ts build a real
// PostgresStore against that host, so a local test run can read or write hosted data.
// Warning only — it never blocks the run, and it stays silent under CI.
//
// Run the same short-lived CLI guard for direct `vitest`/IDE starts too. The CLI uses Next's
// own @next/env loader, so file-only `.env.local` values are inspected without mutating Vitest's
// runtime environment. npm scripts set the suppress marker after their pre-hook, so this child
// stays silent there and the warning still appears exactly once.
const guardEnv: NodeJS.ProcessEnv = { ...process.env };
// Vitest sets NODE_ENV=test before config evaluation; Next skips `.env.local` in test mode.
// The safety check intentionally mirrors `next dev`, so inspect the development dotenv stack
// in the child process only while preserving Vitest's real NODE_ENV and runtime environment.
if (guardEnv.NODE_ENV === "test") Reflect.deleteProperty(guardEnv, "NODE_ENV");

spawnSync(process.execPath, [path.resolve(__dirname, "scripts/warn-remote-database-url.mjs")], {
  cwd: process.cwd(),
  env: guardEnv,
  stdio: "inherit",
});

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
