import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

test("deep production smoke runs after promotion, not as the release gate", () => {
  const workflow = fs.readFileSync(".github/workflows/prod-synthetic-smoke.yml", "utf8");
  assert.match(workflow, /vercel\.deployment\.promoted/);
  assert.doesNotMatch(workflow, /vercel\.deployment\.success/);
});
