// SAN-1312 · MDE-PR-REVIEW-001
//
// Deterministic scorer for PR-Agent review output.
//
// It does not call a model. It scores a supplied review body against a case expectation, so the
// same input always yields the same verdict and the golden cases stay reproducible from Git.
// The model-behaviour question ("does the reviewer now find this defect?") is answered by running
// the real workflow on a canary PR and feeding its review body back through this scorer — see
// `scripts/pr-agent/evals/README.md`.

import { pathToFileURL } from "node:url";

/** Severities that make a finding merge-blocking for the purposes of this corpus. */
export const MATERIAL_SEVERITIES = ["BLOCKER", "HIGH"];

/**
 * Extract the machine-readable signals MDE's review contract requires from a review body.
 * Handles both the rendered PR-Agent table and plain `Severity: HIGH` style output.
 */
export function parseReviewSignals(text) {
  const body = typeof text === "string" ? text : "";
  const recommendation =
    /Merge recommendation(?:\s*<\/strong>)?\s*:\s*([^<\n]+)/i.exec(body)?.[1]?.trim() ?? "";
  const risk = /Risk level(?:\s*<\/strong>)?\s*:\s*([^<\n]+)/i.exec(body)?.[1]?.trim() ?? "";
  const scoreRaw = /Score(?:\s*<\/strong>)?\s*:\s*(\d{1,3})/i.exec(body)?.[1];
  const severities = [
    ...new Set(body.toUpperCase().match(/\b(?:BLOCKER|HIGH|MEDIUM|LOW)\b/g) ?? []),
  ];

  return {
    recommendation,
    risk,
    score: scoreRaw === undefined ? null : Number(scoreRaw),
    severities,
    materialSeverity: severities.some((severity) => MATERIAL_SEVERITIES.includes(severity)),
    changesRequired: /\bchanges_required\b/i.test(body),
    safeToMerge: /safe to merge/i.test(recommendation),
  };
}

function matchedSignalNames(caseDef, reviewText) {
  const body = typeof reviewText === "string" ? reviewText : "";
  return (caseDef.signals ?? [])
    .filter((signal) => signal.any.some((pattern) => pattern.test(body)))
    .map((signal) => signal.name);
}

/**
 * Score one review body against one corpus case.
 *
 * A seeded defect counts as detected only when the review names enough of the case's required
 * signals, states a material severity, and does not recommend an unqualified merge. A clean
 * control is a false positive when it gains a material severity, a `changes_required`, or loses
 * its safe-to-merge recommendation.
 */
export function scoreReview(caseDef, reviewText) {
  const signals = parseReviewSignals(reviewText);
  const matchedSignals = matchedSignalNames(caseDef, reviewText);
  const requiredSignals = caseDef.minSignals ?? (caseDef.signals ?? []).length;

  if (caseDef.kind === "clean") {
    const falsePositive = signals.materialSeverity || signals.changesRequired || !signals.safeToMerge;
    return {
      id: caseDef.id,
      kind: "clean",
      detected: false,
      falsePositive,
      matchedSignals,
      signals,
      reasons: falsePositive
        ? [
            `invented a material verdict on a clean control (severity=${signals.materialSeverity}, changes_required=${signals.changesRequired}, recommendation="${signals.recommendation}")`,
          ]
        : ["no material finding invented"],
    };
  }

  const detected = matchedSignals.length >= requiredSignals && signals.materialSeverity && !signals.safeToMerge;
  const reasons = [];
  if (matchedSignals.length < requiredSignals) {
    reasons.push(`matched ${matchedSignals.length}/${requiredSignals} required signals`);
  }
  if (!signals.materialSeverity) reasons.push("no BLOCKER/HIGH severity reported");
  if (signals.safeToMerge) reasons.push("recommended an unqualified merge");

  return {
    id: caseDef.id,
    kind: "defect",
    detected,
    falsePositive: false,
    matchedSignals,
    signals,
    reasons: detected ? ["material defect reported with a blocking verdict"] : reasons,
  };
}

// Replay entry point for a live canary run:
//   node scripts/pr-agent/evals/score-review.mjs <case-id> <review-body-file>
// Exits 0 when the case expectation is met, 1 otherwise, so the same command works in CI.
async function runCli() {
  const { CASES_BY_ID } = await import("./cases.mjs");
  const [caseId, reviewPath] = process.argv.slice(2);
  const caseDef = CASES_BY_ID[caseId];
  if (!caseDef) {
    console.error(`unknown case: ${caseId}\nknown cases: ${Object.keys(CASES_BY_ID).join(", ")}`);
    process.exit(1);
  }
  if (!reviewPath) {
    console.error("usage: score-review.mjs <case-id> <review-body-file>");
    process.exit(1);
  }

  const { readFileSync } = await import("node:fs");
  const result = scoreReview(caseDef, readFileSync(reviewPath, "utf8"));
  const verdict = caseDef.kind === "clean" ? !result.falsePositive : result.detected;
  process.stdout.write(`case=${result.id} kind=${result.kind} verdict=${verdict ? "PASS" : "FAIL"}\n`);
  process.stdout.write(`matched_signals=${JSON.stringify(result.matchedSignals)}\n`);
  process.stdout.write(`reasons=${JSON.stringify(result.reasons)}\n`);
  process.exit(verdict ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
