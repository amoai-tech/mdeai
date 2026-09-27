import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

test("production Next.js build cannot ignore TypeScript errors", () => {
  const config = fs.readFileSync("next.config.ts", "utf8");
  assert.doesNotMatch(config, /ignoreBuildErrors\s*:\s*true/);
});
