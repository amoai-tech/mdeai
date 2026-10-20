import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import {
  loadReferenceUpstreams,
  parseReferenceUpstreams,
  inspectReferences,
  formatSummary,
  formatJson,
  formatWarning,
} from "../check-ai-reference-upstreams.mjs";
import { CLASSES } from "../check-skill-upstream-drift.mjs";

const entries = loadReferenceUpstreams();

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

test("network errors are reported as unavailable with a safe reason and source URL", async () => {
  const result = await inspectReferences(entries, async () => {
    throw Object.assign(new Error("network unavailable"), { code: "ETIMEDOUT" });
  });
  assert.ok(result.every((item) => item.classification === CLASSES.UPSTREAM_UNAVAILABLE));
  assert.ok(result.every((item) => item.reason === "ETIMEDOUT"));
  assert.ok(result.every((item) => item.sourceUrl === "https://github.com/" + item.repository + "/compare/" + item.reviewedCommit + "...HEAD"));
  assert.match(formatWarning(result[0]), /ETIMEDOUT/);
});

test("unknown or missing classifications fail closed", async () => {
  const result = await inspectReferences(entries, async () => ({}));
  assert.ok(result.every((item) => item.classification === CLASSES.DRIFT));
});

test("invalid, duplicate, missing and unexpected repository references fail validation", () => {
  assert.throws(
    () => parseReferenceUpstreams({ schemaVersion: 1, sources: entries.slice(0, 2) }),
    /exactly three/,
  );
  assert.throws(
    () => parseReferenceUpstreams({ schemaVersion: 1, sources: entries.map((entry) => ({ ...entry, reviewedCommit: "bad" })) }),
    /Invalid upstream/,
  );
  assert.throws(
    () => parseReferenceUpstreams({
      schemaVersion: 1,
      sources: entries.map((entry) => entry.name === "OpenMuse" ? { ...entry, repository: "evil/openmuse" } : entry),
    }),
    /Unexpected repository/,
  );
  assert.throws(
    () => parseReferenceUpstreams({
      schemaVersion: 1,
      sources: [entries[0], entries[0], entries[2]],
    }),
    /Duplicate upstream/,
  );
  assert.throws(
    () => parseReferenceUpstreams({
      schemaVersion: 1,
      sources: entries.map((entry) => entry.name === "OpenMuse" ? { ...entry, strategy: "INSTALL" } : entry),
    }),
    /Invalid upstream/,
  );
});

test("JSON output remains valid and includes reason/source metadata", async () => {
  const result = await inspectReferences(entries, async () => {
    throw Object.assign(new Error("down"), { code: "EAI_AGAIN" });
  });
  const parsed = JSON.parse(formatJson(result));
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].reason, "EAI_AGAIN");
  assert.match(parsed[0].sourceUrl, /^https:\/\/github\.com\//);
});

test("summary includes a release link for a release-pinned reference", () => {
  const summary = formatSummary(entries.map((entry) => ({ ...entry, classification: CLASSES.DRIFT })));
  assert.match(summary, /releases\/tag\/v0\.0\.14/);
  assert.match(summary, /compare\//);
});

test("workflow reuses scheduled skill maintenance and cannot run on PRs or write to repo", () => {
  const yaml = fs.readFileSync(".github/workflows/skill-upstream-maintenance.yml", "utf8");
  assert.match(yaml, /node scripts\/check-ai-reference-upstreams\.mjs/);
  assert.match(yaml, /contents: read/);
  assert.doesNotMatch(yaml.split("on:")[1].split("jobs:")[0], /pull_request:/);
  assert.match(yaml, /schedule:/);
  assert.match(yaml, /workflow_dispatch:/);
});
