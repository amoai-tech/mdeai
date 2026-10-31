// SAN-1609: bounded, advisory coverage for the existing PR Agent. No second LLM engine.
import { createHash } from "node:crypto";
import { parseReviewEnvelope, excludedFilesFromReview } from "./review-policy.mjs";

export const COVERAGE_MARKER = "<!-- mde-smart-review-coverage:v1 -->";
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

export function reviewCoverageFromComment(body, baseSha, headSha) {
  const env = parseReviewEnvelope(body ?? "");
  if (!env.valid || env.baseSha !== baseSha.toLowerCase() || env.headSha !== headSha.toLowerCase()) return { status: "unknown", excluded: [], reason: "missing current base/head envelope" };
  const warnings = excludedFilesFromReview(env.body);
  const markers = [...env.body.matchAll(/(?:^|\n)<!-- pr-agent-review-state:v1\n([\s\S]*?)\n-->/g)];
  if (markers.length > 1) return { status: "failed", excluded: warnings, reason: "ambiguous persistent review state" };
  if (!markers.length) return { status: warnings.length ? "partial" : "unknown", excluded: warnings, reason: warnings.length ? "excluded-file footer" : "no persistent state" };
  try {
    const state = JSON.parse(markers[0][1])?.last_run;
    if (state?.head_sha?.toLowerCase() !== headSha.toLowerCase() || !Array.isArray(state?.excluded_files) || typeof state.complete !== "boolean") return { status: "unknown", excluded: warnings, reason: "stale/malformed review-state fields" };
    const excluded = [...new Set([...warnings, ...state.excluded_files])];
    return { status: state.complete && !excluded.length ? "complete" : "partial", excluded, reason: "persistent PR Agent state" };
  } catch { return { status: "failed", excluded: warnings, reason: "invalid review-state JSON" }; }
}

/**
 * Only data published in a current-SHA PR Agent run-details block counts.
 * Missing provider pricing is unknown, not a free ($0) review.
 */
export function parseReviewUsage(body, baseSha, headSha) {
  const empty = { model: null, inputTokens: null, outputTokens: null,
    seconds: null, calls: null, estimatedUsd: null };
  const envelope = parseReviewEnvelope(body ?? "");
  if (!envelope.valid || envelope.baseSha !== baseSha.toLowerCase() || envelope.headSha !== headSha.toLowerCase()) return empty;
  const section = envelope.body.match(/<summary><strong>[^<]*Agent run details<\/strong><\/summary>([\s\S]*?)<\/details>/);
  if (!section) return empty;
  const bodyText = section[1];
  const model = bodyText.match(/(?:^|\n)- Model: ([a-z0-9_.\/-]+)(?: \(fallback\))?(?:\r?\n|$)/i)?.[1] ?? null;
  const tokens = bodyText.match(/(?:^|\n)- Tokens: ([\d,]+) in \/ ([\d,]+) out \/ ([\d,]+) total(?:\r?\n|$)/);
  const seconds = bodyText.match(/(?:^|\n)- Time cost: (\d+(?:\.\d+)?)s(?:\r?\n|$)/)?.[1];
  const calls = bodyText.match(/(?:^|\n)- AI calls: (\d+)(?:\r?\n|$)/)?.[1];
  const usd = bodyText.match(/(?:^|\n)- Estimated API cost: \$(\d+(?:\.\d+)?) USD(?:\r?\n|$)/)?.[1];
  const safe = (x) => x === undefined ? null : Number.isSafeInteger(Number(x.replaceAll(",", ""))) && Number(x.replaceAll(",", "")) >= 0 && Number(x.replaceAll(",", "")) < 1e10 ? Number(x.replaceAll(",", "")) : null;
  const inputTokens = tokens ? safe(tokens[1]) : null, outputTokens = tokens ? safe(tokens[2]) : null;
  const total = tokens ? safe(tokens[3]) : null;
  return { model,
    inputTokens: total !== null && inputTokens !== null && outputTokens !== null && inputTokens + outputTokens === total ? inputTokens : null,
    outputTokens: total !== null && inputTokens !== null && outputTokens !== null && inputTokens + outputTokens === total ? outputTokens : null,
    seconds: seconds !== undefined && Number.isFinite(Number(seconds)) && Number(seconds) >= 0 && Number(seconds) < 86400 ? Number(seconds) : null,
    calls: calls === undefined ? null : safe(calls),
    estimatedUsd: usd !== undefined && Number.isFinite(Number(usd)) && Number(usd) >= 0 ? Number(usd) : null };
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
  const details = inventory.files.map((file) => {
    const validation = validations[file.path] ?? { status: "unknown", reason: "no deterministic proof" };
    const coverage = ["excluded", "generated"].includes(file.category) ? "policy-excluded" :
      excluded.has(normalizedPath(file.path)) || (file.previousPath && excluded.has(normalizedPath(file.previousPath))) ? "unreviewed" :
      ai.status === "failed" ? "failed" : ai.status === "complete" && file.patchDigest ? "ai-reviewed" : "unknown";
    return { ...file, coverage, validation };
  });
  const counts = {
    total: details.length,
    aiReviewed: details.filter((f) => f.coverage === "ai-reviewed").length,
    deterministicValidated: details.filter((f) => f.validation.status === "validated").length,
    policyExcluded: details.filter((f) => f.coverage === "policy-excluded").length,
    uncovered: details.filter((f) => f.coverage === "unreviewed").length,
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
      counts.uncovered || counts.unknown ? "PARTIAL" : "COMPLETE";
  const pending = details.filter((f) => ["unknown", "unreviewed", "failed"].includes(f.coverage) && !["excluded", "generated"].includes(f.category));
  const criticalPending = pending.filter((f) => ["critical", "high"].includes(f.category));
  const verified = details.filter((f) => f.coverage === "ai-reviewed" || f.validation.status === "validated").length;
  const percentVerified = details.length ? Math.round(100 * verified / details.length) : 100;
  const usage = parseReviewUsage(reviewBody, baseSha, headSha);
  const plan = planFollowupBatches({ details }, { baseSha, headSha, maxBatches: 6, maxPatchBytes: 35000 });
  const plannedFiles = plan.batches.reduce((total, batch) => total + batch.paths.length, 0);
  const rows = details.slice(0, 70).map((f) => `| ${quotePath(f.path)} | ${f.category} | ${f.coverage} | ${f.validation.status} |`);
  const body = [COVERAGE_MARKER, "## MDE smart review coverage (advisory)", "",
    `**PR:** ${repo}#${number} · **Base:** ${quotePath(baseSha)} · **Head:** ${quotePath(headSha)}`,
    `**${status}** — ${ai.reason}. AI review and deterministic validation are independent evidence.`, "",
    `Changed: ${counts.total} · AI reviewed: ${counts.aiReviewed} · Validated: ${counts.deterministicValidated} · Policy-excluded: ${counts.policyExcluded} · Unreviewed: ${counts.uncovered} · Unknown: ${counts.unknown} · Failed: ${counts.failed}.`, "",
    "| File | Classification | AI coverage | Deterministic validation |", "| --- | --- | --- | --- |", ...rows,
    ...(details.length > rows.length ? [`| … | ${details.length - rows.length} additional files | See GitHub diff | — |`] : []), "",
    criticalPending.length ? `**Needs independent human attention:** ${criticalPending.slice(0, 10).map((f) => quotePath(f.path)).join(", ")}` : "No uncovered critical/high-risk files established.", "",
    pending.length ? `**Follow-up:** ${pending.length} file(s) lack proven AI coverage. Plan a bounded file-specific review; this comment does not execute or certify one.` : "No actionable uncovered files identified from the available evidence.",
    "**Quality (grounded):** " + verified + "/" + details.length + " files have confirmed AI or deterministic proof (" + percentVerified + "%); " + criticalPending.length + " critical/high-risk files still need human attention.",
    "**Model usage (reported):** " + (usage.model ?? "unknown") + " · Calls: " + (usage.calls ?? "unknown") + " · Input/output tokens: " + (usage.inputTokens ?? "unknown") + "/" + (usage.outputTokens ?? "unknown") + " · Processing time: " + (usage.seconds === null ? "unknown" : usage.seconds + "s") + " · Estimated API cost: " + (usage.estimatedUsd === null ? "unknown (not $0)" : "$" + usage.estimatedUsd.toFixed(4) + " USD") + ".",
    "**Follow-up budget:** " + plan.batches.length + "/6 risk-ordered patch batches plan " + plannedFiles + " files, capped at 35,000 patch bytes per batch; " + plan.deferred.length + " files deferred. Planning only: no extra model calls executed or certified.",
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
  for (const file of report.details.filter((f) => ["unknown", "unreviewed", "failed"].includes(f.coverage) && !["excluded", "generated"].includes(f.category))) {
    if (!baseSha || !headSha || !file.patchDigest || !Number.isSafeInteger(file.patchBytes)) {
      deferred.push({ path: file.path, reason: "missing exact patch/SHA" });
      continue;
    }
    if (!safePatchLimit || file.patchBytes > safePatchLimit) {
      deferred.push({ path: file.path, reason: "bounded patch/call budget" });
      continue;
    }
    if (paths.length && totalBytes + file.patchBytes > safePatchLimit) flush();
    paths.push(file.path); patchDigests.push(file.patchDigest); totalBytes += file.patchBytes;
  }
  flush();
  return { batches, deferred }; // planning only: no LLM invocation or invented success
}
