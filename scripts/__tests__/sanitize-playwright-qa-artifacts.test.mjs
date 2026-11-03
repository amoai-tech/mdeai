import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { sanitizePlaywrightQaArtifacts } from "../sanitize-playwright-qa-artifacts.mjs";

function withTempFolder(fn) {
  const root = mkdtempSync(join(tmpdir(), "mde-qa-artifacts-"));
  try { fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("retains ordinary Playwright diagnostics", () => withTempFolder(root => {
  const folder = join(root, "test-results", "public-test");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "error-context.md"), "safe public diagnostic");
  assert.equal(sanitizePlaywrightQaArtifacts(root), false);
  assert.equal(existsSync(join(folder, "error-context.md")), true);
}));

test("removes every possible report when a privileged test ran", () => withTempFolder(root => {
  const privateRun = join(root, "test-results", "private-test");
  const publicRun = join(root, "test-results", "public-test");
  const html = join(root, "tmp", "playwright-report");
  const blob = join(root, "blob-report");
  for (const dir of [privateRun, publicRun, html, blob]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(privateRun, "mde-private-qa.marker"), "PRIVATE_QA_ARTIFACTS");
  writeFileSync(join(privateRun, "error-context.md"), "protected page contents");
  writeFileSync(join(publicRun, "test-failed.png"), "normal screenshot");
  writeFileSync(join(html, "index.html"), "private html report");
  writeFileSync(join(blob, "shard-1.zip"), "private blob");
  assert.equal(sanitizePlaywrightQaArtifacts(root), true);
  for (const rel of ["test-results", "tmp/playwright-report", "blob-report"]) {
    assert.equal(existsSync(join(root, rel)), false, rel);
  }
}));

test("ignores marker files outside Playwright test results", () => withTempFolder(root => {
  const folder = join(root, "test-results");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(root, "mde-private-qa.marker"), "unrelated");
  assert.equal(sanitizePlaywrightQaArtifacts(root), false);
  assert.equal(existsSync(folder), true);
}));
