import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { test } from "node:test";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const config = fs.readFileSync("playwright.config.ts", "utf8");
const cli = "node_modules/playwright/cli.js";

function discover(extraEnv = {}, args = []) {
  const env = { ...process.env };
  delete env.PROD_SMOKE_BASE_URL;
  delete env.PW_SKIP_WEBSERVER;
  Object.assign(env, extraEnv);
  return execFileSync(process.execPath, [cli, "test", "--list", ...args], {
    env,
    encoding: "utf8",
    timeout: 45_000,
  });
}

test("local Playwright discovery never includes production projects", () => {
  const list = discover();
  assert.match(list, /\[chromium\]/);
  assert.doesNotMatch(list, /\[prod-smoke\]/);

  const urlOnly = discover({ PROD_SMOKE_BASE_URL: "https://example.invalid" });
  assert.doesNotMatch(urlOnly, /\[prod-smoke\]/);
});

test("production project requires an explicitly configured remote run", () => {
  const list = discover(
    { PROD_SMOKE_BASE_URL: "https://example.invalid", PW_SKIP_WEBSERVER: "1" },
    ["--project=prod-smoke"],
  );
  assert.match(list, /\[prod-smoke\]/);
  assert.match(list, /prod-signed-in-route\.spec\.ts/);
});

test("generic npm E2E is local-only and starts a fresh worktree server", () => {
  const cmd = pkg.scripts["test:e2e"];
  assert.match(cmd, /--project=chromium/);
  assert.match(cmd, /SMOKE_BASE_URL=/);
  assert.match(cmd, /PLAYWRIGHT_WEB_SERVER_COMMAND=/);
  assert.match(config, /reuseExistingServer:\s*process\.env\.PW_REUSE_WEBSERVER\s*===\s*"1"/);
});
