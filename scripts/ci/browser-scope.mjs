#!/usr/bin/env node
/**
 * SAN-1563 — decide whether a PR needs the deterministic Playwright suite.
 *
 * The browser suite is advisory (floor and mastra-schema-init are the required checks),
 * but it costs ~14 minutes of Chromium. Run it when a PR changes what a browser can see:
 * pages, components, client hooks, shared client code, proxy/auth routing, public assets,
 * browser config, dependencies, or the browser journeys themselves. A backend-only change
 * (for example a Zod validation guard under src/mastra) or a test-only edit does not.
 *
 * Force it with the `run-e2e` label.
 *
 * CI usage:
 *   CHANGED_FILES="$(git diff --name-only "$BASE_SHA...$HEAD_SHA")" \
 *   LABELS="$LABELS" node scripts/ci/browser-scope.mjs
 *
 * Writes `run_e2e=true|false` to $GITHUB_OUTPUT when set.
 */
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Paths whose changes can alter a browser journey. */
const BROWSER_FACING = [
  /^src\/(?:app|components|hooks|lib|platform)\//,
  /^src\/proxy\.ts$/,
  /^public\//,
  /^next\.config\./,
  /^playwright\.config\./,
  /^postcss\.config\./,
  /^package(?:-lock)?\.json$/,
  /^\.github\/workflows\/playwright-deterministic\.yml$/,
];

/**
 * A test-only edit does not change what a browser sees. This never applies to `e2e/`:
 * changing a journey, a fixture, or an e2e helper must run that journey.
 */
const TEST_ONLY = /(?:__tests__\/|\.test\.[cm]?[jt]sx?$)/;
const E2E_PATH = /^e2e\//;

/** True when a changed path can alter what a browser sees or how a journey runs. */
export function isBrowserFacing(file) {
  if (E2E_PATH.test(file)) return true;
  return BROWSER_FACING.some((pattern) => pattern.test(file)) && !TEST_ONLY.test(file);
}

/** Decide whether this PR needs the deterministic browser suite. */
export function decideBrowserSuite({ changedFiles = [], labels = [] } = {}) {
  const files = changedFiles.map((file) => file.trim()).filter(Boolean);

  if (labels.includes("run-e2e")) {
    return { run: true, reason: "forced by the run-e2e label" };
  }

  const browserFacing = files.filter(isBrowserFacing);
  if (browserFacing.length > 0) {
    return {
      run: true,
      reason: `browser-facing paths changed: ${browserFacing.join(", ")}`,
    };
  }

  return { run: false, reason: "no browser-facing paths changed" };
}

function labelsFromEnv(value) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const decision = decideBrowserSuite({
    changedFiles: (process.env.CHANGED_FILES ?? "").split("\n"),
    labels: labelsFromEnv(process.env.LABELS),
  });
  console.log(decision.reason);
  console.log(`run_e2e=${decision.run}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `run_e2e=${decision.run}\n`);
  }
}
