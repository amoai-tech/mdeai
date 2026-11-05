#!/usr/bin/env node
// Repeatable, opt-in Chromatic UI pilot. No live credentials or database writes.
// CommonJS is deliberate for this Node CLI; the project ESLint rule targets ESM imports.
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const env = {
  ...process.env,
  CHROMATIC_PILOT: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "test",
  // A real public Map ID can be passed in through the shell. The Maps API is
  // mocked in this visual test, so the fallback is safe for local/CI runs.
  NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
  NEXT_PUBLIC_E2E_MOCK_MAPS: "1",
  NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT: "1",
  NODE_ENV: "development",
  NEXT_TELEMETRY_DISABLED: "1",
  SMOKE_BASE_URL: "http://localhost:3002",
  PLAYWRIGHT_WEB_SERVER_COMMAND: "npm run dev:ui:worktree",
};

const result = spawnSync(join(process.cwd(), "node_modules", ".bin", "playwright"), [
  "test", "e2e/chromatic-pilot.spec.ts", "--project=chromium", "--workers=1",
  ...process.argv.slice(2),
], { env, stdio: "inherit", cwd: process.cwd() });
if (result.error) console.error("Chromatic pilot failed:", result.error.message);
process.exit(result.status ?? 1);
