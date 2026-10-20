import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadReferenceUpstreams, inspectReferences, formatSummary } from "../check-ai-reference-upstreams.mjs";
import { CLASSES } from "../check-skill-upstream-drift.mjs";

const root = path.resolve(".");
const entries = loadReferenceUpstreams(root);

test("inventory is exactly the three upstream projects and pins full commits", () => {
  assert.deepEqual(entries.map((entry) => entry.name).sort(), ["OpenBot", "OpenDots", "OpenMuse"]);
  assert.ok(entries.every((entry) => /^[0-9a-f]{40}$/.test(entry.reviewedCommit)));
  assert.equal(entries.find((entry) => entry.name === "OpenBot").strategy, "REFERENCE ONLY");
});

test("drift flags one project without changing any pin", async () => {
  const result = await inspectReferences(entries, async (slug) =>
    slug.endsWith("openbot")
      ? { classification: CLASSES.DRIFT, aheadBy: 5 }
      : { classification: CLASSES.OK });
  assert.equal(result.filter((item) => item.classification === CLASSES.DRIFT).length, 1);
  assert.match(formatSummary(result), /OpenBot.*DRIFT \(5 ahead\).*SAN-1324/);
  assert.deepEqual(result.map((item) => item.reviewedCommit), entries.map((item) => item.reviewedCommit));
});

test("network errors are reported as unavailable, not falsely reported as drift or success", async () => {
  const result = await inspectReferences(entries, async () => {
    throw Object.assign(new Error("network unavailable"), { code: "ETIMEDOUT" });
  });
  assert.ok(result.every((item) => item.classification === CLASSES.UPSTREAM_UNAVAILABLE));
});

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mde-ai-upstream-"));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
test("invalid or missing references cannot silently disappear from the report", () => {
  const target = path.join(temp, "docs/03-platform/copilotkit-mastra");
  fs.mkdirSync(target, { recursive: true });
  const manifest = path.join(target, "reference-upstreams.json");
  fs.writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, sources: entries.slice(0, 2) }));
  assert.throws(() => loadReferenceUpstreams(temp), /exactly three/);
  fs.writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, sources: entries.map((e) => ({ ...e, reviewedCommit: "bad" })) }));
  assert.throws(() => loadReferenceUpstreams(temp), /Invalid upstream/);
});

test("workflow reuses scheduled skill maintenance and cannot run on PRs or write to repo", () => {
  const yaml = fs.readFileSync(".github/workflows/skill-upstream-maintenance.yml", "utf8");
  assert.match(yaml, /node scripts\/check-ai-reference-upstreams\.mjs/);
  assert.match(yaml, /contents: read/);
  assert.doesNotMatch(yaml.split("on:")[1].split("jobs:")[0], /pull_request:/);
  assert.match(yaml, /schedule:/);
});
