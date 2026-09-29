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
// Global so every marker in the body can be counted, not just the first. A literal, not a
// constructed pattern: the source is fixed at module load and never comes from input.
const FINDING_STATE_RE = /<!--\s*pr-agent-review-state:v1\s*([\s\S]*?)-->/g;

/**
 * Drop fenced code blocks. Review bodies quote the code they reviewed, and that code is
 * PR-controlled, so a marker-shaped string inside a fence is quoted evidence — never the bot's own
 * appended state.
 *
 * ponytail: fence pairing is heuristic. Balanced fences cover every review seen so far (measured:
 * 0, 0, 4, 4 in the recorded fixtures), and the failure is graceful — an unbalanced fence leaves the
 * quoted marker visible, which the "more than one marker" rule below then rejects. The upgrade path
 * is the SAN-1332 step 6 envelope, which carries provenance explicitly and retires the guess.
 */
function withoutFencedCode(body) {
  return String(body ?? "").replace(/(?:```|~~~)[\s\S]*?(?:```|~~~)/g, "");
}

/** A state marker that exists but cannot be trusted. Never the same thing as "zero findings". */
function invalidState(reason) {
  return {
    source: "state",
    stateParsed: true,
    stateValid: false,
    stateError: reason,
    runComplete: null,
    runKind: null,
    runHeadSha: null,
    findings: [],
  };
}

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
 * Labelled fields are anchored to a line-leading `Label:` / `Label=`, never searched for as bare
 * words. A bare word search reads prose as a label: a finding that says "this claim is not VERIFIED"
 * would have parsed as `verification=VERIFIED`, which — now that VERIFIED gates materiality — would
 * make an explicitly unverified claim block a merge.
 */
const SEVERITY_LABEL_RE = /\bseverity\s*[:=]\s*["'`*]*\s*(BLOCKER|HIGH|MEDIUM|LOW)\b/i;
const STATUS_LABEL_RE = /(?:^|\n)[ \t]*(?:status|merge status)[ \t]*[:=][ \t]*["'`*]*[ \t]*([^\n]*)/i;
const VERIFICATION_LABEL_RE =
  /(?:^|\n)[ \t]*verification(?:[ \t]+state)?[ \t]*[:=][ \t]*["'`*]*[ \t]*([^\n]*)/i;

/** The declared status, or null when the finding does not declare one. */
function readStatus(body) {
  const raw = (STATUS_LABEL_RE.exec(body)?.[1] ?? "").trim();
  if (/^changes_required\b/i.test(raw)) return "changes_required";
  if (/^advisory\b/i.test(raw)) return "advisory";
  return null;
}

/**
 * The declared verification state. A verification label whose value cannot be read as VERIFIED is
 * NEEDS VERIFICATION, not null: a merge gate must fail closed on an ambiguous claim, and
 * "Verification state: NOT VERIFIED" must never be read as proof.
 */
function readVerification(body) {
  const match = VERIFICATION_LABEL_RE.exec(body);
  if (!match) return null;
  const raw = match[1].trim();
  if (/^needs verification\b/i.test(raw)) return "NEEDS VERIFICATION";
  if (/^verified\b/i.test(raw)) return "VERIFIED";
  return "NEEDS VERIFICATION";
}

/**
 * Turn a raw finding body into a scored unit. Every label is read only from an explicit, anchored
 * field inside THIS finding — never from the review's risk summary, another finding, or prose.
 */
function toFinding(rawBody, meta = {}) {
  const body = String(rawBody ?? "").trim();
  return {
    title: firstLine(body),
    body,
    severity: SEVERITY_LABEL_RE.exec(body)?.[1]?.toUpperCase() ?? null,
    status: readStatus(body),
    verification: readVerification(body),
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

  // Marker provenance (SAN-1332 step 2). The review body quotes PR-controlled diff content, so a PR
  // could otherwise smuggle a marker-shaped string into a fenced block and have it read as the
  // bot's own authoritative state — a false "zero findings". Strip quoted code first, then refuse
  // to choose between several markers instead of silently taking the first.
  const markers = [...withoutFencedCode(body).matchAll(FINDING_STATE_RE)];
  if (markers.length > 1) {
    return invalidState(
      `INVALID_FINDING_STATE: ${markers.length} state markers found where exactly one is expected`,
    );
  }
  const marker = markers[0];
  if (marker) {
    let payload = null;
    try {
      payload = JSON.parse(marker[1].trim());
    } catch (error) {
      return invalidState(
        `INVALID_FINDING_STATE: state marker is not valid JSON (${error instanceof Error ? error.message : error})`,
      );
    }
    if (!payload || !Array.isArray(payload.findings)) {
      return invalidState("INVALID_FINDING_STATE: state marker has no findings array");
    }
    // A structurally valid marker with an empty findings array is a legitimate clean review.
    return {
      source: "state",
      stateParsed: true,
      stateValid: true,
      stateError: null,
      runComplete: payload.last_run?.complete ?? null,
      runKind: payload.last_run?.kind ?? null,
      runHeadSha: payload.last_run?.head_sha ?? null,
      findings: payload.findings.map((entry) =>
        toFinding(entry.body, { state: entry.state, path: entry.path ?? null, source: "state" }),
      ),
    };
  }

  // A review can contain both shapes: rendered `<details>` findings, and labelled blocks when the
  // model emitted the structured sections. Merge them, de-duplicating a labelled block that is
  // already inside a rendered finding, so neither shape is silently dropped.
  const rendered = renderedFindings(body);
  const labelled = labelledFindings(body);
  const merged = [...rendered];
  for (const entry of labelled) {
    const key = entry.body.slice(0, 60);
    if (merged.some((existing) => existing.body.includes(key))) continue;
    merged.push(entry);
  }
  return {
    source: merged.length === 0 ? "none" : rendered.length > 0 ? "rendered" : "labelled",
    stateParsed: false,
    stateValid: true,
    stateError: null,
    runComplete: null,
    runKind: null,
    runHeadSha: null,
    findings: merged,
  };
}

/**
 * THE canonical blocking predicate (SAN-1332 step 1). A finding may assert a merge-blocking defect
 * only when its own labels support that, and an explicitly unverified framework/API claim may never
 * block a merge — that is the rule this task exists to enforce. `isMaterialFinding`, the clean-case
 * false-positive check, `blockingVerdict`, and `findingVerdict` all derive from this one function.
 *
 * The unlabelled branch is deliberate and narrow: the captured model output carries no severity,
 * status, or verification label at all, and refusing those outright would silently discard a real
 * detection. `detectionQuality: "unlabelled"` marks it so it is never mistaken for labelled proof.
 */
export function isMaterialFinding(finding) {
  if (finding.state === "RESOLVED") return false;
  if (finding.verification === "NEEDS VERIFICATION") return false;
  if (finding.verification === "VERIFIED") {
    return Boolean(
      finding.status === "changes_required" &&
        finding.severity &&
        MATERIAL_SEVERITIES.includes(finding.severity),
    );
  }
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
  if (findings.some((finding) => isMaterialFinding(finding))) return true;
  return signals.recommendation !== "" && !signals.safeToMerge;
}

/**
 * Did THIS finding carry a blocking verdict?
 *
 * A credited finding may only be scored as detected when its own verdict blocks. An unrelated
 * finding's HIGH severity must not supply the verdict for a different finding: otherwise one
 * strong finding anywhere in the review would launder a weak, unlabelled match into a PASS.
 *
 * When the finding labels itself non-material — including a finding whose only label is
 * `NEEDS VERIFICATION` — that is the end of it. When it carries no labels at all, the review's own
 * recommendation may stand in, and `detectionQuality` marks the result `unlabelled`.
 */
export function findingVerdict(finding, signals) {
  if (isMaterialFinding(finding)) return true;
  if (finding.severity || finding.status || finding.verification) return false;
  return signals.recommendation !== "" && !signals.safeToMerge;
}

/** Extract backticked fragments that look like code rather than prose or a literal value. */
export function quotedCodeFragments(finding) {
  const body = String(finding?.body ?? "");
  return [
    ...new Set(
      [...body.matchAll(/`([^`\n]{6,})`/g)]
        .map((match) => match[1].trim())
        .filter((fragment) => /[\\^$]|\(\?:|=>|\{\s*\d/.test(fragment)),
    ),
  ];
}

/**
 * Golden requirement: a finding's quoted code must exist in the exact changed source.
 *
 * Returns a diagnostic, not a verdict. A finding may legitimately quote a PROPOSED fix, which is
 * correctly absent from the source, so callers must treat `grounded === false` as "verify this
 * quote" rather than as a defect. It exists because the canary review quoted a regex the reviewed
 * file does not contain and reported it as the current implementation.
 */
export function checkGrounding(finding, sourceText) {
  const fragments = quotedCodeFragments(finding);
  const source = String(sourceText ?? "");
  const ungrounded = fragments.filter((fragment) => !source.includes(fragment));
  return {
    checked: fragments.length,
    fragments,
    ungrounded,
    grounded: fragments.length === 0 ? null : ungrounded.length === 0,
    reason:
      fragments.length === 0
        ? "finding quotes no code"
        : ungrounded.length === 0
          ? "every quoted code fragment appears in the reviewed source"
          : `${ungrounded.length} quoted fragment(s) do not appear in the reviewed source — verify before crediting`,
  };
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
export function scoreReview(caseDef, reviewText, { sourceText = null } = {}) {
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
    stateValid: parsed.stateValid,
    stateError: parsed.stateError,
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
  // The verdict must belong to the credited finding, not to some other finding in the review, and
  // an explicit safe-to-merge recommendation can never be overridden by a finding.
  const blockingCredited = credited.filter((entry) => findingVerdict(entry.finding, signals));
  const detected = blockingCredited.length > 0 && !signals.safeToMerge;

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
  } else {
    reasons.push("the finding that carried the case contract did not block on its own verdict");
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
    // Grounding is checked for EVERY finding, not only the credited one: the case this exists for
    // is a review whose findings quote code the reviewed file does not contain, which is also a
    // review where nothing gets credited.
    grounding: sourceText
      ? activeFindings
          .map((entry) => ({ finding: entry.title, ...checkGrounding(entry, sourceText) }))
          .filter((entry) => entry.checked > 0)
      : null,
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
  const [caseId, reviewPath, ...sourcePaths] = process.argv.slice(2);
  const caseDef = CASES_BY_ID[caseId];
  if (!caseDef) {
    console.error(`unknown case: ${caseId}\nknown cases: ${Object.keys(CASES_BY_ID).join(", ")}`);
    process.exit(1);
  }
  if (!reviewPath) {
    console.error(
      "usage: score-review.mjs <case-id> <review-body-file> [source-file ...]\n" +
        "  source-file overrides the case's anchor file. Pass EVERY file the review actually read\n" +
        "  (a PR's changed files, not just one) so a finding quoting a second changed file is not\n" +
        "  reported as ungrounded.",
    );
    process.exit(1);
  }

  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const resolvedSources = sourcePaths.length > 0 ? sourcePaths : [caseDef.sourceFile].filter(Boolean);
  const sourceText =
    resolvedSources.length > 0
      ? resolvedSources.map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n")
      : null;
  const result = scoreReview(caseDef, readFileSync(reviewPath, "utf8"), { sourceText });
  // A corrupted marker must never score as a clean review. Report the state failure as its own
  // verdict rather than letting zero findings pass a clean case.
  if (result.stateValid === false) {
    process.stdout.write(`case=${result.id} kind=${result.kind} verdict=INVALID_FINDING_STATE\n`);
    process.stdout.write(`state_error=${result.stateError}\n`);
    process.exit(1);
  }
  const verdict = caseDef.kind === "clean" ? !result.falsePositive : result.detected;
  process.stdout.write(`case=${result.id} kind=${result.kind} verdict=${verdict ? "PASS" : "FAIL"}\n`);
  process.stdout.write(
    `findings=${result.findingCount} material=${JSON.stringify(result.materialFindings)} blocking=${result.blockingVerdict}\n`,
  );
  process.stdout.write(`matched_signals=${JSON.stringify(result.matchedSignals)}\n`);
  if (result.citedExamples?.length) {
    process.stdout.write(`cited_examples=${JSON.stringify(result.citedExamples)}\n`);
  }
  if (result.grounding) {
    const ungrounded = result.grounding.filter((entry) => entry.grounded === false);
    process.stdout.write(
      `grounding=checked ${result.grounding.length} finding(s) quoting code; ungrounded=${ungrounded.length}\n`,
    );
    for (const entry of ungrounded) {
      process.stdout.write(`  UNGROUNDED ${JSON.stringify(entry.ungrounded)}\n`);
    }
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
