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
