import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const yaml = readFileSync(
  new URL("../../.github/workflows/playwright-deterministic.yml", import.meta.url),
  "utf8",
);
const part = (start, end) => {
  const begin = yaml.indexOf(start);
  assert.ok(begin >= 0, `Missing job ${start}`);
  const finish = yaml.indexOf(end, begin);
  assert.ok(finish > begin, `Missing next job ${end}`);
  return yaml.slice(begin, finish);
};

test("outdated browser runs cancel for the same PR, not across PRs", () => {
  assert.match(yaml, /concurrency:\s*\n\s+group: playwright-\$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(yaml, /cancel-in-progress: true/);
});

test("all deterministic specs run once across three shards with no fail-fast cancellation", () => {
  const shardJob = part("  deterministic-chromium:", "  # Real CopilotKit v2 composer:");
  assert.match(shardJob, /fail-fast: false/);
  assert.match(shardJob, /shard: \[1, 2, 3\]/);
  assert.match(shardJob, /npm run test:e2e:deterministic -- --shard=\$\{\{ matrix\.shard \}\}\/3 --reporter=blob,list/);
  assert.match(shardJob, /PLAYWRIGHT_BLOB_OUTPUT_NAME: shard-\$\{\{ matrix\.shard \}\}\.zip/);
});

test("real mobile composer is a separate browser job, not deterministic chat", () => {
  const mobileJob = part("  mobile-composer:", "  # Stable overall check:");
  assert.match(mobileJob, /npm run test:e2e:mobile-composer -- --reporter=blob,list/);
  assert.match(mobileJob, /PLAYWRIGHT_BLOB_OUTPUT_NAME: mobile-composer\.zip/);
  assert.doesNotMatch(mobileJob, /^\s*NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT:/m);
  assert.doesNotMatch(mobileJob, /^\s*E2E_BYPASS_AUTH:/m);
  assert.match(yaml, /  auth-guard-chromium:/);
});

test("missing reports and failed shards cannot produce a green combined result", () => {
  const reportJob = part("  browser-results:", "  # Run the existing real auth-route");
  for (const name of ["shard-1.zip", "shard-2.zip", "shard-3.zip", "mobile-composer.zip"]) {
    assert.ok(reportJob.includes(name), `Missing report check for ${name}`);
  }
  assert.match(reportJob, /merge-reports --reporter html/);
  assert.match(reportJob, /needs\.deterministic-chromium\.result/);
  assert.match(reportJob, /needs\.mobile-composer\.result/);
  assert.match(reportJob, /if: always\(\)/);
  assert.match(reportJob, /\$SHARDS_RESULT\" != success \|\| \"\$MOBILE_RESULT\" != success/);
  assert.match(reportJob, /exit 1/);
});

test("browser scope still fails open to coverage and the auth guard remains independent", () => {
  assert.match(yaml, /needs\.browser_scope\.result != 'success'/);
  assert.match(yaml, /needs\.browser_scope\.outputs\.run_e2e == 'true'/);
  const authJob = yaml.split("  auth-guard-chromium:")[1];
  assert.ok(authJob);
  assert.doesNotMatch(authJob, /needs: browser_scope/);
});
