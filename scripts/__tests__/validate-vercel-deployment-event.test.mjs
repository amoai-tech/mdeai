import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";

const validator = path.resolve("scripts/validate-vercel-deployment-event.mjs");
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

function run(overrides = {}) {
  return spawnSync(process.execPath, [validator], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERCEL_DEPLOYMENT_URL: "https://mdeai-test-amoco.vercel.app",
      VERCEL_DEPLOYMENT_SHA: head,
      VERCEL_PROJECT_ID: "prj_5eY5DdiVxn7hDbruTG7BrrQT1QAB",
      VERCEL_PROJECT_NAME: "mdeai",
      VERCEL_ENVIRONMENT: "production",
      ...overrides,
    },
  });
}

test("accepts the exact MDE production candidate and checked-out SHA", () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /vercel-candidate: OK/);
});

for (const [name, overrides] of [
  ["rejects a non-HTTPS URL", { VERCEL_DEPLOYMENT_URL: "http://mdeai-test-amoco.vercel.app" }],
  ["rejects an attacker domain", { VERCEL_DEPLOYMENT_URL: "https://mdeai-test-amoco.vercel.app.attacker.example" }],
  ["rejects URL credentials", { VERCEL_DEPLOYMENT_URL: "https://user:pass@mdeai-test-amoco.vercel.app" }],
  ["rejects unexpected ports", { VERCEL_DEPLOYMENT_URL: "https://mdeai-test-amoco.vercel.app:444" }],
  ["rejects URL paths", { VERCEL_DEPLOYMENT_URL: "https://mdeai-test-amoco.vercel.app/evil" }],
  ["rejects query strings", { VERCEL_DEPLOYMENT_URL: "https://mdeai-test-amoco.vercel.app/?next=https://evil.example" }],
  ["rejects malformed SHA", { VERCEL_DEPLOYMENT_SHA: "$(touch /tmp/pwned)" }],
  ["rejects wrong project id", { VERCEL_PROJECT_ID: "prj_attacker" }],
  ["rejects wrong project name", { VERCEL_PROJECT_NAME: "other" }],
  ["rejects preview environment", { VERCEL_ENVIRONMENT: "preview" }],
]) {
  test(name, () => {
    const result = run(overrides);
    assert.notEqual(result.status, 0, `${name} must fail`);
    assert.match(result.stderr, /vercel-candidate: FAIL/);
  });
}

test("rejects a valid-looking SHA that is not the checked-out candidate", () => {
  const other = head === "0".repeat(40) ? "1".repeat(40) : "0".repeat(40);
  const result = run({ VERCEL_DEPLOYMENT_SHA: other });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checked-out HEAD/i);
});
