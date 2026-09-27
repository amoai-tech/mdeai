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

test("uses the Vercel ready event and one blocking status context", () => {
  const text = workflow();
  assert.match(text, /vercel\.deployment\.ready/);
  assert.doesNotMatch(text, /vercel\.deployment\.success/);
  assert.match(text, /contents:\s*read/);
  assert.match(text, /statuses:\s*write/);
  assert.match(text, new RegExp(`vercel/repository-dispatch/actions/checkout@${PIN}`));
  assert.match(text, new RegExp(`vercel/repository-dispatch/actions/status@${PIN}`));
  assert.match(text, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.match(text, /name:\s*production-certification/);
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
  assert.ok(
    text.indexOf("Validate Vercel candidate trust boundary") <
      text.indexOf("Publish certification status to candidate SHA"),
    "candidate identity must be validated before any certification status is written",
  );
  for (const block of multilineRunBlocks(text)) {
    assert.doesNotMatch(block, /github\.event\.client_payload/);
  }
});
