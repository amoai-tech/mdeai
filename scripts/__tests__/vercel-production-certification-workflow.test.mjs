import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const workflowPath = path.resolve(".github/workflows/vercel-production-certification.yml");
const PIN = "30f760c6640485cd92f8c785ef361382555fb712";

function workflow() {
  return fs.readFileSync(workflowPath, "utf8");
}

function multilineRunBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(\s*)run:\s*\|\s*$/);
    if (!match) continue;
    const indent = match[1].length;
    const body = [];
    for (i += 1; i < lines.length; i += 1) {
      if (lines[i].trim() && lines[i].search(/\S/) <= indent) {
        i -= 1;
        break;
      }
      body.push(lines[i]);
    }
    blocks.push(body.join("\n"));
  }
  return blocks;
}

/** The `certify` job only (the read-only credential-check job is separate). */
function certifyJob(text) {
  const start = text.indexOf("\n  certify:");
  assert.notEqual(start, -1, "workflow must have a `certify` job");
  return text.slice(start);
}

/** Index of a step name inside `scope`, failing loudly when the step is missing. */
function stepIndex(scope, name) {
  const index = scope.indexOf(`- name: ${name}`);
  assert.notEqual(index, -1, `workflow must have a step named "${name}"`);
  return index;
}

/** Text of one step: from its `- name:` to the next step. */
function stepBody(scope, name) {
  const from = stepIndex(scope, name);
  const next = scope.indexOf("\n      - ", from + 1);
  return scope.slice(from, next === -1 ? undefined : next);
}

test("uses the Vercel ready event and one diagnostic status context", () => {
  const text = workflow();
  assert.match(text, /vercel\.deployment\.ready/);
  assert.doesNotMatch(text, /vercel\.deployment\.success/);
  assert.match(text, /contents:\s*read/);
  assert.match(text, /statuses:\s*write/);
  assert.match(text, new RegExp(`vercel/repository-dispatch/actions/checkout@${PIN}`));
  assert.match(text, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.match(text, /name:\s*production-certification/);

  assert.doesNotMatch(
    text,
    new RegExp(`vercel/repository-dispatch/actions/status@${PIN}`),
    "the pending-publishing status helper must not come back",
  );
  // Exactly one status publication: the result, for the one gate context.
  assert.equal(text.match(/-f context=/g)?.length, 1, "expected exactly one status publication");
  assert.match(text, /-f context=production-certification/);
});

test("the old publish-failure-first race workaround is gone", () => {
  // SAN-1330: protection is step ORDER, not status timing. A failure status published at the start
  // of the run still lost a ~3.5 s race against alias assignment, so it must not be mistaken for the
  // safety mechanism again.
  const text = workflow();
  assert.doesNotMatch(text, /Block promotion while certification is in flight/);
  assert.doesNotMatch(text, /certification in flight — promotion blocked/);
});

test("promotion is explicit, uses the exact deployment id, and is a pinned CLI call", () => {
  const job = certifyJob(workflow());
  const promote = stepBody(job, "Promote the exact certified deployment");

  assert.match(promote, /vercel@\$\{VERCEL_CLI_VERSION\}\" promote \"\$\{VERCEL_DEPLOYMENT_ID\}\"/);
  assert.match(promote, /--scope "\$\{VERCEL_SCOPE\}"/);
  assert.doesNotMatch(promote, /--token/, "do not expose Vercel tokens in CLI arguments");
  assert.match(workflow(), /VERCEL_CLI_VERSION:\s*"\d+\.\d+\.\d+"/, "the Vercel CLI must be pinned to an exact version");
  assert.match(workflow(), /VERCEL_DEPLOYMENT_ID:\s*\$\{\{\s*github\.event\.client_payload\.id\s*\}\}/);

  // Exactly one promotion command in the whole workflow, and never a domain or alias shortcut.
  assert.equal(workflow().match(/\bpromote\b\s+"\$\{VERCEL_DEPLOYMENT_ID\}"/g)?.length, 1);
  assert.doesNotMatch(workflow(), /vercel[^\n]*\balias\b/i, "no manual alias assignment path");
  assert.doesNotMatch(workflow(), /--prod\b|--skip-domain/, "no second deployment path");
});

test("promotion cannot run after any failed step", () => {
  const job = certifyJob(workflow());
  const promote = stepBody(job, "Promote the exact certified deployment");

  // GitHub's `success()` is false once any earlier step failed or was cancelled.
  assert.match(promote, /if:\s*\$\{\{\s*success\(\)\s*&&\s*steps\.certify\.outcome == 'success'\s*\}\}/);
  assert.doesNotMatch(promote, /always\(\)|failure\(\)|cancelled\(\)|continue-on-error/);

  // No step before promotion may be allowed to fail silently.
  const before = job.slice(0, stepIndex(job, "Promote the exact certified deployment"));
  assert.doesNotMatch(before, /continue-on-error:\s*true/, "a step that may fail must not precede promotion");
});

test("order: validate, staged, certify, re-confirm staged, promote, verify, stability, THEN publish final status", () => {
  const job = certifyJob(workflow());
  const order = [
    "Checkout exact deployed commit",
    "Checkout trusted release-control code",
    "Validate Vercel candidate trust boundary",
    "Verify the Vercel credential reaches the current team and project",
    "Verify Production defines the required variable names",
    "Confirm the candidate is staged",
    "Certify exact staged candidate",
    "Re-confirm the candidate is still staged right before promotion",
    "Promote the exact certified deployment",
    "Verify www.mdeai.co serves the exact certified deployment",
    "Verify production aliases remain stable after promotion",
    "Publish final release certification result",
  ].map((name) => stepIndex(job, name));
  assert.deepEqual([...order].sort((a, b) => a - b), order, "steps must run in the safe order");
});

test("the staged check runs again right before promotion, success-only and trusted (SAN-1402)", () => {
  const job = certifyJob(workflow());
  const recheck = stepBody(job, "Re-confirm the candidate is still staged right before promotion");
  assert.match(recheck, /node \.trusted\/scripts\/vercel-release-control\.mjs assert-staged/);
  assert.match(recheck, /if:\s*\$\{\{\s*success\(\)\s*&&\s*steps\.certify\.outcome == 'success'\s*\}\}/);
  assert.doesNotMatch(recheck, /always\(\)|failure\(\)|cancelled\(\)|continue-on-error/);
  // Count by workflow step (not by raw text): exactly two steps run the staged check.
  const stagedSteps = job
    .split("\n      - ")
    .slice(1)
    .filter((step) => /run:\s*node \.trusted\/scripts\/vercel-release-control\.mjs assert-staged\s*$/m.test(step))
    .map((step) => step.match(/name: (.+)/)?.[1]);
  assert.deepEqual(stagedSteps, ["Confirm the candidate is staged", "Re-confirm the candidate is still staged right before promotion"]);
});

test("certification runs on the exact candidate URL, before and never after promotion", () => {
  const job = certifyJob(workflow());
  const certify = stepBody(job, "Certify exact staged candidate");
  assert.match(certify, /PROD_SMOKE_BASE_URL: \$\{\{ env\.VERCEL_DEPLOYMENT_URL \}\}/);
  assert.match(certify, /npm run test:e2e:prod-candidate-certification/);
  assert.ok(
    stepIndex(job, "Certify exact staged candidate") < stepIndex(job, "Promote the exact certified deployment"),
    "certification must finish before promotion starts",
  );
});

test("publishes success only after certification, staged recheck, promotion, domain and stability all passed", () => {
  const job = certifyJob(workflow());
  const result = stepBody(job, "Publish final release certification result");
  assert.match(result, /if: always\(\)/);
  for (const [key, stepId] of [
    ["CERTIFY_OUTCOME", "certify"],
    ["STAGED_OUTCOME", "final_staged"],
    ["PROMOTE_OUTCOME", "promote"],
    ["VERIFIED_OUTCOME", "verify_promoted"],
    ["STABLE_OUTCOME", "verify_stable"],
  ]) {
    assert.ok(result.includes(`${key}: \${{ steps.${stepId}.outcome }}`), `${key} must come from its exact step`);
    assert.ok(result.includes(`"$${key}" == success`), `${key} must gate success`);
  }
  assert.match(result, /state=failure/, "any skipped, failed, or cancelled gate must publish failure");
  assert.match(result, /-f target_url="\$\{RUN_URL\}"/, "the status must stay diagnosable");
  assert.ok(stepIndex(job, "Verify production aliases remain stable after promotion") < stepIndex(job, "Publish final release certification result"));
  assert.doesNotMatch(job.slice(0, stepIndex(job, "Publish final release certification result")), /-f context=production-certification/, "success must not be prepublished");
});

test("production is verified after promotion, and only if promotion succeeded", () => {
  const job = certifyJob(workflow());
  const verify = stepBody(job, "Verify www.mdeai.co serves the exact certified deployment");
  assert.match(verify, /node \.trusted\/scripts\/vercel-release-control\.mjs assert-promoted/);
  assert.match(verify, /GH_TOKEN:\s*\$\{\{ secrets\.GITHUB_TOKEN \}\}/,
    "post-promote verification re-reads live main, so it must have GitHub credentials");
  assert.match(verify, /if:\s*\$\{\{\s*success\(\)\s*\}\}/);
});

test("the candidate is validated, credential-checked and confirmed staged before any test runs", () => {
  const job = certifyJob(workflow());
  const validate = stepBody(job, "Validate Vercel candidate trust boundary");
  assert.match(validate, /node \.trusted\/scripts\/validate-vercel-deployment-event\.mjs/);
  assert.match(job, /node \.trusted\/scripts\/vercel-release-control\.mjs credential/);
  assert.match(job, /node \.trusted\/scripts\/vercel-release-control\.mjs env-names/);
  assert.match(job, /node \.trusted\/scripts\/vercel-release-control\.mjs assert-staged/);
  const certify = stepIndex(job, "Certify exact staged candidate");
  for (const name of [
    "Validate Vercel candidate trust boundary",
    "Verify the Vercel credential reaches the current team and project",
    "Verify Production defines the required variable names",
    "Confirm the candidate is staged",
  ]) {
    assert.ok(stepIndex(job, name) < certify, `"${name}" must come before certification`);
  }
});

test("passes dispatch data through environment variables, never interpolated into shell", () => {
  const text = workflow();
  for (const name of [
    "VERCEL_DEPLOYMENT_ID",
    "VERCEL_DEPLOYMENT_REF",
    "VERCEL_DEPLOYMENT_URL",
    "VERCEL_DEPLOYMENT_SHA",
    "VERCEL_PROJECT_ID",
    "VERCEL_PROJECT_NAME",
    "VERCEL_ENVIRONMENT",
  ]) {
    assert.match(text, new RegExp(`${name}:`));
  }
  assert.match(text, /VERCEL_DEPLOYMENT_REF:\s*\$\{\{\s*github\.event\.client_payload\.git\.ref\s*\}\}/);
  for (const block of multilineRunBlocks(text)) {
    assert.doesNotMatch(block, /github\.event\.client_payload/);
    assert.doesNotMatch(block, /\$\{\{\s*secrets\./, "secrets go through env:, not shell interpolation");
  }
});

test("only the certify job can promote; the manual credential check is read-only", () => {
  const text = workflow();
  const start = text.indexOf("\n  credential-check:");
  const end = text.indexOf("\n  certify:");
  assert.ok(start !== -1 && end > start, "credential-check job must precede certify");
  const credentialJob = text.slice(start, end);
  assert.match(credentialJob, /if: github\.event_name == 'workflow_dispatch'/);
  assert.doesNotMatch(credentialJob, /promote|statuses|gh api/, "the manual check must not promote or publish");
  assert.match(certifyJob(text), /github\.event_name == 'repository_dispatch'/);
});

test("the Vercel token only ever reaches reviewed code from the trusted checkout", () => {
  const job = certifyJob(workflow());

  // The candidate commit is checked out first; the default branch goes into .trusted AFTER it
  // (a later root checkout runs `git clean` and would delete the folder).
  const trusted = stepBody(job, "Checkout trusted release-control code");
  assert.ok(
    stepIndex(job, "Checkout exact deployed commit") < stepIndex(job, "Checkout trusted release-control code"),
    "the trusted checkout must come after the candidate checkout",
  );
  assert.match(trusted, /ref: main/);
  assert.match(trusted, /path: \.trusted/);
  assert.match(trusted, /persist-credentials: false/);
  assert.doesNotMatch(trusted, /client_payload/, "the trusted ref must not come from the dispatch payload");

  // Every step that holds the token runs code from `.trusted/` (or the pinned npm CLI from there).
  const steps = job.split("\n      - ").slice(1);
  const withToken = steps.filter((step) => /VERCEL_TOKEN/.test(step));
  assert.ok(withToken.length >= 5, "expected the credential, names, staged, promote and verify steps");
  for (const step of withToken) {
    const name = step.match(/name: (.+)/)?.[1] ?? "(unnamed)";
    assert.match(step, /\.trusted(\/|\s|$)/m, `"${name}" holds VERCEL_TOKEN so it must run trusted code`);
    assert.doesNotMatch(step, /node scripts\/|npm run|npx playwright|npm ci/, `"${name}" must not run candidate code`);
  }

  // The trust-boundary validator is the trusted copy too: a candidate cannot vouch for itself.
  assert.doesNotMatch(job, /node scripts\/validate-vercel-deployment-event\.mjs/);
  assert.doesNotMatch(job, /node scripts\/vercel-release-control\.mjs/);

  // The pinned CLI runs from the trusted checkout so the candidate's .npmrc cannot steer npx.
  assert.match(stepBody(job, "Promote the exact certified deployment"), /cd \.trusted/);
});

test("the manual credential check can only run from main", () => {
  const text = workflow();
  const start = text.indexOf("\n  credential-check:");
  const credentialJob = text.slice(start, text.indexOf("\n  certify:"));
  assert.match(credentialJob, /github\.ref == 'refs\/heads\/main'/);
});

test("an older READY event cannot promote after main has moved", () => {
  const job = certifyJob(workflow());
  const stale = stepBody(job, "Reject stale main candidate");

  assert.match(stale, /git rev-parse HEAD/, "must read the candidate checkout SHA");
  assert.match(stale, /git -C \.trusted rev-parse HEAD/, "must read current main from the trusted checkout");
  assert.match(stale, /exit 1/, "a SHA mismatch must fail closed");
  assert.ok(
    stepIndex(job, "Checkout trusted release-control code") < stepIndex(job, "Reject stale main candidate"),
    "current main must be checked out before the freshness check",
  );
  assert.ok(
    stepIndex(job, "Reject stale main candidate") < stepIndex(job, "Validate Vercel candidate trust boundary"),
    "a stale candidate must fail before any release checks or certification",
  );
  assert.ok(
    stepIndex(job, "Reject stale main candidate") < stepIndex(job, "Promote the exact certified deployment"),
    "a stale candidate must never reach promotion",
  );
});

test("candidates are certified one at a time", () => {
  const job = certifyJob(workflow());
  assert.match(job, /concurrency:\s*\n\s*group: vercel-production-certification\s*\n\s*cancel-in-progress: false/);
});

test("no workflow still points at the stale Vercel team or project from PR #85", () => {
  for (const file of fs.readdirSync(".github/workflows")) {
    const body = fs.readFileSync(path.join(".github/workflows", file), "utf8");
    assert.doesNotMatch(body, /team_ZDZyovkHiBVULVkZLSQ7rEUU|prj_FRWMRzXWMSzyB0NPR9nbyoz15UUz/, `${file} must not use the old Vercel identity`);
  }
});

test("secrets are only passed to the steps that need them", () => {
  const job = certifyJob(workflow());
  // The Vercel token reaches only the release-control calls and the promote step - never the browser test.
  const certify = stepBody(job, "Certify exact staged candidate");
  assert.doesNotMatch(certify, /VERCEL_TOKEN/);
  const install = stepBody(job, "Install dependencies");
  assert.doesNotMatch(install, /secrets\./);
});

// SAN-1586: a checkout-based main check before the long E2E is not a final freshness check.
test("promotion rechecks GitHub remote main in the same trusted step after certification", () => {
  const job = certifyJob(workflow());
  const promote = stepBody(job, "Promote the exact certified deployment");
  const fresh = promote.indexOf("assert-current-main");
  const cli = promote.indexOf("vercel@");
  assert.ok(fresh >= 0 && cli > fresh, "fetch the current main before calling Vercel");
  assert.match(promote, /GH_TOKEN:\s*\$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.match(promote, /node \.trusted\/scripts\/vercel-release-control\.mjs assert-current-main/);
  assert.match(promote, /set -euo pipefail/, "a moved main must stop the promotion");
});

test("Vercel 409 never grants a green release without exact-alias reconciliation", () => {
  const promote = stepBody(certifyJob(workflow()), "Promote the exact certified deployment");
  assert.match(promote, /grep -Eiq.*409/);
  assert.match(promote, /reconcile-promote/);
  assert.match(promote, /exit 1/, "all unrelated errors must fail");
  assert.doesNotMatch(promote, /continue-on-error|always\(\)/);
});

test("release rechecks both aliases after a delayed second promotion, not only immediately", () => {
  const job = certifyJob(workflow());
  const verify = stepIndex(job, "Verify www.mdeai.co serves the exact certified deployment");
  const stable = stepIndex(job, "Verify production aliases remain stable after promotion");
  assert.ok(stable > verify, "stability window must follow the immediate verification");
  assert.match(stepBody(job, "Verify production aliases remain stable after promotion"), /assert-stable/);
});

test("scheduled late-drift detector only reads aliases and never runs promotion", () => {
  const txt = workflow();
  assert.match(txt, /schedule:\s*\n\s*- cron:/);
  const start = txt.indexOf("\n  monitor-production:");
  const end = txt.indexOf("\n  certify:");
  assert.ok(start > 0 && end > start);
  const monitor = txt.slice(start, end);
  assert.match(monitor, /github\.event_name == 'schedule'/);
  assert.match(monitor, /assert-live-current/);
  assert.doesNotMatch(monitor, /active-deployment/);
  assert.doesNotMatch(monitor, /vercel@|npx.*promote|request_promote/);
});

// Canary F01: schedule.github.sha can lag the already-promoted current main.
test("scheduled monitor never passes event SHA as live-main expectation", () => {
  const job = workflow().split("\n  monitor-production:")[1].split("\n  certify:")[0];
  assert.doesNotMatch(job, /VERCEL_DEPLOYMENT_SHA:\s*\$\{\{\s*github\.sha\s*\}\}/);
  assert.doesNotMatch(job, /active-deployment/, "use one atomic read-only monitor command");
  assert.match(job, /assert-live-current/);
  assert.match(job, /GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/);
});
