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
  delete env.MDE_REMOTE_DISCOVERY_CARDS;
  delete env.MDE_ROLE_QA_E2E;
  delete env.MDE_SUPER_ADMIN_QA;
  delete env.MDE_PARTNER_LIVE_SOURCE_E2E;
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
  delete env.MDE_REMOTE_DISCOVERY_CARDS;
  delete env.MDE_ROLE_QA_E2E;
  delete env.MDE_SUPER_ADMIN_QA;
  delete env.MDE_PARTNER_LIVE_SOURCE_E2E;
  delete env.PW_REUSE_WEBSERVER;
  Object.assign(env, extraEnv);
  const script = `import("./playwright.config.ts").then(({default: config}) =>
    console.log(JSON.stringify({
      defaultBaseURL: config.use.baseURL,
      chromiumBaseURL: config.projects.find((p) => p.name === "chromium").use.baseURL,
      productionBaseURL: config.projects.find((p) => p.name === "prod-smoke")?.use.baseURL ?? null,
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

test("CLI test discovery fails closed on inherited remote SMOKE_BASE_URL", () => {
  assert.throws(
    () => discover({ SMOKE_BASE_URL: "https://example.invalid" }, ["--project=chromium"]),
    (error) => {
      assert.match(String(error.stderr), /SMOKE_BASE_URL must be a local HTTP\(S\) loopback URL/);
      return true;
    },
  );
});

test("legacy production certification can pass both remote URLs without redirecting ordinary projects", () => {
  const env = {
    SMOKE_BASE_URL: "https://example.invalid",
    PROD_SMOKE_BASE_URL: "https://example.invalid",
    PW_SKIP_WEBSERVER: "1",
  };
  const loaded = configuredProjects(env);
  assert.equal(loaded.chromiumBaseURL, "http://localhost:3001");
  assert.equal(loaded.defaultBaseURL, "http://localhost:3001");
  assert.equal(loaded.productionBaseURL, "https://example.invalid");
  assert.equal(loaded.productionPresent, true);
  assert.equal(loaded.webServerPort, null);
  const list = discover(env, ["--project=prod-smoke"]);
  assert.match(list, /\[prod-smoke\]/);
  assert.match(list, /prod-release-health\.spec\.ts/);
});

test("deployed mobile-nav verifier opts into only its existing read-only spec", () => {
  const env = {
    SMOKE_BASE_URL: "https://example.invalid",
    PROD_SMOKE_BASE_URL: "https://example.invalid",
    PW_SKIP_WEBSERVER: "1",
    MDE_SAN1606_REMOTE_MOBILE_NAV: "1",
  };
  const list = discover(env, ["e2e/mobile-bottom-nav.spec.ts", "--project=prod-smoke"]);
  assert.match(list, /mobile-bottom-nav\.spec\.ts/);
  assert.match(list, /\[prod-smoke\]/);
});

const REMOTE_QA_SUITE_CASES = [
  ["MDE_REMOTE_DISCOVERY_CARDS", "e2e/san-1140-discovery-card-actions.spec.ts"],
  ["MDE_ROLE_QA_E2E", "e2e/qa-role-selection.spec.ts"],
  ["MDE_SUPER_ADMIN_QA", "e2e/qa-super-admin-fixture.spec.ts"],
  ["MDE_PARTNER_LIVE_SOURCE_E2E", "e2e/app/partner-ai-signup-live-source.spec.ts"],
];

test("every remote QA suite requires its own explicit opt-in and prod-smoke project", () => {
  const base = {
    PROD_SMOKE_BASE_URL: "https://example.invalid",
    PW_SKIP_WEBSERVER: "1",
  };
  for (const [flag, path] of REMOTE_QA_SUITE_CASES) {
    assert.throws(
      () => discover(base, [path, "--project=prod-smoke"]),
      /No tests found/,
      `unexpected remote QA exposure without ${flag}: ${path}`,
    );
    const listed = discover({ ...base, [flag]: "1" }, [path, "--project=prod-smoke"]);
    assert.match(listed, /\[prod-smoke\]/);
    assert.match(listed, /Total: [1-9][0-9]* tests? in [1-9]/);
    assert.ok(listed.includes(path.slice(path.lastIndexOf("/") + 1)), path);
    const configured = configuredProjects({ ...base, [flag]: "1", SMOKE_BASE_URL: "https://example.invalid" });
    assert.equal(configured.chromiumBaseURL, "http://localhost:3001");
    assert.equal(configured.productionBaseURL, "https://example.invalid");
  }
});

test("remote QA flags cannot bypass the local-only SMOKE_BASE_URL guard", () => {
  for (const [flag] of REMOTE_QA_SUITE_CASES) {
    assert.throws(
      () => discover({
        SMOKE_BASE_URL: "https://example.invalid",
        PW_SKIP_WEBSERVER: "1",
        [flag]: "1",
      }, ["--project=chromium"]),
      /SMOKE_BASE_URL must be a local HTTP\(S\) loopback URL/,
    );
  }
});

test("ordinary browser projects reject remote or unsafe SMOKE_BASE_URL before test discovery", () => {
  for (const target of [
    "https://example.invalid",
    "http://192.0.2.1:3001",
    "http://0.0.0.0:3001",
    "file:///tmp/index.html",
    "http://user:secret@localhost:3001",
  ]) {
    assert.throws(
      () => configuredProjects({ SMOKE_BASE_URL: target }),
      /SMOKE_BASE_URL must be a local HTTP\(S\) loopback URL/,
      `expected unsafe target to be rejected: ${target}`,
    );
  }
});

test("local IPv4, IPv6 and localhost targets still work", () => {
  for (const target of ["http://localhost:3001", "http://127.0.0.1:3002", "http://[::1]:3003"]) {
    const loaded = configuredProjects({ SMOKE_BASE_URL: target });
    assert.equal(loaded.chromiumBaseURL, target);
  }
});

test("explicit remote production smoke remains separate from local Chromium", () => {
  const loaded = configuredProjects({
    SMOKE_BASE_URL: "http://localhost:3001",
    PROD_SMOKE_BASE_URL: "https://example.invalid",
    PW_SKIP_WEBSERVER: "1",
  });
  assert.equal(loaded.chromiumBaseURL, "http://localhost:3001");
  assert.equal(loaded.productionPresent, true);
  assert.equal(loaded.webServerPort, null);
});

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
