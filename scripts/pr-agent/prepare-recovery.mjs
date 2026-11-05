import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseReviewEnvelope, coverageFailure, excludedCoverageFromReview, clippedPatchesFromReview } from "./review-policy.mjs";
import { classifyFiles } from "./smart-review.mjs";

const SHA = /^[0-9a-f]{40}$/i;
const MAX_SOURCE_BYTES = 128_000;
const MAX_DIFF_BYTES = 35_000;

function safeSourcePath(path) {
  return typeof path === "string" && /^src\/[A-Za-z0-9_./-]+$/.test(path) &&
    !path.split("/").includes("..") && !path.includes("//");
}

/** Deterministic full unified patch from two exact GitHub source blobs. */
export function exactFileDiff(path, before, after, maxPatchBytes = MAX_DIFF_BYTES) {
  if (!safeSourcePath(path) || typeof before !== "string" || typeof after !== "string" ||
      before.includes("\0") || after.includes("\0") ||
      Buffer.byteLength(before) > MAX_SOURCE_BYTES || Buffer.byteLength(after) > MAX_SOURCE_BYTES ||
      !Number.isSafeInteger(maxPatchBytes) || maxPatchBytes <= 0 || maxPatchBytes > MAX_DIFF_BYTES) {
    return { ok: false, reason: "unsafe path, binary/oversized file, or invalid patch budget" };
  }
  const dir = mkdtempSync(join(tmpdir(), "mde-pr-recovery-"));
  try {
    const left = join(dir, "a", path), right = join(dir, "b", path);
    mkdirSync(dirname(left), { recursive: true });
    mkdirSync(dirname(right), { recursive: true });
    writeFileSync(left, before, "utf8");
    writeFileSync(right, after, "utf8");
    const result = spawnSync("git", ["diff", "--no-index", "--no-ext-diff", "--unified=3",
      "--", join("a", path), join("b", path)], {
      cwd: dir, encoding: "utf8", maxBuffer: 2 * MAX_SOURCE_BYTES,
    });
    if (result.status !== 1 || result.error || result.signal) {
      return { ok: false, reason: result.status === 0 ? "no changed patch" : "trusted git diff generation failed" };
    }
    const start = result.stdout.indexOf("\n@@ ");
    if (start < 0) return { ok: false, reason: "diff lacks actual changed-line hunks" };
    const diff = `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n` +
      result.stdout.slice(start + 1);
    const bytes = Buffer.byteLength(diff, "utf8");
    if (bytes > maxPatchBytes) return { ok: false, reason: "full patch exceeds bounded recovery budget", patchBytes: bytes };
    return { ok: true, diff, patchBytes: bytes,
      diffSha256: createHash("sha256").update(diff).digest("hex") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Select only one explicitly excluded, important, full source patch. */
export function selectRecoveryTarget({ reviewBody, baseSha, headSha, files, expectedCount }) {
  if (!SHA.test(baseSha ?? "") || !SHA.test(headSha ?? "") ||
      !Array.isArray(files) || !Number.isSafeInteger(expectedCount) ||
      expectedCount < 1 || expectedCount >= 3000 || files.length !== expectedCount) {
    return { ok: false, reason: "unverified current-PR file inventory" };
  }
  const envelope = parseReviewEnvelope(reviewBody ?? "");
  if (!envelope.valid || envelope.baseSha !== baseSha || envelope.headSha !== headSha ||
      envelope.type !== "canonical" || envelope.command !== "/review") {
    return { ok: false, reason: "missing trusted canonical exact-head review" };
  }
  const failure = coverageFailure(envelope.body, headSha);
  if (failure?.code !== "INCOMPLETE_REVIEW" || /failed chunk/i.test(failure.reason)) {
    return { ok: false, reason: "no recoverable budget-limited review" };
  }
  const marker = [...envelope.body.matchAll(/(?:^|\n)<!-- pr-agent-review-state:v1\n([\s\S]*?)\n-->/g)];
  if (marker.length !== 1) return { ok: false, reason: "missing unique persistent coverage state" };
  let state;
  try { state = JSON.parse(marker[0][1]); } catch { return { ok: false, reason: "bad persistent state" }; }
  const previous = state?.last_run;
  if (state?.schema_version !== 1 || !Array.isArray(state.findings) ||
      previous?.head_sha?.toLowerCase() !== headSha.toLowerCase() ||
      previous?.kind !== "partial" || previous.complete !== false ||
      !Array.isArray(previous.excluded_files) || previous.excluded_files.length !== 1) {
    return { ok: false, reason: "initial state does not identify one omitted patch" };
  }
  const path = previous.excluded_files[0];
  if (!safeSourcePath(path)) return { ok: false, reason: "excluded path not safe source code" };
  const excluded = excludedCoverageFromReview(envelope.body);
  const clipped = clippedPatchesFromReview(envelope.body);
  if (excluded.unlistedCount || clipped.unlistedCount ||
      excluded.files.some((p) => p !== path) || clipped.files.some((p) => p !== path)) {
    return { ok: false, reason: "unlisted or different excluded patches" };
  }
  const classification = classifyFiles(files, expectedCount);
  if (classification.unknownInventory) return { ok: false, reason: "incomplete file inventory" };
  const file = files.find((entry) => entry.filename === path);
  const risk = classification.files.find((entry) => entry.path === path)?.category;
  if (!file || file.status !== "modified" || !["critical", "high"].includes(risk)) {
    return { ok: false, reason: "no modified, high-risk candidate with full blob history" };
  }
  return { ok: true, path, risk };
}

/** GitHub exact-base/head blob reads are DATA only: never import PR-head JS. */
export async function prepareRecoveryFromGithub({
  github, owner, repo, pullNumber, baseSha, headSha, reviewBody,
  maxPatchBytes = MAX_DIFF_BYTES,
}) {
  try {
  const query = { owner, repo };
  const snapshot = async () => {
    const { data } = await github.rest.pulls.get({ ...query, pull_number: pullNumber });
    if (data.base.sha !== baseSha || data.head.sha !== headSha) throw new Error("STALE_PR_REVISION");
    return data.changed_files;
  };
  const expectedCount = await snapshot();
  if (expectedCount >= 3000 || expectedCount < 1) return { ok: false, reason: "unavailable file inventory" };
  const files = await github.paginate(github.rest.pulls.listFiles,
    { ...query, pull_number: pullNumber, per_page: 100 });
  const selected = selectRecoveryTarget({ reviewBody, baseSha, headSha, files, expectedCount });
  if (!selected.ok) return selected;
  const file = files.find((entry) => entry.filename === selected.path);
  const read = async (ref) => {
    const { data } = await github.rest.repos.getContent({ ...query, path: selected.path, ref });
    if (!data || Array.isArray(data) || data.type !== "file" ||
        data.encoding !== "base64" || data.size > MAX_SOURCE_BYTES ||
        !SHA.test(data.sha ?? "")) {
      throw new Error("unsupported exact blob");
    }
    const bytes = Buffer.from(data.content, "base64");
    if (bytes.length !== data.size || bytes.includes(0)) throw new Error("binary/size mismatch");
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { content, blobSha: data.sha };
  };
  const [before, after] = await Promise.all([read(baseSha), read(headSha)]);
  // GitHub's changed-file list identifies the current head blob by SHA.
  // This supplements the exact refs and prevents a substituted output blob.
  if (!SHA.test(file.sha ?? "") || file.sha !== after.blobSha) {
    return { ok: false, reason: "exact-head blob SHA does not match current PR inventory" };
  }
  const patch = exactFileDiff(selected.path, before.content, after.content, maxPatchBytes);
  if (!patch.ok) return patch;
  if (await snapshot() !== expectedCount) return { ok: false, reason: "changed PR file inventory" };
  return { ok: true, baseSha, headSha, path: selected.path, risk: selected.risk,
    source: "exact-blob-diff", bounded: true, diff: patch.diff,
    diffSha256: patch.diffSha256, patchBytes: patch.patchBytes };
  } catch (error) {
    return { ok: false, reason: "bounded recovery unavailable: " +
      String(error?.message ?? error).slice(0, 180) };
  }
}

/**
 * Validate model-produced paths and line anchors against the exact trusted diff.
 * Reject invented paths/lines, retain only supported advisory findings and do
 * not certify results that required discarding any model output.
 */
export function validateTargetedModelOutput({ output, diff, path }) {
  const reject = (reason) => ({ ok: false, reason, findings: [],
    rejectedFindings: 0, coverageComplete: false });
  if (!safeSourcePath(path) || typeof diff !== "string" ||
      Buffer.byteLength(diff) > MAX_DIFF_BYTES ||
      !diff.startsWith("diff --git a/" + path + " b/" + path + "\n--- a/" + path +
        "\n+++ b/" + path + "\n")) return reject("untrusted exact file diff");
  const review = output?.review, coverage = output?.coverage;
  const effort = review?.["estimated_effort_to_review_[1-5]"];
  if (!review || !Array.isArray(review.key_issues_to_review) ||
      !Number.isSafeInteger(effort) || effort < 1 || effort > 5 ||
      !["Yes", "No"].includes(String(review.relevant_tests ?? "").trim()) ||
      !["Yes", "No"].includes(String(review.security_concerns ?? "").trim()) ||
      !Array.isArray(coverage?.files_not_reviewed) ||
      !Array.isArray(coverage?.files_partially_reviewed)) {
    return reject("invalid model schema or provider coverage");
  }
  const changed = new Set();
  let lineNo = null;
  for (const line of diff.split("\n").slice(3)) {
    if (line.startsWith("@@ ")) {
      const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (!match) return reject("malformed diff hunk");
      lineNo = Number(match[1]);
    } else if (lineNo !== null && line.startsWith("+")) {
      changed.add(lineNo++);
    } else if (lineNo !== null && line.startsWith(" ")) {
      lineNo += 1;
    } else if (lineNo !== null &&
               (line.startsWith("-") || line === "" ||
                line === "\\ No newline at end of file")) {
      // Deletion or metadata: no new-side line advancement.
    } else if (line) {
      return reject("invalid diff line");
    }
  }
  if (!changed.size || review.key_issues_to_review.length > 100) {
    return reject("unbounded findings or no changed lines");
  }
  const findings = [];
  let rejectedFindings = 0, truncatedFindings = 0;
  for (const issue of review.key_issues_to_review) {
    const file = typeof issue?.relevant_file === "string" ? issue.relevant_file.trim() : "";
    const title = typeof issue?.issue_header === "string" ? issue.issue_header.trim() : "";
    const detail = typeof issue?.issue_content === "string" ? issue.issue_content.trim() : "";
    const start = issue?.start_line, end = issue?.end_line;
    const grounded = Number.isSafeInteger(start) && Number.isSafeInteger(end) &&
      start > 0 && end >= start && end - start < 100 &&
      [...changed].some((line) => line >= start && line <= end);
    if (file !== path || !title || title.length > 240 ||
        !detail || detail.length > 10000 || !grounded) {
      rejectedFindings += 1;
      continue;
    }
    if (findings.length >= 6) {
      truncatedFindings += 1;
      continue;
    }
    findings.push({ path, title, detail, startLine: start, endLine: end });
  }
  const omissions = coverage.files_not_reviewed.length + coverage.files_partially_reviewed.length;
  return { ok: true, findings, rejectedFindings, truncatedFindings,
    // Review coverage and quality of individual findings are distinct facts.
    // The pinned provider may cover the full patch while one suggested finding
    // has an invalid line anchor. Withhold that finding, not the coverage proof.
    coverageComplete: omissions === 0,
    findingsGrounded: rejectedFindings === 0,
    reason: omissions ? "provider still omitted part of the file" :
      rejectedFindings ? "patch covered; ungrounded suggestions withheld" :
        "targeted model output covers the supplied patch" };
}


/** Pure, fail-closed combined review proof. The caller must first obtain plan
 * and diff from exact GitHub base/head blobs, and verify the PR is still at
 * that revision immediately before certification/publication.
 */
export function verifyRecoveredCoverage({ reviewBody, baseSha, headSha, files,
  expectedCount, plan, diff, output }) {
  const reject = (reason) => ({ ok: false, reason });
  const selected = selectRecoveryTarget({ reviewBody, baseSha, headSha, files, expectedCount });
  if (!selected.ok) return reject(selected.reason);
  if (!plan || plan.baseSha !== baseSha || plan.headSha !== headSha ||
      plan.path !== selected.path || plan.risk !== selected.risk ||
      plan.source !== "exact-blob-diff" || plan.bounded !== true ||
      typeof diff !== "string" || !Number.isSafeInteger(plan.patchBytes) ||
      plan.patchBytes <= 0 || plan.patchBytes > MAX_DIFF_BYTES ||
      Buffer.byteLength(diff) !== plan.patchBytes ||
      createHash("sha256").update(diff).digest("hex") !== plan.diffSha256) {
    return reject("stale, mismatched or unbounded source diff proof");
  }
  const checked = validateTargetedModelOutput({ output, diff, path: plan.path });
  if (!checked.ok || !checked.coverageComplete) {
    return reject(checked.reason || "targeted AI coverage remains incomplete");
  }
  // A bounded source/diff binding is not proof that an LLM read every hunk.
  // This is an advisory model result, NOT a merge or full-coverage certificate.
  // Only the separate trusted shared-workflow verifier may decide its own gate.
  return { ok: true, code: "TARGETED_RECOVERY_ADVISORY", path: plan.path,
    diffSha256: plan.diffSha256, findings: checked.findings,
    rejectedFindings: checked.rejectedFindings,
    truncatedFindings: checked.truncatedFindings,
    reason: "one exact-head patch supplied; model reports no omissions (advisory only)" };
}
