import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("SAN-755 guest rental refinement is run on staged build before promotion", () => {
  const workflow = read(".github/workflows/vercel-production-certification.yml");
  const script = JSON.parse(read("package.json")).scripts["test:e2e:prod-guest-budget"];
  const config = read("playwright.config.ts");
  const guest = read("e2e/prod-guest-rental-budget.spec.ts");
  assert.match(script, /e2e\/prod-guest-rental-budget\.spec\.ts --project=prod-smoke/);
  assert.match(script, /PW_SKIP_WEBSERVER=1/);
  assert.match(config, /prod-guest-rental-budget\.spec\.ts/);
  assert.match(guest, /trace: "on-first-retry", screenshot: "only-on-failure"/);
  assert.match(guest, /budget COP 3M to COP 2\.5M/);
  const gate = workflow.indexOf("Verify guest COP budget refinement before promotion");
  const stage = workflow.indexOf("Certify exact staged candidate");
  const promote = workflow.indexOf("Promote the exact certified deployment");
  assert.ok(stage >= 0 && gate > stage && gate < promote,
    "the guest browser gate must test the staged build before production promotion");
  assert.match(workflow.slice(gate, promote), /PROD_SMOKE_BASE_URL: \$\{\{ env\.VERCEL_DEPLOYMENT_URL \}\}/);
  assert.match(workflow.slice(gate, promote), /VERCEL_AUTOMATION_BYPASS_SECRET/);
  assert.match(workflow.slice(gate, promote), /npm run test:e2e:prod-guest-budget/);
});
