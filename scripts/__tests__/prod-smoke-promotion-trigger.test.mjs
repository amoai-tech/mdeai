import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

test("deep production smoke runs after promotion, not as the release gate", () => {
  const workflow = fs.readFileSync(".github/workflows/prod-synthetic-smoke.yml", "utf8");
  assert.match(workflow, /vercel\.deployment\.promoted/);
  assert.doesNotMatch(workflow, /vercel\.deployment\.success/);
});

test("Marketplace Health uses service role for true event totals and anon for upcoming visibility", () => {
  const workflow = fs.readFileSync(".github/workflows/prod-synthetic-smoke.yml", "utf8");
  assert.match(workflow, /events_total=\$\(count "\$svc" "events" ""\)/);
  assert.match(
    workflow,
    /events_upcoming=\$\(count "\$anon" "events" "&event_start_time=gte\./,
  );
});
