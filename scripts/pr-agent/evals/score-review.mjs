// SAN-1312 · MDE-PR-REVIEW-001
//
// Deterministic scorer for PR-Agent review output.
//
// It does not call a model. It scores a supplied review body against a case expectation, so the
// same input always yields the same verdict and the golden cases stay reproducible from Git.
//
// Scoring is deliberately finding-level. A review is not a bag of words: materiality, severity,
// status, and the evidence for a defect must come from ONE finding. Matching a validator name in
// one finding, a malformed example in another, and "HIGH" from the risk summary would otherwise
// certify a fake PASS — the exact failure mode this harness exists to catch.
//
// The model-behaviour question ("does the reviewer now find this defect?") is answered by running
// the real workflow on a canary PR and capturing its output — see `scripts/pr-agent/evals/README.md`.

import { pathToFileURL } from "node:url";

/** Severities that make an individual finding merge-blocking. */
export const MATERIAL_SEVERITIES = ["BLOCKER", "HIGH"];

/** PR-Agent's persistent finding state marker: machine-readable, per-finding, and stable. */
const FINDING_STATE_RE = /<!--\s*pr-agent-review-state:v1\s*([\s\S]*?)-->/;

/** Review comments this harness can score. Either marker means PR-Agent published a review. */
export const REVIEW_MARKERS = ["<!-- pr-agent:review:full -->", "<!-- pr-agent:review:incremental -->"];

function firstLine(text) {
  const line = text
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  return (line ?? "").replace(/^\*\*|\*\*$/g, "").replace(/^#+\s*/, "").slice(0, 120);
}

/**
 * Turn a raw finding body into a scored unit. Severity and status are read only from an explicit
 * label inside THIS finding, never from the review's risk summary or another finding.
 */
function toFinding(rawBody, meta = {}) {
  const body = String(rawBody ?? "").trim();
  return {
    title: firstLine(body),
    body,
    severity:
      /\bseverity\s*[:=]\s*["'`*]*\s*(BLOCKER|HIGH|MEDIUM|LOW)\b/i.exec(body)?.[1]?.toUpperCase() ??
      null,
    status: /\b(changes_required|advisory)\b/i.exec(body)?.[1]?.toLowerCase() ?? null,
    verification:
      /\b(NEEDS VERIFICATION|VERIFIED)\b/i.exec(body)?.[1]?.toUpperCase() ?? null,
    hasEvidence: /\bevidence\s*:/i.test(body),
    hasFailureScenario: /\bfailure scenario\s*:/i.test(body),
    state: String(meta.state ?? "").toUpperCase() || null,
    path: meta.path ?? null,
    source: meta.source ?? "unknown",
  };
}

/** Rendered `<details>` findings, excluding the agent-run-details block. */
function renderedFindings(body) {
  const found = [];
  for (const match of body.matchAll(/<details>[\s\S]*?<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi)) {
    const summary = match[1];
    if (/agent run details/i.test(summary)) continue;
    // Only treat it as a finding when it carries a real title, not an empty summary.
    const titleSource = summary.replace(/<[^>]+>/g, " ").trim();
    if (titleSource.length === 0) continue;
    found.push(toFinding(`${titleSource}\n${match[2]}`, { source: "rendered" }));
  }
  return found;
}

/** Labelled blocks, split on the `Severity:` label MDE's review contract requires per finding. */
function labelledFindings(body) {
  const starts = [...body.matchAll(/^[ \t>*-]*(?:\*\*)?severity(?:\*\*)?\s*[:=]/gim)].map(
    (match) => match.index,
  );
  if (starts.length === 0) return [];
  return starts.map((start, index) =>
    toFinding(body.slice(start, starts[index + 1] ?? body.length), { source: "labelled" }),
  );
}

/**
 * Extract the findings a review asserted. Preference order:
 *   1. the persistent finding-state marker (authoritative, carries per-finding state);
 *   2. rendered `<details>` finding blocks;
 *   3. labelled blocks split on `Severity:`.
 * A review with no findings legitimately returns an empty list — that is the miss case.
 */
export function parseFindings(text) {
  const body = typeof text === "string" ? text : "";

  const marker = FINDING_STATE_RE.exec(body);
  if (marker) {
    let payload = null;
    try {
      payload = JSON.parse(marker[1].trim());
    } catch {
      payload = null;
    }
    if (payload && Array.isArray(payload.findings) && payload.findings.length > 0) {
      return {
        source: "state",
        stateParsed: true,
        runComplete: payload.last_run?.complete ?? null,
        runKind: payload.last_run?.kind ?? null,
        runHeadSha: payload.last_run?.head_sha ?? null,
        findings: payload.findings.map((entry) =>
          toFinding(entry.body, { state: entry.state, path: entry.path ?? null, source: "state" }),
        ),
      };
    }
    return {
      source: "state",
      stateParsed: true,
      runComplete: payload?.last_run?.complete ?? null,
      runKind: payload?.last_run?.kind ?? null,
      runHeadSha: payload?.last_run?.head_sha ?? null,
      findings: [],
    };
  }

  const rendered = renderedFindings(body);
  if (rendered.length > 0) {
    return { source: "rendered", stateParsed: false, runComplete: null, runKind: null, runHeadSha: null, findings: rendered };
  }
  const labelled = labelledFindings(body);
  return {
    source: labelled.length > 0 ? "labelled" : "none",
    stateParsed: false,
    runComplete: null,
    runKind: null,
    runHeadSha: null,
    findings: labelled,
  };
}

/** A finding asserts a merge-blocking defect only when it says so about itself. */
export function isMaterialFinding(finding) {
  if (finding.state === "RESOLVED") return false;
  if (finding.severity && MATERIAL_SEVERITIES.includes(finding.severity)) return true;
  return finding.status === "changes_required";
}

/**
 * Review-level signals. `risk` is reported for diagnostics only and is never used to infer that a
 * finding is material: a "Risk level: High" line with no finding is not a finding.
 */
export function parseReviewSignals(text) {
  const body = typeof text === "string" ? text : "";
  const recommendation =
    /Merge recommendation(?:\s*<\/strong>)?\s*:\s*([^<\n]+)/i.exec(body)?.[1]?.trim() ?? "";
  const risk = /Risk level(?:\s*<\/strong>)?\s*:\s*([^<\n]+)/i.exec(body)?.[1]?.trim() ?? "";
  const scoreRaw = /Score(?:\s*<\/strong>)?\s*:\s*(\d{1,3})/i.exec(body)?.[1];

  return {
    recommendation,
    risk,
    score: scoreRaw === undefined ? null : Number(scoreRaw),
    safeToMerge: /safe to merge/i.test(recommendation),
    changesRequired: /\bchanges_required\b/i.test(body),
  };
}

/** Match one finding body against one case contract. All evidence must come from this finding. */
export function matchCase(caseDef, finding) {
  const body = finding.body ?? "";
  const matchedSignals = (caseDef.signals ?? [])
    .filter((signal) => signal.any.some((pattern) => pattern.test(body)))
    .map((signal) => signal.name);
  const minSignals = caseDef.minSignals ?? (caseDef.signals ?? []).length;
  const missingMandatory = (caseDef.mandatorySignals ?? []).filter(
    (name) => !matchedSignals.includes(name),
  );
  const requiredExamples = caseDef.requiredExamples ?? [];
  const citedExamples = requiredExamples.filter((example) => body.includes(example));
  const missingExample = requiredExamples.length > 0 && citedExamples.length === 0;

  return {
    matchedSignals,
    missingMandatory,
    citedExamples,
    credits: matchedSignals.length >= minSignals && missingMandatory.length === 0 && !missingExample,
    missingExample,
  };
}

function blockingVerdict(signals, findings) {
  if (
    findings.some(
      (finding) =>
        finding.state !== "RESOLVED" &&
        (finding.status === "changes_required" ||
          (finding.severity && MATERIAL_SEVERITIES.includes(finding.severity))),
    )
  ) {
    return true;
  }
  return signals.recommendation !== "" && !signals.safeToMerge;
}

/**
 * Score one review body against one corpus case.
 *
 * Defect case: credited only when a SINGLE finding carries the case's mandatory signals, the
 * required literal malformed example, and enough boundary explanation — and the review blocks.
 *
 * Clean case: a false positive only when the reviewer asserted a MATERIAL finding about itself.
 * A conservative merge recommendation with no material finding is reported separately and is not
 * an invented defect.
 */
export function scoreReview(caseDef, reviewText) {
  const signals = parseReviewSignals(reviewText);
  const parsed = parseFindings(reviewText);
  const { findings } = parsed;
  const activeFindings = findings.filter((finding) => finding.state !== "RESOLVED");
  const blocking = blockingVerdict(signals, findings);
  const materialFindings = findings.filter(isMaterialFinding);

  const base = {
    id: caseDef.id,
    kind: caseDef.kind,
    findings,
    findingCount: findings.length,
    materialFindings: materialFindings.map((finding) => finding.title),
    findingSource: parsed.source,
    runComplete: parsed.runComplete,
    runHeadSha: parsed.runHeadSha,
    blockingVerdict: blocking,
    signals,
  };

  if (caseDef.kind === "clean") {
    const falsePositive = materialFindings.length > 0;
    return {
      ...base,
      detected: false,
      falsePositive,
      matchedSignals: [],
      citedExamples: [],
      reasons: falsePositive
        ? [`asserted a material finding on a clean control: ${base.materialFindings.join("; ")}`]
        : [
            findings.length === 0
              ? "no material finding invented"
              : `no material finding invented (${findings.length} non-material finding(s); recommendation="${signals.recommendation || "none"}")`,
          ],
    };
  }

  const scored = activeFindings.map((finding) => ({ finding, match: matchCase(caseDef, finding) }));
  const credited = scored.filter((entry) => entry.match.credits);
  const detected = credited.length > 0 && blocking;

  const reasons = [];
  if (credited.length === 0) {
    if (activeFindings.length === 0) {
      reasons.push("no finding was asserted");
    } else {
      const best = scored.reduce((left, right) =>
        right.match.matchedSignals.length > left.match.matchedSignals.length ? right : left,
      );
      reasons.push(
        `no single finding carried the case contract (best finding matched ${best.match.matchedSignals.length} signal(s): ${best.match.matchedSignals.join(", ") || "none"})`,
      );
      if (best.match.missingMandatory.length > 0) {
        reasons.push(`missing mandatory signal(s): ${best.match.missingMandatory.join(", ")}`);
      }
      if (best.match.missingExample) {
        reasons.push(
          `no literal malformed example cited (expected one of: ${(caseDef.requiredExamples ?? []).join(", ")})`,
        );
      }
    }
  }
  if (!blocking) reasons.push("review did not block the merge");

  return {
    ...base,
    detected,
    falsePositive: false,
    matchedSignals: credited.flatMap((entry) => entry.match.matchedSignals),
    citedExamples: credited.flatMap((entry) => entry.match.citedExamples),
    creditedFinding: credited[0]?.finding.title ?? null,
    detectionQuality: credited.some((entry) => isMaterialFinding(entry.finding)) ? "labelled" : "unlabelled",
    reasons: detected
      ? [
          `material defect reported by one finding${credited.some((entry) => isMaterialFinding(entry.finding)) ? "" : " (no per-finding Severity/Status label)"}`,
        ]
      : reasons,
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
  process.stdout.write(
    `findings=${result.findingCount} material=${JSON.stringify(result.materialFindings)} blocking=${result.blockingVerdict}\n`,
  );
  process.stdout.write(`matched_signals=${JSON.stringify(result.matchedSignals)}\n`);
  if (result.citedExamples?.length) {
    process.stdout.write(`cited_examples=${JSON.stringify(result.citedExamples)}\n`);
  }
  process.stdout.write(`reasons=${JSON.stringify(result.reasons)}\n`);
  process.exit(verdict ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
