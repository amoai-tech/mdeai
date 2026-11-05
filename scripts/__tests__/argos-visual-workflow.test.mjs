import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflow = readFileSync(".github/workflows/argos-visual.yml", "utf8");
const [capture, visual] = workflow.split("\n  visual:\n");

test("public screenshot browser results are independent from Argos quota", () => {
  assert.ok(visual, "visual upload must be a separate job");
  assert.match(capture, /name: Capture public UI \(Playwright\)/);
  assert.match(capture, /--project=chromium --workers=1 --reporter=dot/);
  assert.match(capture, /actions\/upload-artifact@v4/);
  assert.match(capture, /if-no-files-found: error/);
  assert.doesNotMatch(capture, /ARGOS_TOKEN:/, "capture must never receive an Argos credential");
});

test("original Screenshot public UI required check remains fail-closed on unverified upload", () => {
  assert.match(visual, /name: Screenshot public UI/);
  assert.match(visual, /needs: capture/);
  assert.match(visual, /actions\/download-artifact@v4/);
  assert.match(visual, /ARGOS_TOKEN: \$\{\{ secrets\.ARGOS_TOKEN \}\}/);
  assert.match(visual, /npx argos upload \.\/screenshots/);
  assert.match(visual, /VISUAL_NOT_VERIFIED/);
  assert.match(visual, /exit 1/);
});

test("Argos CLI is directly pinned for reproducible CI", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.devDependencies["@argos-ci/cli"], "6.11.0");
});
