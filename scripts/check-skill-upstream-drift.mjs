#!/usr/bin/env node
/**
 * Detect upstream drift for vendored skill mirrors.
 *
 * `scripts/check-skill-upstream.py` proves the vendored files have not been edited
 * locally. This script answers the other half of the `detect-diff-review-evals-pin`
 * flow each `upstream.yaml` names: has the pinned upstream repository moved on?
 *
 * Deliberately a scheduled/manual check, never a pull-request gate. It talks to the
 * public GitHub API, and a required PR check that depends on an external service is
 * an availability liability (the same reason `maps-skill-maintenance.yml` keeps its
 * live checks off `pull_request`).
 *
 * Classification, mirroring `maps/scripts/check-classification.mjs`:
 *   OK                     pinned commit is the upstream head
 *   DRIFT                  upstream has commits the pin does not
 *   UPSTREAM_UNAVAILABLE   network/rate-limit/5xx — not evidence either way
 *
 * An unrecognised error classifies as DRIFT (fail closed): treating an unknown
 * failure as an outage is how a real drift alarm ends up permanently green.
 *
 * Usage:
 *   node scripts/check-skill-upstream-drift.mjs [--root DIR] [--json]
 *
 * Env:
 *   GITHUB_TOKEN        optional; raises the API rate limit
 *   SKILL_DRIFT_MODE    strict (default) | advisory
 *                       strict  — any non-OK fails
 *                       advisory — only DRIFT fails; UPSTREAM_UNAVAILABLE is reported
 */

import fs from "node:fs";
import path from "node:path";

export const CLASSES = Object.freeze({
  OK: "OK",
  DRIFT: "DRIFT",
  UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE",
});

/** Map a GitHub compare status onto a classification. */
export function classifyComparison(status) {
  if (status === "identical") return CLASSES.OK;
  if (status === "ahead" || status === "diverged" || status === "behind") {
    return CLASSES.DRIFT;
  }
  // Unknown status: fail closed rather than assume the pin is current.
  return CLASSES.DRIFT;
}

/**
 * Classify a non-2xx response.
 *
 * A 404 is only drift evidence when the request was authenticated. GitHub reports a
 * private repository as 404 to an unauthenticated caller, so without a token a 404
 * means "not visible to us", not "the upstream is gone". Reading it as drift would
 * send a maintainer hunting for a repository that is merely private.
 */
export function classifyHttpStatus(status, { hasToken = false } = {}) {
  if (status === 403 || status === 429) return CLASSES.UPSTREAM_UNAVAILABLE;
  if (status >= 500) return CLASSES.UPSTREAM_UNAVAILABLE;
  if (status === 404 && !hasToken) return CLASSES.UPSTREAM_UNAVAILABLE;
  return CLASSES.DRIFT;
}

/** Unknown throws fail closed; only recognisable transport failures are unavailable. */
export function classifyError(error) {
  const code = error?.cause?.code ?? error?.code;
  if (["ENOTFOUND", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED"].includes(code)) {
    return CLASSES.UPSTREAM_UNAVAILABLE;
  }
  if (error?.name === "AbortError") return CLASSES.UPSTREAM_UNAVAILABLE;
  return CLASSES.DRIFT;
}

/**
 * Decide the exit code.
 *
 * Confirmed DRIFT always fails, in both modes — only an unavailable upstream is
 * downgradeable, and only in advisory mode.
 */
export function resolveExitCode(mode, classifications) {
  const failing = classifications.filter((c) =>
    mode === "advisory" ? c === CLASSES.DRIFT : c !== CLASSES.OK,
  );
  return failing.length > 0 ? 2 : 0;
}

/** Extract repository slug and pinned commit from an upstream.yaml body. */
export function parseManifest(text) {
  const repository = text.match(/^repository:\s*["']?([^\s"']+)["']?\s*$/m)?.[1];
  const reviewed = text.match(/^reviewed_commit:\s*["']?([0-9a-f]{7,40})["']?\s*$/m)?.[1];
  const vendor = text.match(/^vendor:\s*["']?([^\n"']+)["']?\s*$/m)?.[1]?.trim();
  if (!repository || !reviewed) return null;
  const slug = repository
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  if (!/^[^/]+\/[^/]+$/.test(slug)) return null;
  return { slug, reviewed, vendor: vendor ?? slug };
}

export function loadPins(root) {
  const skills = path.join(root, ".claude", "skills");
  const pins = [];
  for (const entry of fs.readdirSync(skills, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = path.join(skills, entry.name, "upstream.yaml");
    if (!fs.existsSync(manifest)) continue;
    const parsed = parseManifest(fs.readFileSync(manifest, "utf8"));
    if (parsed) pins.push({ skill: entry.name, ...parsed });
  }
  return pins;
}

async function fetchComparison(slug, reviewed) {
  const hasToken = Boolean(process.env.GITHUB_TOKEN);
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "mdeai-skill-drift" };
  if (hasToken) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const url = `https://api.github.com/repos/${slug}/compare/${reviewed}...HEAD`;
  const response = await fetch(url, { headers });
  if (!response.ok) return { classification: classifyHttpStatus(response.status, { hasToken }) };
  const body = await response.json();
  return {
    classification: classifyComparison(body.status),
    headSha: body.commits?.at(-1)?.sha ?? body.sha,
    aheadBy: body.ahead_by,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.includes("--json");
  const rootIndex = args.indexOf("--root");
  const root = path.resolve(rootIndex === -1 ? "." : args[rootIndex + 1]);
  const mode = process.env.SKILL_DRIFT_MODE === "advisory" ? "advisory" : "strict";

  const pins = loadPins(root);
  if (pins.length === 0) {
    console.error("SKILL_DRIFT_FAIL — no upstream.yaml manifests found");
    process.exitCode = 2;
    return;
  }

  const results = [];
  for (const pin of pins) {
    let result;
    try {
      result = await fetchComparison(pin.slug, pin.reviewed);
    } catch (error) {
      result = { classification: classifyError(error) };
    }
    results.push({ ...pin, ...result });
  }

  const summary = results.map((r) => ({
    skill: r.skill,
    repository: r.slug,
    reviewed: r.reviewed,
    head: r.headSha ?? null,
    aheadBy: r.aheadBy ?? null,
    classification: r.classification,
  }));

  if (jsonOut) {
    console.log(JSON.stringify({ mode, results: summary }, null, 2));
  } else {
    for (const r of summary) {
      console.log(
        `${r.classification.padEnd(21)} ${r.skill.padEnd(12)} ${r.repository} reviewed=${r.reviewed.slice(0, 9)}` +
          (r.aheadBy ? ` ahead_by=${r.aheadBy}` : ""),
      );
    }
  }

  const exitCode = resolveExitCode(mode, results.map((r) => r.classification));
  const drifted = summary.filter((r) => r.classification === CLASSES.DRIFT);

  if (exitCode !== 0 && drifted.length > 0) {
    console.error("\nSKILL_DRIFT_FAIL — upstream moved past the reviewed pin:");
    for (const r of drifted) {
      console.error(
        `- ${r.skill}: reviewed ${r.reviewed.slice(0, 9)} -> head ${r.head?.slice(0, 9) ?? "unknown"}\n` +
          `    Re-review ${r.repository}, run the skill evals, then update reviewed_commit,\n` +
          `    reviewed_at, and local_integrity.trees in .claude/skills/${r.skill}/upstream.yaml.`,
      );
    }
  } else if (exitCode !== 0) {
    console.error("\nSKILL_DRIFT_FAIL — upstream unavailable; no drift conclusion reached.");
  } else {
    console.log(`\nSKILL_DRIFT_PASS pins=${summary.length} mode=${mode}`);
  }
  process.exitCode = exitCode;
}

const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) await main();
