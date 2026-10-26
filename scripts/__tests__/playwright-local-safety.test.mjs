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
  assert.match(config, /reuseExistingServer:\s*!process\.env\.CI\s*&&\s*process\.env\.PW_REUSE_WEBSERVER\s*===\s*"1"/);
});

// Read the effective runtime configuration, not merely project names. A stale
// PROD_SMOKE_BASE_URL must never make a generic local test browse production.
function configuredProjects(extraEnv = {}) {
  const env = { ...process.env, NODE_NO_WARNINGS: "1" };
  delete env.PROD_SMOKE_BASE_URL;
  delete env.PW_SKIP_WEBSERVER;
  delete env.PW_REUSE_WEBSERVER;
  Object.assign(env, extraEnv);
  const script = `import("./playwright.config.ts").then(({default: config}) =>
    console.log(JSON.stringify({
      defaultBaseURL: config.use.baseURL,
      chromiumBaseURL: config.projects.find((p) => p.name === "chromium").use.baseURL,
      productionPresent: config.projects.some((p) => p.name === "prod-smoke"),
      reuseExistingServer: config.webServer?.reuseExistingServer ?? false,
      webServerPort: config.webServer?.port ?? null,
      webServerURL: config.webServer?.url ?? null,
      webServerStdout: config.webServer?.stdout ?? null,
    })))`;
  return JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    env,
    encoding: "utf8",
    timeout: 20_000,
  }));
}

test("remote URL variables never redirect local Chromium to a remote server", () => {
  for (const remoteEnv of [
    { PROD_SMOKE_BASE_URL: "https://example.invalid" },
    { PROD_SMOKE_BASE_URL: "https://example.invalid", PW_SKIP_WEBSERVER: "1" },
  ]) {
    const loaded = configuredProjects({ SMOKE_BASE_URL: "http://localhost:3099", ...remoteEnv });
    assert.equal(loaded.defaultBaseURL, "http://localhost:3099");
    assert.equal(loaded.chromiumBaseURL, "http://localhost:3099");
    assert.equal(loaded.productionPresent, remoteEnv.PW_SKIP_WEBSERVER === "1");
  }
});

test("local browser startup checks the listening port, not an expensive home page", () => {
  const local = configuredProjects({ SMOKE_BASE_URL: "http://localhost:3099" });
  assert.equal(local.webServerPort, 3099);
  assert.equal(local.webServerURL, null);
  assert.equal(local.webServerStdout, "pipe");

  // Explicit production smoke remains remote-only and never starts a local server.
  const production = configuredProjects({
    PROD_SMOKE_BASE_URL: "https://example.invalid",
    PW_SKIP_WEBSERVER: "1",
  });
  assert.equal(production.webServerPort, null);
});

test("CI never reuses a developer server even with the reuse opt-in variable", () => {
  assert.equal(configuredProjects({ CI: "1", PW_REUSE_WEBSERVER: "1" }).reuseExistingServer, false);
  assert.equal(configuredProjects({ PW_REUSE_WEBSERVER: "1", CI: "" }).reuseExistingServer, true);
});
