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

test("failed-only reruns collect all four browser reports across run attempts", () => {
  const shard = part("  deterministic-chromium:", "  # Real CopilotKit v2 composer:");
  const mobile = part("  mobile-composer:", "  # Stable overall check:");
  const report = part("  browser-results:", "  # Run the existing real auth-route");
  assert.match(shard, /timeout-minutes: 30/);
  assert.match(shard, /name: playwright-blob-shard-\$\{\{ matrix\.shard \}\}/);
  assert.match(mobile, /name: playwright-blob-mobile/);
  for (const lane of [shard, mobile]) {
    assert.match(lane, /overwrite: true/);
    assert.doesNotMatch(lane, /name: playwright-blob-[^\n]*run_attempt/);
  }
  assert.match(report, /pattern: playwright-blob-\*/);
  assert.doesNotMatch(report, /pattern: playwright-blob-[^\n]*run_attempt/);
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

test("all simulated browser lanes fail fast against local-only Supabase", () => {
  const lanes = [
    part("  deterministic-chromium:", "  # Real CopilotKit v2 composer:"),
    part("  mobile-composer:", "  # Stable overall check:"),
    yaml.split("  auth-guard-chromium:")[1],
  ];
  for (const lane of lanes) {
    assert.ok(lane, "Missing required browser lane");
    assert.match(lane, /^\s+NEXT_PUBLIC_SUPABASE_URL: http:\/\/127\.0\.0\.1:9$/m);
    assert.doesNotMatch(lane, /^\s+SUPABASE_SERVICE_ROLE_KEY:/m);
    assert.doesNotMatch(lane, /^\s+SUPABASE_SECRET_KEY:/m);
  }
  assert.match(lanes[0], /^\s+NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT: "1"$/m);
  assert.match(lanes[0], /^\s+E2E_BYPASS_AUTH: "1"$/m);
  assert.doesNotMatch(lanes[1], /^\s+E2E_BYPASS_AUTH:/m);
  assert.doesNotMatch(lanes[2], /^\s+E2E_BYPASS_AUTH:/m);
});

test("cold CI chat compilation runs before test timers only in chat lanes", () => {
  const shard = part("  deterministic-chromium:", "  # Real CopilotKit v2 composer:");
  const mobile = part("  mobile-composer:", "  # Stable overall check:");
  const auth = yaml.split("  auth-guard-chromium:")[1];
  assert.match(shard, /^\s+PLAYWRIGHT_CI_WARMUP: "1"/m);
  assert.match(mobile, /^\s+PLAYWRIGHT_CI_WARMUP: "1"/m);
  assert.doesNotMatch(auth, /^\s+PLAYWRIGHT_CI_WARMUP:/m);
});
