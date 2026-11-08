import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const check = join(root, "scripts/qa-auth-check.ts");
const browser = join(root, "scripts/qa-browser.ts");
const tsxLoader = createRequire(import.meta.url).resolve("tsx");

function run(file, args = [], env = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "mde-qa-cli-test-"));
  try {
    return spawnSync(process.execPath, ["--import", tsxLoader, file, ...args], {
      cwd,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
      encoding: "utf8",
      timeout: 12_000,
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("missing QA env fails closed without logging credentials", () => {
  const result = run(check);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing NEXT_PUBLIC_SUPABASE_URL/);
  assert.doesNotMatch(result.stderr, /(?:token|cookie)=/i);
});

test("shape-valid QA env passes without printing keys", () => {
  const secret = "fixture-secret-must-remain-hidden";
  const result = run(check, [], {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    SUPABASE_SERVICE_ROLE_KEY: secret,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS/);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-secret-must-remain-hidden|sb_publishable_fixture/);
});

test("qa browser help succeeds without secrets or Chrome", () => {
  const result = run(browser, ["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--browser-url=http:\/\/127\.0\.0\.1:9227/);
});

test("QA browser disallows automatic Super Admin exposure over CDP", () => {
  const result = run(browser, ["--role=super-admin"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires explicit --allow-admin/);
});

test("QA browser rejects untrusted origins, malformed ports, and unknown flags", () => {
  for (const flags of [
    ["--origin=https://evil.example", "--allow-remote"],
    ["--origin=https://www.mdeai.co.evil.example", "--allow-remote"],
    ["--origin=http://www.mdeai.co", "--allow-remote"],
    ["--port=12"],
    ["--role=anonymous"],
    ["--password=abc"],
  ]) {
    const result = run(browser, flags);
    assert.equal(result.status, 1, flags.join(" "));
  }
});

test("Chrome child environment drops agent and Supabase secret variables", () => {
  const source = fileURLToPath(new URL("../qa-browser.ts", import.meta.url));
  const js = `import { chromeProcessEnvironment } from ${JSON.stringify(source)}; console.log(JSON.stringify(chromeProcessEnvironment({ PATH: "/usr/bin", HOME: "/tmp", SUPABASE_SERVICE_ROLE_KEY: "unsafe", GH_TOKEN: "unsafe", NODE_OPTIONS: "unsafe" })))`;
  const result = spawnSync(process.execPath, ["--import=tsx", "--input-type=module", "--eval", js], {
    cwd: root, encoding: "utf8", timeout: 12_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { NODE_ENV: "development", HOME: "/tmp", PATH: "/usr/bin" });
});
