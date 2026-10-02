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
      VERCEL_DEPLOYMENT_ID: "dpl_AhQPocB7UYbzTgRHioYxN6sZH7p3",
      VERCEL_DEPLOYMENT_REF: "main",
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
  // SAN-1330: a production-target deployment from any other branch must never be certified or promoted.
  ["rejects a non-main ref", { VERCEL_DEPLOYMENT_REF: "feature/not-main" }],
  ["rejects a full-ref spelling of main (the payload sends the plain branch name)", { VERCEL_DEPLOYMENT_REF: "refs/heads/main" }],
  ["rejects a main-lookalike branch", { VERCEL_DEPLOYMENT_REF: "main-evil" }],
  ["rejects a missing ref", { VERCEL_DEPLOYMENT_REF: "" }],
  // SAN-1330: the deployment ID is what gets promoted, so it must be a real Vercel ID.
  ["rejects a missing deployment id", { VERCEL_DEPLOYMENT_ID: "" }],
  ["rejects a malformed deployment id", { VERCEL_DEPLOYMENT_ID: "not-a-deployment" }],
  ["rejects a deployment id with shell metacharacters", { VERCEL_DEPLOYMENT_ID: "dpl_abc; touch /tmp/pwned" }],
  ["rejects a too-short deployment id", { VERCEL_DEPLOYMENT_ID: "dpl_123" }],
  ["rejects a project id that only looks similar", { VERCEL_PROJECT_ID: "prj_5eY5DdiVxn7hDbruTG7BrrQT1QAB-x" }],
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

test("a missing deployment id is reported by name, never by silently passing", () => {
  const env = { ...process.env, VERCEL_DEPLOYMENT_URL: "https://mdeai-test-amoco.vercel.app", VERCEL_DEPLOYMENT_SHA: head, VERCEL_PROJECT_ID: "prj_5eY5DdiVxn7hDbruTG7BrrQT1QAB", VERCEL_PROJECT_NAME: "mdeai", VERCEL_ENVIRONMENT: "production", VERCEL_DEPLOYMENT_REF: "main" };
  delete env.VERCEL_DEPLOYMENT_ID;
  const result = spawnSync(process.execPath, [validator], { encoding: "utf8", env });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /VERCEL_DEPLOYMENT_ID is required/);
});

test("accepts the real Vercel payload shape: plain 'main' and a dpl_ id", () => {
  const result = run({ VERCEL_DEPLOYMENT_ID: "dpl_1234567890abcdefghijklmnopqrstuvwxyz", VERCEL_DEPLOYMENT_REF: "main" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
