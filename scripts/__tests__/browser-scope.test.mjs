import assert from "node:assert/strict";
import { test } from "node:test";
import { decideBrowserSuite, isBrowserFacing } from "../ci/browser-scope.mjs";

test("backend-only validation changes and their tests skip the browser suite", () => {
  const decision = decideBrowserSuite({
    changedFiles: [
      "src/mastra/tools/search-rentals.ts",
      "src/mastra/tools/__tests__/search-rentals-monthly-only.test.ts",
      "src/app/api/rentals/search/__tests__/route.test.ts",
      "docs/07-operations/note.md",
    ],
  });
  assert.equal(decision.run, false);
  assert.match(decision.reason, /no browser-facing paths/);
});

test("browser-facing paths run the suite", () => {
  for (const file of [
    "src/app/rentals/page.tsx",
    "src/app/api/rentals/search/route.ts",
    "src/components/rental-card.tsx",
    "src/hooks/use-rental-search.ts",
    "src/lib/rental-display.ts",
    "src/platform/copilot/workflow-steps.ts",
    "src/proxy.ts",
    "public/logo.svg",
    "e2e/deterministic-critical.spec.ts",
    "next.config.ts",
    "playwright.config.ts",
    "postcss.config.mjs",
    "package.json",
    "package-lock.json",
    ".github/workflows/playwright-deterministic.yml",
  ]) {
    assert.equal(isBrowserFacing(file), true, file);
  }
});

test("test-only edits and unrelated files do not run the suite", () => {
  for (const file of [
    "src/components/__tests__/rental-card.test.tsx",
    "src/app/api/rentals/search/__tests__/route.test.ts",
    "src/mastra/agents/concierge.ts",
    "scripts/check-docs.mjs",
    ".github/workflows/floor.yml",
  ]) {
    assert.equal(isBrowserFacing(file), false, file);
  }
});

test("the run-e2e label forces the suite for a backend-only change", () => {
  const decision = decideBrowserSuite({
    changedFiles: ["src/mastra/tools/search-rentals.ts"],
    labels: ["run-e2e"],
  });
  assert.equal(decision.run, true);
  assert.match(decision.reason, /run-e2e/);
});

test("a lookalike label does not force the suite", () => {
  const decision = decideBrowserSuite({
    changedFiles: ["src/mastra/tools/search-rentals.ts"],
    labels: ["run-e2e-extra"],
  });
  assert.equal(decision.run, false);
});

test("blank changed-file lines are ignored", () => {
  const decision = decideBrowserSuite({
    changedFiles: ["", "  ", "src/mastra/tools/search-rentals.ts"],
  });
  assert.equal(decision.run, false);
});
