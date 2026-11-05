// SAN-1609: bounded, advisory coverage for the existing PR Agent. No second LLM engine.
import { createHash } from "node:crypto";
import { parseReviewEnvelope, excludedFilesFromReview, clippedPatchesFromReview, coverageFailure } from "./review-policy.mjs";

export const COVERAGE_MARKER = "<!-- mde-smart-review-coverage:v1 -->";
export const TARGETED_RECOVERY_MARKER = "<!-- mde-pr-agent-targeted-recovery:v1 -->";

/** Retire stale targeted results without making another provider call.
 * A bot comment's fixed header carries the exact base/head. Never search
 * free-form model findings for revision identity or trust a human comment.
 */
export function staleTargetedRecoveryComments(comments, baseSha, headSha, recoveryMarker) {
  if (!Array.isArray(comments) ||
      typeof recoveryMarker !== "string" || !recoveryMarker ||
      !/^[a-f0-9]{40}$/.test(baseSha ?? "") ||
      !/^[a-f0-9]{40}$/.test(headSha ?? "")) return [];
  const expected = "**Base/head:** " + baseSha + " / " + headSha;
  return comments.filter((comment) => {
    if (comment?.user?.login !== "github-actions[bot]" ||
        typeof comment.body !== "string" ||
        !comment.body.startsWith(recoveryMarker + "\n") ||
        comment.body.startsWith(recoveryMarker +
          "\n## Targeted PR-Agent follow-up — OUTDATED")) return false;
    // The source digest starts immediately after the bot-authored revision
    // header. Never accept a model-written Base/head from the findings below.
    // This follows the format boundary rather than a fixed line/byte cutoff.
    const headerEnd = comment.body.indexOf("\n**Diff SHA-256:** ");
    if (headerEnd < 0) return true; // Malformed bot output cannot claim a current head.
    const revisionLines = comment.body.slice(0, headerEnd).split("\n")
      .filter((line) => line.startsWith("**Base/head:** "));
    return revisionLines.length !== 1 || revisionLines[0] !== expected;
  });
}

export const POLICY_VERSION = "mde-smart-v1";
const generated = new Set([
  "docs/progress/data/linear-data.json",
  "docs/progress/data/pr-data.json",
  "docs/progress/data/pr-files.json",
]);
const ignore = /^(?:package-lock\.json|graphify-out\/|\.agents\/)|(?:^|\/)node_modules\/|\.db(?:-shm|-wal)?$/;
const critical = /(?:^|\/)(?:auth|security|permissions?|payments?|checkout|bookings?|tickets?|stripe|webhooks?|rls|policies|migrations?|secrets?|admin)(?:[./-]|$)|^\.github\/workflows\/|^supabase\/migrations\//i;
const src = /^(?:src\/|supabase\/|scripts\/|app\/|pages\/|e2e\/|middleware\.)/;
const test = /(?:^|\/)(?:__tests__|test|tests|e2e)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;
const docs = /^(?:docs\/|README|CHANGELOG)|\.(?:md|mdx)$/i;
const order = { critical: 0, high: 1, normal: 2, low: 3, generated: 4, excluded: 5, unknown: 6 };
const digest = (value) => createHash("sha256").update(value).digest("hex");

export function classifyFile(file) {
  const path = file?.filename;
  if (typeof path !== "string" || !path) return { path: String(path ?? ""), category: "unknown", priority: 6, patchDigest: null, patchBytes: null };
  // Explicit ignore rules always win, even for an ignored security-named file.
  // Narrative Markdown remains documentation, not a critical security source file.
  const narrative = docs.test(path) && /\.(?:md|mdx)$/i.test(path);
  const category = ignore.test(path) ? "excluded" : generated.has(path) ? "generated" :
    narrative ? "low" : critical.test(path) ? "critical" :
    test.test(path) ? "normal" : src.test(path) || /\.(?:tsx?|jsx?|py|go|rs|sql|ya?ml)$/.test(path) ? "high" : docs.test(path) ? "low" : "unknown";
  return {
    path, category, priority: order[category], status: file.status ?? "unknown",
    previousPath: typeof file.previous_filename === "string" ? file.previous_filename : null,
    patchDigest: typeof file.patch === "string" ? digest(file.patch) : null,
    patchBytes: typeof file.patch === "string" ? Buffer.byteLength(file.patch) : null,
  };
}

export function classifyFiles(files, expectedCount) {
  const list = (files ?? []).map(classifyFile).sort((a, b) => a.priority - b.priority || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files: list, unknownInventory: !Number.isSafeInteger(expectedCount) || expectedCount !== list.length || list.length >= 3000 };
}

// Specific, observed MDE snapshot formats; no invented generic JSON schema.
export function validateGeneratedJson(path, text) {
  if (!generated.has(path)) return { status: "unknown", reason: "no verified generated-data contract" };
  if (typeof text !== "string") return { status: "unknown", reason: "content unavailable" };
  let data;
  try { data = JSON.parse(text); } catch { return { status: "failed", reason: "invalid JSON" }; }
  if (!data || Array.isArray(data) || typeof data !== "object") return { status: "failed", reason: "expected object" };
  if (path.endsWith("linear-data.json")) {
    if (!data.project?.id || !Array.isArray(data.issues) || data.issue_count !== data.issues.length) return { status: "failed", reason: "missing project or incorrect issue count" };
    const ids = data.issues.map((row) => row?.identifier);
    if (ids.some((id) => typeof id !== "string" || !/^SAN-\d+$/.test(id)) || new Set(ids).size !== ids.length) return { status: "failed", reason: "invalid/duplicate issue identifiers" };
  } else if (path.endsWith("pr-data.json")) {
    if (typeof data.repo !== "string" || !Array.isArray(data.prs) || data.totals?.open_prs !== data.prs.length) return { status: "failed", reason: "missing PR data or incorrect PR count" };
    const ids = data.prs.map((row) => row?.number);
    if (ids.some((id) => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) return { status: "failed", reason: "invalid/duplicate PR identifiers" };
  } else {
    if (!data.prs || Array.isArray(data.prs) || typeof data.prs !== "object") return { status: "failed", reason: "invalid PR file mapping" };
    for (const [id, row] of Object.entries(data.prs)) {
      if (!/^\d+$/.test(id) || !Array.isArray(row?.files) || row.files.some((f) => typeof f !== "string" || !f.trim()) ||
          row.files.length !== new Set(row.files).size || !Number.isSafeInteger(row.additions) || row.additions < 0 ||
          !Number.isSafeInteger(row.deletions) || row.deletions < 0) return { status: "failed", reason: `invalid/duplicate files for PR ${id}` };
    }
  }
  return { status: "validated", reason: "known structural/uniqueness checks; snapshot freshness not proved" };
}

export function validateSnapshotReferences(prData, prFiles) {
  if (typeof prData !== "string" || typeof prFiles !== "string") return { status: "unknown", reason: "missing exact-head snapshot" };
  try {
    const a = JSON.parse(prData)?.prs?.map((row) => String(row.number));
    const b = Object.keys(JSON.parse(prFiles)?.prs ?? {});
    if (!Array.isArray(a) || a.length !== b.length || a.some((x) => !b.includes(x))) return { status: "failed", reason: "PR IDs disagree between snapshots" };
    return { status: "validated", reason: "exact-head PR numbers agree across snapshots" };
  } catch { return { status: "failed", reason: "invalid cross-file JSON" }; }
}

/**
 * A failed reusable workflow can still have published a real partial review.
 * This predicate only changes advisory reporting; the required strict check
 * stays red. Reuse the canonical parser, not a second inline coverage engine.
 */
export function hasPublishedPartialReview({ body, baseSha, headSha, reviewJobResult }) {
  if (reviewJobResult === "success") return false;
  const env = parseReviewEnvelope(body ?? "");
  if (!env.valid || env.baseSha !== baseSha?.toLowerCase() ||
      env.headSha !== headSha?.toLowerCase() ||
      env.type !== "canonical" || env.command !== "/review" ||
      !env.body.includes("<!-- pr-agent:review:full -->")) return false;
  const state = [...env.body.matchAll(/(?:^|\n)<!-- pr-agent-review-state:v1\n([\s\S]*?)\n-->/g)];
  if (state.length !== 1) return false;
  let saved;
  try { saved = JSON.parse(state[0][1]); } catch { return false; }
  if (saved?.schema_version !== 1 || !Array.isArray(saved.findings) ||
      saved.last_run?.head_sha?.toLowerCase() !== headSha.toLowerCase() ||
      saved.last_run?.complete !== false ||
      !Array.isArray(saved.last_run?.excluded_files) ||
      saved.last_run.excluded_files.length < 1) return false;
  return coverageFailure(env.body, headSha)?.code === "INCOMPLETE_REVIEW" &&
    reviewCoverageFromComment(body, baseSha, headSha).status === "partial";
}

export function reviewCoverageFromComment(body, baseSha, headSha) {
  const env = parseReviewEnvelope(body ?? "");
  if (!env.valid || env.baseSha !== baseSha.toLowerCase() || env.headSha !== headSha.toLowerCase()) return { status: "unknown", excluded: [], reason: "missing current base/head envelope" };
  const warnings = excludedFilesFromReview(env.body);
  const clippedEvidence = clippedPatchesFromReview(env.body);
  const clipped = clippedEvidence.files;
  // Reuse the exact same fail-closed chunk/clipping checks as the strict verifier.
  // Successful model calls alone do not prove that every chunk completed.
  const failure = coverageFailure(env.body, headSha);
  const incomplete = failure?.code === "INCOMPLETE_REVIEW";
  // A state rejected by the canonical verifier can never prove advisory 100%.
  if (failure && !incomplete) return {
    status: failure.code === "STALE_HEAD" ? "unknown" : "failed", excluded: warnings, clipped,
    reason: failure.code === "STALE_HEAD" ? "stale persisted review head" :
      `strict review state rejected (${failure.code})`,
  };
  const markers = [...env.body.matchAll(/(?:^|\n)<!-- pr-agent-review-state:v1\n([\s\S]*?)\n-->/g)];
  if (markers.length > 1) return { status: "failed", excluded: warnings, clipped, reason: "ambiguous persistent review state" };
  if (!markers.length) return { status: warnings.length || clippedEvidence.present || incomplete ? "partial" : "unknown",
    excluded: warnings, clipped, reason: clippedEvidence.present ? "partially clipped input patch" :
      incomplete ? failure.reason : warnings.length ? "excluded-file footer" : "no persistent state" };
  try {
    const saved = JSON.parse(markers[0][1]);
    const state = saved?.last_run;
    if (state?.head_sha?.toLowerCase() !== headSha.toLowerCase() || !Array.isArray(state?.excluded_files) || typeof state.complete !== "boolean") return { status: "unknown", excluded: warnings, clipped, reason: "stale/malformed review-state fields" };
    const excluded = [...new Set([...warnings, ...state.excluded_files])];
    // Only a COMPLETE persisted run that accounts for ALL named clipped paths
    // can prove other patches were reviewed. Failed chunks, unknown clipped
    // names, omitted files or malformed state cannot supply that evidence.
    const reviewedRemainder = state.complete && excluded.length === 0 &&
      saved.schema_version === 1 && Array.isArray(saved.findings) &&
      clippedEvidence.present && clipped.length > 0 &&
      clippedEvidence.unlistedCount === 0 && new Set(clipped).size === clipped.length &&
      failure?.reason === "PR-Agent reported patches clipped before analysis (partial input coverage)";
    return { status: state.complete && !excluded.length && !clippedEvidence.present && !incomplete ? "complete" : "partial",
      excluded, clipped, reviewedRemainder,
      reason: clippedEvidence.present ? "partially clipped input patch" :
        incomplete ? failure.reason : "persistent PR Agent state" };
  } catch { return { status: "failed", excluded: warnings, clipped, reason: "invalid review-state JSON" }; }
}

/**
 * Only data published in a current-SHA PR Agent run-details block counts.
 * Missing provider pricing is unknown, not a free ($0) review.
 */
// Provider-generated model labels are untrusted comment text. Validate with
// bounded character comparisons rather than an ambiguous repeating regex.
function isSafeModelToken(value) {
  if (!value || value.length > 128) return false;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) ||
        (c >= 97 && c <= 122) || c === 45 || c === 46 ||
        c === 47 || c === 95) continue;
    return false;
  }
  return true;
}

export function parseReviewUsage(body, baseSha, headSha) {
  const empty = { model: null, inputTokens: null, outputTokens: null,
    seconds: null, calls: null, estimatedUsd: null, costLabel: null };
  const envelope = parseReviewEnvelope(body ?? "");
  if (!envelope.valid || envelope.baseSha !== baseSha.toLowerCase() || envelope.headSha !== headSha.toLowerCase()) return empty;

  // PR-Agent v0.49.0 show_run_details() renders "<details> <summary>"
  // (with a space). Support both that official spelling and the compact
  // spelling; require the exact section title rather than parsing PR prose.
  const section = envelope.body.match(/<details>\s*<summary><strong>[^<]*Agent run details<\/strong><\/summary>([\s\S]*?)<\/details>/i);
  if (!section) return empty;
  const bodyText = section[1];
  const modelRaw = bodyText.match(/(?:^|\n)- Models?: ([^\r\n]+)/)?.[1]?.trim();
  // A fallback section can have multiple models. Do not turn provider text
  // into arbitrary Markdown or silently report only the primary model.
  const bounded = modelRaw && modelRaw.length <= 512 ? modelRaw : null;
  const ending = bounded?.endsWith(" (includes fallback)") ? " (includes fallback)" :
    bounded?.endsWith(" (fallback)") ? " (fallback)" : "";
  const names = bounded ? bounded.slice(0, bounded.length - ending.length).split(", ") : [];
  const model = names.length > 0 && names.length <= 6 && names.every(isSafeModelToken) ? bounded : null;
  const tokens = bodyText.match(/(?:^|\n)- Tokens: ([\d,]+) in \/ ([\d,]+) out \/ ([\d,]+) total(?:\r?\n|$)/);
  const seconds = bodyText.match(/(?:^|\n)- Time cost: (\d+(?:\.\d+)?)s(?:\r?\n|$)/)?.[1];
  const calls = bodyText.match(/(?:^|\n)- AI calls: (\d+)(?:\r?\n|$)/)?.[1];
  const safe = (x) => x === undefined ? null : Number.isSafeInteger(Number(x.replaceAll(",", ""))) &&
    Number(x.replaceAll(",", "")) >= 0 && Number(x.replaceAll(",", "")) < 1e10 ? Number(x.replaceAll(",", "")) : null;
  const inputTokens = tokens ? safe(tokens[1]) : null, outputTokens = tokens ? safe(tokens[2]) : null;
  const total = tokens ? safe(tokens[3]) : null;

  // Preserve the pinned provider's "partial" and "<$0.01" qualifiers.
  // Omitted or unavailable prices remain UNKNOWN, never a fabricated $0.
  const costRaw = bodyText.match(/(?:^|\n)- Estimated API cost: ([^\r\n]+)(?:\r?\n|$)/)?.[1]?.trim();
  let estimatedUsd = null, costLabel = null;
  if (costRaw === "<$0.01 USD") {
    costLabel = costRaw;
  } else if (costRaw) {
    const price = costRaw.match(/^\$([\d,]+(?:\.\d+)?) USD(?: \(partial: (\d+) of (\d+) successful calls priced\))?$/);
    const amount = price ? Number(price[1].replaceAll(",", "")) : null;
    const priced = price?.[2] ? safe(price[2]) : null, successful = price?.[3] ? safe(price[3]) : null;
    const validPartial = price?.[2] === undefined || (priced !== null && successful !== null && priced > 0 && priced <= successful);
    if (amount !== null && Number.isFinite(amount) && amount >= 0 && amount < 1e7 && validPartial) {
      estimatedUsd = amount;
      costLabel = costRaw;
    }
  }
  return { model,
    inputTokens: total !== null && inputTokens !== null && outputTokens !== null && inputTokens + outputTokens === total ? inputTokens : null,
    outputTokens: total !== null && inputTokens !== null && outputTokens !== null && inputTokens + outputTokens === total ? outputTokens : null,
    seconds: seconds !== undefined && Number.isFinite(Number(seconds)) && Number(seconds) >= 0 && Number(seconds) < 86400 ? Number(seconds) : null,
    calls: calls === undefined ? null : safe(calls),
    estimatedUsd, costLabel };
}

// Render the exact path safely in a Markdown table. JSON makes embedded CR/LF
// visible as escapes, and an HTML code element avoids altering literal backticks.
const quotePath = (path) => "<code>" + JSON.stringify(String(path))
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</code>";
const normalizedPath = (path) => typeof path === "string" ? path.replace(/^(?:\.\/)+/, "").trimEnd() : "";

export function buildCoverageReport({ repo, number, baseSha, headSha, files, expectedCount, reviewBody = "", reviewJobResult = "success", validations = {} }) {
  const inventory = classifyFiles(files, expectedCount);
  const ai = reviewJobResult === "success" ? reviewCoverageFromComment(reviewBody, baseSha, headSha) : { status: "failed", excluded: [], reason: `review job ${reviewJobResult}` };
  const excluded = new Set(ai.excluded.map(normalizedPath));
  const clipped = new Set((ai.clipped ?? []).map(normalizedPath));
  // Missing or renamed paths in provider claims are not proof of unrelated
  // files having been reviewed. Never trust an incomplete GitHub inventory.
  const matchedClipped = !inventory.unknownInventory && clipped.size > 0 &&
    [...clipped].every((path) => inventory.files.some((file) =>
      normalizedPath(file.path) === path || normalizedPath(file.previousPath) === path));
  const reviewedRemainder = ai.reviewedRemainder === true && matchedClipped;
  const details = inventory.files.map((file) => {
    const validation = validations[file.path] ?? { status: "unknown", reason: "no deterministic proof" };
    const coverage = ["excluded", "generated"].includes(file.category) ? "policy-excluded" :
      clipped.has(normalizedPath(file.path)) || (file.previousPath && clipped.has(normalizedPath(file.previousPath))) ? "partially-reviewed" :
      excluded.has(normalizedPath(file.path)) || (file.previousPath && excluded.has(normalizedPath(file.previousPath))) ? "unreviewed" :
      ai.status === "failed" ? "failed" :
      (ai.status === "complete" || reviewedRemainder) && file.patchDigest ? "ai-reviewed" : "unknown";
    return { ...file, coverage, validation };
  });
  const counts = {
    total: details.length,
    aiReviewed: details.filter((f) => f.coverage === "ai-reviewed").length,
    deterministicValidated: details.filter((f) => f.validation.status === "validated").length,
    policyExcluded: details.filter((f) => f.coverage === "policy-excluded").length,
    uncovered: details.filter((f) => f.coverage === "unreviewed").length,
    partiallyReviewed: details.filter((f) => f.coverage === "partially-reviewed").length,
    unknown: details.filter((f) => f.coverage === "unknown").length,
    failed: details.filter((f) => f.coverage === "failed" || f.validation.status === "failed").length,
  };
  const generatedUnvalidated = details.some((f) => f.category === "generated" && f.validation.status !== "validated");
  // A missing GitHub patch is not evidence of review, even if the AI
  // provider says the overall run was complete. Preserve PARTIAL for
  // explicitly incomplete runs, but downgrade an otherwise COMPLETE
  // assertion to UNKNOWN until the missing patch can be accounted for.
  const unprovenPatch = ai.status === "complete" && details.some(
    (file) => file.coverage === "unknown" && file.patchDigest === null &&
      !["excluded", "generated"].includes(file.category),
  );
  const status = counts.failed || ai.status === "failed" ? "FAILED" :
    inventory.unknownInventory || ai.status === "unknown" || generatedUnvalidated || unprovenPatch ? "UNKNOWN" :
      counts.uncovered || counts.partiallyReviewed || counts.unknown || ai.status === "partial" ? "PARTIAL" : "COMPLETE";
  const pending = details.filter((f) => ["unknown", "unreviewed", "partially-reviewed", "failed"].includes(f.coverage) && !["excluded", "generated"].includes(f.category));
  const criticalPending = pending.filter((f) => ["critical", "high"].includes(f.category));
  const verified = details.filter((f) => f.coverage === "ai-reviewed" || f.validation.status === "validated").length;
  // An empty inventory is not evidence of perfect coverage.
  // Never round partial proof to 100% (199/200 rounds to 100 otherwise).
  const percentVerified = details.length ? (verified === details.length && !inventory.unknownInventory && ai.status === "complete" ? 100 : Math.min(99, Math.round(100 * verified / details.length))) : null;
  const verifiedLabel = percentVerified === null ? "unknown (no changed files)" : percentVerified + "%";
  const usage = parseReviewUsage(reviewBody, baseSha, headSha);
  const plan = planFollowupBatches({ details }, { baseSha, headSha, maxBatches: 6, maxPatchBytes: 35000 });
  const plannedFiles = plan.batches.reduce((total, batch) => total + batch.paths.length, 0);
  const rows = details.slice(0, 70).map((f) => `| ${quotePath(f.path)} | ${f.category} | ${f.coverage} | ${f.validation.status} |`);
  const body = [COVERAGE_MARKER, "## MDE smart review coverage (advisory)", "",
    `**PR:** ${repo}#${number} · **Base:** ${quotePath(baseSha)} · **Head:** ${quotePath(headSha)}`,
    `**${status}** — ${ai.reason}. AI review and deterministic validation are independent evidence.`, "",
    `Changed: ${counts.total} · AI reviewed: ${counts.aiReviewed} · Validated: ${counts.deterministicValidated} · Policy-excluded: ${counts.policyExcluded} · Unreviewed: ${counts.uncovered} · Partially reviewed: ${counts.partiallyReviewed} · Unknown: ${counts.unknown} · Failed: ${counts.failed}.`, "",
    "| File | Classification | AI coverage | Deterministic validation |", "| --- | --- | --- | --- |", ...rows,
    ...(details.length > rows.length ? [`| … | ${details.length - rows.length} additional files | See GitHub diff | — |`] : []), "",
    criticalPending.length ? `**Needs independent human attention:** ${criticalPending.slice(0, 10).map((f) => quotePath(f.path)).join(", ")}` : "No uncovered critical/high-risk files established.", "",
    pending.length ? `**Follow-up:** ${pending.length} file(s) lack proven AI coverage. Plan a bounded file-specific review; this comment does not execute or certify one.` : "No actionable uncovered files identified from the available evidence.",
    "**Quality (grounded):** " + verified + "/" + details.length + " files have confirmed AI or deterministic proof (" + verifiedLabel + "); " + criticalPending.length + " critical/high-risk files still need human attention.",
    "**Model usage (reported):** " + (usage.model ?? "unknown") + " · Calls: " + (usage.calls ?? "unknown") + " · Input/output tokens: " + (usage.inputTokens ?? "unknown") + "/" + (usage.outputTokens ?? "unknown") + " · Processing time: " + (usage.seconds === null ? "unknown" : usage.seconds + "s") + " · Estimated API cost: " + (usage.costLabel ?? "unknown (not $0)") + ".",
    "**Follow-up budget:** " + plan.batches.length + "/6 risk-ordered patch batches plan " + plannedFiles + " files, capped at 35,000 patch bytes per batch; " + plan.deferred.length + " files deferred. Planning only: no extra model calls executed or certified.",
    ...(plan.deferred.length ? ["**Deferred files needing manual or line-bounded review:** " +
      plan.deferred.slice(0, 8).map((f) => quotePath(f.path) + " (" + f.reason + ")").join(", ") +
      (plan.deferred.length > 8 ? ` (+${plan.deferred.length - 8} more)` : "")] : []),
    ...(inventory.unknownInventory ? ["", "**Inventory UNKNOWN:** GitHub's changed-file listing is incomplete or exceeds its 3,000-file limit."] : []),
    "", "Required Floor, branch protection and human review remain authoritative. Missing AI coverage does not add a new docs-only merge gate."].join("\n");
  return { status, counts, details, criticalPending, usage,
    quality: { verifiedFiles: verified, percentVerified, highRiskPending: criticalPending.length },
    plan, body };
}

/** @param {ReturnType<typeof buildCoverageReport>} report
 * @param {{baseSha?:string, headSha?:string, modelConfigDigest?:string, policyVersion?:string, maxBatches?:number, maxPatchBytes?:number, completed?:Array<{key:string,complete:boolean,baseSha:string,headSha:string,modelConfigDigest:string,policyVersion:string}>}} [opts]
 */
export function planFollowupBatches(report, { baseSha, headSha, modelConfigDigest = "unverified", policyVersion = POLICY_VERSION, maxBatches = 6, maxPatchBytes = 35000, completed = [] } = {}) {
  // Invalid limits must not silently disable budget checks (NaN, Infinity,
  // fractional, negative or string inputs all fail closed to zero capacity).
  const safeBatchLimit = Number.isSafeInteger(maxBatches) && maxBatches >= 0 ? maxBatches : 0;
  const safePatchLimit = Number.isSafeInteger(maxPatchBytes) && maxPatchBytes >= 0 ? maxPatchBytes : 0;
  const done = new Set(completed.filter((c) => c.complete && c.baseSha === baseSha && c.headSha === headSha && c.modelConfigDigest === modelConfigDigest && c.policyVersion === policyVersion).map((c) => c.key));
  const batches = []; const deferred = [];
  let paths = [], patchDigests = [], totalBytes = 0;
  const flush = () => {
    if (!paths.length) return;
    const key = digest([baseSha, headSha, modelConfigDigest, policyVersion,
      ...paths.flatMap((path, i) => [path, patchDigests[i]])].join("\\0"));
    if (!done.has(key)) {
      if (batches.length < safeBatchLimit) {
        batches.push({ key, baseSha, headSha, modelConfigDigest, policyVersion, paths, patchBytes: totalBytes });
      } else {
        deferred.push(...paths.map((path) => ({ path, reason: "bounded patch/call budget" })));
      }
    }
    paths = []; patchDigests = []; totalBytes = 0;
  };
  for (const file of report.details.filter((f) => ["unknown", "unreviewed", "partially-reviewed", "failed"].includes(f.coverage) && !["excluded", "generated"].includes(f.category))) {
    if (!baseSha || !headSha || !file.patchDigest || !Number.isSafeInteger(file.patchBytes)) {
      deferred.push({ path: file.path, reason: "missing exact patch/SHA" });
      continue;
    }
    if (!safePatchLimit || file.patchBytes > safePatchLimit) {
      deferred.push({ path: file.path, reason: safePatchLimit > 0 && file.patchBytes > safePatchLimit ?
        "oversized patch; needs line-bounded review or human inspection" : "bounded patch/call budget" });
      continue;
    }
    if (paths.length && totalBytes + file.patchBytes > safePatchLimit) flush();
    paths.push(file.path); patchDigests.push(file.patchDigest); totalBytes += file.patchBytes;
  }
  flush();
  return { batches, deferred }; // planning only: no LLM invocation or invented success
}
