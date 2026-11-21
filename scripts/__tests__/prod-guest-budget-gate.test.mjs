import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import YAML from "yaml";

const read = (path) => readFileSync(path, "utf8");
const workflowPath = ".github/workflows/vercel-production-certification.yml";
const stageName = "Certify exact staged candidate";
const gateName = "Verify guest COP budget refinement before promotion";
const promoteName = "Promote the exact certified deployment";
const actionExpr = (expression) => "$" + "{{ " + expression + " }}";

/** Test the executable job steps, not comments or whitespace. */
function assertGuestGateBeforePromotion(workflow) {
  const job = workflow?.jobs?.certify;
  assert.ok(job, "the candidate certification job must exist");
  const steps = job.steps;
  assert.ok(Array.isArray(steps), "certify must have executable steps");
  const names = steps.map((step) => step?.name);
  for (const name of [stageName, gateName, promoteName]) {
    assert.equal(names.filter((step) => step === name).length, 1,
      "exactly one executable step must be named " + name);
  }
  const stageIndex = names.indexOf(stageName);
  const gateIndex = names.indexOf(gateName);
  const promoteIndex = names.indexOf(promoteName);
  assert.ok(stageIndex < gateIndex && gateIndex < promoteIndex,
    "guest browser check must run between candidate certification and production promotion");

  const stage = steps[stageIndex];
  const gate = steps[gateIndex];
  const promote = steps[promoteIndex];
  assert.equal(stage.id, "certify");
  assert.equal(stage.run, "npm run test:e2e:prod-candidate-certification");
  assert.equal(gate.if, actionExpr("success() && steps.certify.outcome == 'success'"),
    "the guest check must only run after candidate certification succeeds");
  assert.notEqual(gate["continue-on-error"], true, "the guest check must block promotion on failure");
  assert.equal(gate.run, "npm run test:e2e:prod-guest-budget");
  assert.equal(gate.env?.PROD_SMOKE_BASE_URL, actionExpr("env.VERCEL_DEPLOYMENT_URL"),
    "guest checks must use the exact staged deployment");
  assert.equal(gate.env?.MDE_VERCEL_EXPECTED_ENVIRONMENT, "production",
    "release gate must verify the staged production environment, not a PR preview");
  assert.equal(gate.env?.VERCEL_AUTOMATION_BYPASS_SECRET,
    actionExpr("secrets.VERCEL_AUTOMATION_BYPASS_SECRET"));
  assert.equal(promote.if, actionExpr("success() && steps.certify.outcome == 'success'"),
    "promotion must respect failures from prior steps");
  assert.match(promote.run, /vercel@.*promote/s, "promotion must remain the actual Vercel action");
}

test("SAN-755 guest rental refinement blocks promotion when staged browser tests fail", () => {
  const workflow = YAML.parse(read(workflowPath), { uniqueKeys: true });
  assertGuestGateBeforePromotion(workflow);

  const script = JSON.parse(read("package.json")).scripts["test:e2e:prod-guest-budget"];
  const config = read("playwright.config.ts");
  const guest = read("e2e/prod-guest-rental-budget.spec.ts");
  assert.match(script, /e2e\/prod-guest-rental-budget\.spec\.ts --project=prod-smoke/);
  assert.match(script, /PW_SKIP_WEBSERVER=1/);
  assert.match(config, /prod-guest-rental-budget\.spec\.ts/);
  assert.match(guest, /trace: "on-first-retry", screenshot: "only-on-failure"/);
  assert.match(guest, /budget COP 3M to COP 2\.5M/);
});

test("SAN-755 gate contract rejects reordered or bypassable steps", () => {
  const workflow = YAML.parse(read(workflowPath), { uniqueKeys: true });
  const reordered = structuredClone(workflow);
  const steps = reordered.jobs.certify.steps;
  const index = steps.findIndex((step) => step.name === gateName);
  steps.push(...steps.splice(index, 1));
  assert.throws(() => assertGuestGateBeforePromotion(reordered), /between candidate certification/);

  const bypass = structuredClone(workflow);
  bypass.jobs.certify.steps.find((step) => step.name === gateName)["continue-on-error"] = true;
  assert.throws(() => assertGuestGateBeforePromotion(bypass), /must block promotion/);

  const wrongEnvironment = structuredClone(workflow);
  wrongEnvironment.jobs.certify.steps.find((step) => step.name === gateName)
    .env.MDE_VERCEL_EXPECTED_ENVIRONMENT = "preview";
  assert.throws(() => assertGuestGateBeforePromotion(wrongEnvironment), /staged production environment/);

  const wrongTarget = structuredClone(workflow);
  wrongTarget.jobs.certify.steps.find((step) => step.name === gateName)
    .env.PROD_SMOKE_BASE_URL = "https://www.mdeai.co";
  assert.throws(() => assertGuestGateBeforePromotion(wrongTarget), /exact staged deployment/);

  const unsafeCondition = structuredClone(workflow);
  unsafeCondition.jobs.certify.steps.find((step) => step.name === promoteName)
    .if = actionExpr("always()");
  assert.throws(() => assertGuestGateBeforePromotion(unsafeCondition), /respect failures/);
});
