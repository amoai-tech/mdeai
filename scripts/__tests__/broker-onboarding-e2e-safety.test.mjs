import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
const spec = readFileSync("e2e/san-1092-broker-onboarding.spec.ts", "utf8");

test("broker onboarding is explicitly opted in and guards hosted Supabase before browser startup", () => {
  const cmd = scripts["test:e2e:broker-onboarding"];
  assert.ok(cmd.startsWith("node scripts/require-safe-e2e-backend.mjs &&"));
  assert.match(cmd, /RUN_REAL_BROKER_ONBOARDING=1/);
  assert.match(cmd, /--retries=0/);
  assert.match(spec, /RUN_REAL_BROKER_ONBOARDING !== "1"/);
  assert.match(spec, /cleanupBrokerOnboarding\(admin, identity, deleteThrowawayIdentity\)/);
});

test("remote hosted target without explicit override is refused before any E2E browser action", () => {
  const env = { ...process.env,
    SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    ALLOW_PROD_CERTIFICATION: "0",
  };
  const result = spawnSync("npm", ["run", "test:e2e:broker-onboarding", "--", "--list"], {
    env, encoding: "utf8", timeout: 20_000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to start/);
  assert.doesNotMatch(result.stdout, /Running [0-9]+ test/);
});

test("authenticated screenshots stay opt-in and out of tracked evidence folders", () => {
  assert.match(spec, /BROKER_E2E_CAPTURE_SCREENSHOTS !== "1"/);
  assert.match(spec, /test\.info\(\)\.outputPath/);
  assert.doesNotMatch(spec, /docs\/tasks\/testing\/evidence/);
  // A spec must only retain private browser state when the operator deliberately opts in.
  assert.match(spec, /trace: "off", screenshot: "off", video: "off"/);
});
