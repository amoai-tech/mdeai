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

/** Index of a step name, failing loudly when the step is missing. */
function stepIndex(text, name) {
  const index = text.indexOf(`- name: ${name}`);
  assert.notEqual(index, -1, `workflow must still have a step named "${name}"`);
  return index;
}

test("uses the Vercel ready event and one blocking status context", () => {
  const text = workflow();
  assert.match(text, /vercel\.deployment\.ready/);
  assert.doesNotMatch(text, /vercel\.deployment\.success/);
  assert.match(text, /contents:\s*read/);
  assert.match(text, /statuses:\s*write/);
  assert.match(text, new RegExp(`vercel/repository-dispatch/actions/checkout@${PIN}`));
  assert.match(text, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.match(text, /name:\s*production-certification/);

  // SAN-1362: the block must be published explicitly, not delegated to the
  // `actions/status` helper. That helper published a non-terminal `pending`,
  // which did not hold: a35c60611 took the production alias at 23:51:42 while
  // this context was still pending, and only reported success at 23:53:00.
  assert.doesNotMatch(
    text,
    new RegExp(`vercel/repository-dispatch/actions/status@${PIN}`),
    "the pending-publishing status helper must not come back",
  );
  assert.match(text, /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/statuses\/\$\{SHA\}"/);
  assert.match(text, /-f context=production-certification/);
  // Exactly one status context, so nothing else can be mistaken for the gate.
  assert.equal(
    text.match(/-f context=/g)?.length,
    2,
    "expected exactly two status publications, both for the one gate context",
  );
});

test("fails closed before any fallible step", () => {
  const text = workflow();

  // The block must precede everything that can fail, or a failure in setup
  // leaves the candidate promotable with no certification result.
  const block = stepIndex(text, "Block promotion while certification is in flight");
  const checkout = stepIndex(text, "Checkout exact deployed commit");
  const validate = stepIndex(text, "Validate Vercel candidate trust boundary");
  const certify = stepIndex(text, "Certify exact staged candidate");

  assert.ok(block < checkout, "the block must be published before checkout can fail");
  assert.ok(block < validate, "the block must be published before validation can fail");
  assert.ok(block < certify, "the block must be published before certification runs");

  const blockBody = text.slice(block, checkout);
  assert.match(blockBody, /-f state=failure/, "the in-flight status must be a terminal failure");
  assert.doesNotMatch(blockBody, /-f state=pending/, "a pending status is what failed to hold");
});

test("publishes success only after the candidate identity is validated and certified", () => {
  const text = workflow();

  // `validate-vercel-deployment-event.mjs` is what proves the dispatch is a real
  // MDE production event and that the SHA matches the checked-out HEAD. A forged
  // dispatch must never be able to publish `success`, because `success` is what
  // releases the production alias - so success may only come from the final step,
  // which runs after both validation and the certification itself.
  const validate = stepIndex(text, "Validate Vercel candidate trust boundary");
  const certify = stepIndex(text, "Certify exact staged candidate");
  const result = stepIndex(text, "Publish certification result");

  assert.ok(validate < certify, "candidate identity must be validated before certifying");
  assert.ok(certify < result, "the certification result must be published after certifying");

  const resultBody = text.slice(result);
  assert.match(resultBody, /if: always\(\)/);
  assert.match(resultBody, /CERTIFY_OUTCOME: \$\{\{ steps\.certify\.outcome \}\}/);
  assert.match(
    resultBody,
    /if \[ "\$\{CERTIFY_OUTCOME\}" = "success" \]; then[\s\S]*?state=success/,
    "success must be gated on the certification step's own outcome",
  );
  assert.match(resultBody, /state=failure/, "any other outcome must republish failure");
});

test("passes dispatch data through environment variables and validates before tests", () => {
  const text = workflow();
  for (const name of [
    "VERCEL_DEPLOYMENT_URL",
    "VERCEL_DEPLOYMENT_SHA",
    "VERCEL_PROJECT_ID",
    "VERCEL_PROJECT_NAME",
    "VERCEL_ENVIRONMENT",
  ]) {
    assert.match(text, new RegExp(`${name}:`));
  }
  assert.match(text, /node scripts\/validate-vercel-deployment-event\.mjs/);
  assert.match(text, /npm run test:e2e:prod-candidate-certification/);

  // No dispatch payload interpolation inside shell blocks - that is the script
  // injection seam this workflow deliberately avoids by passing the payload
  // through `env:` instead.
  for (const block of multilineRunBlocks(text)) {
    assert.doesNotMatch(block, /github\.event\.client_payload/);
  }
});

test("keeps every status publication diagnosable", () => {
  const text = workflow();
  const bodies = multilineRunBlocks(text).filter((block) => block.includes("/statuses/${SHA}"));
  assert.equal(bodies.length, 2, "expected both status publications");
  for (const block of bodies) {
    // The candidate is a throwaway deployment URL; without target_url a failed
    // status leads nowhere once the deployment is gone.
    assert.match(block, /-f target_url="\$\{RUN_URL\}"/);
  }
  assert.match(text, /RUN_URL: \$\{\{ github\.server_url \}\}\/\$\{\{ github\.repository \}\}\/actions\/runs\/\$\{\{ github\.run_id \}\}/);
});
