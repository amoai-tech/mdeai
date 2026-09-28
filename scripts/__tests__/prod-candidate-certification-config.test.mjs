import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const config = fs.readFileSync("playwright.config.ts", "utf8");
const spec = fs.readFileSync("e2e/prod-candidate-certification.spec.ts", "utf8");

test("registers one focused candidate-certification Playwright command", () => {
  assert.equal(
    pkg.scripts["test:e2e:prod-candidate-certification"],
    "PW_SKIP_WEBSERVER=1 playwright test e2e/prod-candidate-certification.spec.ts --project=prod-smoke --workers=1",
  );
  assert.match(config, /prod-candidate-certification\.spec\.ts/);
});

test("fails closed in CI when candidate URL is missing", () => {
  assert.match(spec, /process\.env\.CI\s*&&\s*!baseUrl/);
  assert.match(spec, /throw new Error\(["']PROD_SMOKE_BASE_URL is required in CI/);
});


test("keeps pre-promotion certification independent of Maps browser referrer restrictions", () => {
  // Require a CALL, not a mention: the spec legitimately names these helpers in
  // comments explaining why it avoids the Maps-dependent UI path.
  assert.doesNotMatch(
    spec,
    /\b(?:gotoConcierge|sendConciergeMessage|waitForCopilotIdle)\s*\(/,
  );
  assert.match(spec, /method:\s*["']agent\/run["']/);
  // `agent/connect` only opens an SSE stream and never dispatches `messages`, so
  // a certification built on it can pass without the agent processing "ping".
  assert.doesNotMatch(spec, /method:\s*["']agent\/connect["']/);
  assert.match(spec, /agentId:\s*["']conciergeAgent["']/);
  assert.match(spec, /threadId,/);
  assert.match(spec, /runId:\s*randomUUID\(\)/);
  assert.match(spec, /role:\s*["']user["']/);
  assert.match(spec, /content:\s*["']ping["']/);
  assert.match(spec, /page\.request\.post\(route\(["']\/api\/copilotkit["']\)/);
  // A bare HTTP 200 certifies nothing: the AG-UI handler always answers 200 with
  // `text/event-stream`, and a failed run looks identical to a successful one.
  // The spec must assert the terminal AG-UI event that only a completed run emits.
  assert.match(spec, /text\/event-stream/);
  assert.match(spec, /RUN_FINISHED/);
  assert.doesNotMatch(spec, /runResponse\.json\(\)/);
});
