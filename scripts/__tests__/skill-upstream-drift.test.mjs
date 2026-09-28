import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import {
  CLASSES,
  classifyComparison,
  classifyError,
  classifyHttpStatus,
  loadPins,
  parseManifest,
  resolveExitCode,
} from "../check-skill-upstream-drift.mjs";

const tempDirs = [];
after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

test("classifies an unchanged pin as OK", () => {
  assert.equal(classifyComparison("identical"), CLASSES.OK);
});

test("classifies any upstream movement as DRIFT", () => {
  for (const status of ["ahead", "behind", "diverged"]) {
    assert.equal(classifyComparison(status), CLASSES.DRIFT, status);
  }
});

test("an unrecognised compare status fails closed as DRIFT", () => {
  // Treating an unknown status as "probably fine" is how a drift alarm goes green.
  assert.equal(classifyComparison("something-new"), CLASSES.DRIFT);
});

test("rate limiting and outages are not drift evidence", () => {
  assert.equal(classifyHttpStatus(403), CLASSES.UPSTREAM_UNAVAILABLE);
  assert.equal(classifyHttpStatus(429), CLASSES.UPSTREAM_UNAVAILABLE);
  assert.equal(classifyHttpStatus(503), CLASSES.UPSTREAM_UNAVAILABLE);
});

test("an authenticated 404 means the upstream is gone", () => {
  assert.equal(classifyHttpStatus(404, { hasToken: true }), CLASSES.DRIFT);
});

test("an unauthenticated 404 is not read as drift", () => {
  // GitHub reports a private repository as 404 to an anonymous caller, so reading
  // this as drift would send a maintainer after a repository that merely is private.
  assert.equal(classifyHttpStatus(404), CLASSES.UPSTREAM_UNAVAILABLE);
  assert.equal(classifyHttpStatus(404, { hasToken: false }), CLASSES.UPSTREAM_UNAVAILABLE);
});

test("an unknown throw fails closed as DRIFT", () => {
  assert.equal(classifyError(new Error("unexpected")), CLASSES.DRIFT);
});

test("recognisable transport failures are UPSTREAM_UNAVAILABLE", () => {
  assert.equal(classifyError({ cause: { code: "ENOTFOUND" } }), CLASSES.UPSTREAM_UNAVAILABLE);
  assert.equal(classifyError({ name: "AbortError" }), CLASSES.UPSTREAM_UNAVAILABLE);
});

test("strict mode fails on an unavailable upstream", () => {
  assert.equal(resolveExitCode("strict", [CLASSES.UPSTREAM_UNAVAILABLE]), 2);
});

test("advisory mode reports an unavailable upstream without failing", () => {
  assert.equal(resolveExitCode("advisory", [CLASSES.UPSTREAM_UNAVAILABLE]), 0);
});

test("confirmed drift fails in both modes", () => {
  assert.equal(resolveExitCode("strict", [CLASSES.DRIFT]), 2);
  assert.equal(resolveExitCode("advisory", [CLASSES.DRIFT]), 2);
});

test("all-OK passes in both modes", () => {
  assert.equal(resolveExitCode("strict", [CLASSES.OK, CLASSES.OK]), 0);
  assert.equal(resolveExitCode("advisory", [CLASSES.OK]), 0);
});

test("parses a github repository URL into a slug", () => {
  const parsed = parseManifest(
    ["vendor: Mastra", "repository: https://github.com/mastra-ai/skills", "reviewed_commit: 08428f9b47cdae1131d12cbd9f8e0886ff476211", "source:", "  local: references/official/mastra"].join("\n"),
  );
  assert.deepEqual(parsed, {
    slug: "mastra-ai/skills",
    reviewed: "08428f9b47cdae1131d12cbd9f8e0886ff476211",
    vendor: "Mastra",
  });
});

test("returns null when the manifest has no pin", () => {
  assert.equal(parseManifest("vendor: X\nrepository: https://github.com/a/b\n"), null);
});

test("loads one pin per skill that declares an upstream", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-drift-"));
  tempDirs.push(root);
  const mk = (name, body) => {
    const dir = path.join(root, ".claude", "skills", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "upstream.yaml"), body);
  };
  mk("alpha", "vendor: A\nrepository: https://github.com/a/one\nreviewed_commit: aaaaaaa1\n");
  mk("beta", "vendor: B\nrepository: https://github.com/b/two\nreviewed_commit: bbbbbbb2\n");
  fs.mkdirSync(path.join(root, ".claude", "skills", "gamma"), { recursive: true });

  const pins = loadPins(root);
  assert.deepEqual(pins.map((p) => p.skill).sort(), ["alpha", "beta"]);
  assert.equal(pins.every((p) => /^[^/]+\/[^/]+$/.test(p.slug)), true);
});
