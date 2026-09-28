import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const config = fs.readFileSync("playwright.config.ts", "utf8");
const spec = fs.readFileSync("e2e/prod-candidate-certification.spec.ts", "utf8");
const agui = fs.readFileSync("e2e/helpers/agui-concierge.ts", "utf8");

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
  // The AG-UI request now lives in the adapter, so the shape is asserted there.
  assert.match(spec, /\brunConciergeAgent\(/);
  // The stream check is tied to the thread we asked for and the generated runId,
  // so a completed stream belonging to another thread/run cannot certify the turn.
  assert.match(spec, /\bassertRunCompleted\(\s*events\s*,\s*\{\s*threadId\s*,\s*runId\s*\}\s*\)/);
  assert.match(spec, /expect\(sentThreadId\)\.toBe\(threadId\)/);
  // Durable persistence stays a SEPARATE assertion from the stream check, and it
  // names the exact thread that was requested — not merely any thread the user owns.
  assert.match(spec, /threadCount\(identity!\.userId,\s*sentThreadId\)/);
  assert.doesNotMatch(spec, /threadCount\(identity!\.userId\)/);
  assert.match(spec, /deleteThrowawayIdentity\(identity\)/);
});

test("dispatches agent/run through the official AG-UI primitives", () => {
  // `agent/connect` only opens an SSE stream and never dispatches `messages`, so
  // a certification built on it can pass without the agent processing "ping".
  assert.match(agui, /method:\s*["']agent\/run["']/);
  assert.doesNotMatch(agui, /method:\s*["']agent\/connect["']/);
  assert.match(agui, /RunAgentInputSchema\.parse/);
  assert.match(agui, /runHttpRequest\(/);
  assert.match(agui, /transformHttpEventStream\(/);
  assert.match(agui, /content = ["']ping["']/);
  // Never point HttpAgent at this route: it posts the raw RunAgentInput with no
  // `method`/`params` envelope, which the CopilotKit route does not accept.
  assert.doesNotMatch(agui, /new HttpAgent\(/);
});

test("requires RUN_STARTED, no RUN_ERROR, and RUN_FINISHED for THIS run", () => {
  // A bare HTTP 200 certifies nothing: the AG-UI handler always answers 200 with
  // text/event-stream, and a failed run is signalled by the stream closing early.
  assert.match(agui, /RUN_ERROR/);
  assert.match(agui, /RUN_STARTED/);
  assert.match(agui, /RUN_FINISHED/);
  // Presence alone is not certification: the lifecycle events must carry the
  // threadId AND runId this request sent, or a complete stream for a different
  // turn would pass.
  assert.match(agui, /event\.threadId !== expected\.threadId/);
  assert.match(agui, /event\.runId !== expected\.runId/);
  assert.match(agui, /expected:\s*\{\s*threadId:\s*string;\s*runId:\s*string\s*\}/);
  // Decoding is the SDK's job, not string matching on the raw body.
  assert.doesNotMatch(spec, /runResponse\.json\(\)/);
  assert.doesNotMatch(spec, /runResponse\.text\(\)/);
});
