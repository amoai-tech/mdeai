#!/usr/bin/env node
/**
 * Capture exactly one PR-Agent review body for a live canary score.
 *
 * Reuses the repository's own review-marker logic (`scripts/pr-agent/review-policy.mjs`) instead of
 * introducing a second, independent selection rule. Selection is pinned to one PR and one exact
 * head, and it fails loudly rather than concatenating several historical reviews — an old finding
 * must never make a broken review look successful.
 *
 * Usage:
 *   node scripts/pr-agent/evals/capture-review.mjs --pr 163 [--head <sha>] [--out /tmp/review.md]
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseFindings, REVIEW_MARKERS } from "./score-review.mjs";
import { selectCertifiedReviewForHead } from "../review-policy.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * Raw GitHub API shapes, matching what `review-policy.mjs` consumes in the workflow.
 *
 * `gh` is the trust boundary for this script: without it, or without a usable token, every
 * subsequent step would fail deep inside a child process with an opaque exit. Fail fast and name
 * the fix instead.
 */
function ghJson(args) {
  let raw;
  try {
    raw = execFileSync("gh", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        "the GitHub CLI (`gh`) is not installed or not on PATH; install it and run `gh auth login`",
      );
    }
    const detail = String(error?.stderr ?? error?.message ?? "").trim().split("\n")[0];
    throw new Error(
      `\`gh ${args.join(" ")}\` failed${detail ? `: ${detail}` : ""} — check \`gh auth status\``,
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`\`gh ${args.join(" ")}\` did not return JSON`);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      args[token.slice(2)] = true;
      continue;
    }
    args[token.slice(2)] = next;
    index += 1;
  }
  return args;
}

function main() {
  const { pr, head, out, "allow-unconfirmed-head": allowUnconfirmed } = parseArgs(process.argv.slice(2));
  if (!pr) throw new Error("usage: capture-review.mjs --pr <number> [--head <sha>] [--out <path>]");

  const repo = process.env.GITHUB_REPOSITORY ?? ghJson(["repo", "view", "--json", "nameWithOwner"]).nameWithOwner;
  const pull = ghJson(["api", `repos/${repo}/pulls/${pr}`]);
  const headSha = String(head ?? pull.head.sha).toLowerCase();

  const pages = ghJson(["api", "--paginate", "--slurp", `repos/${repo}/issues/${pr}/comments`]);
  const comments = pages.flat();

  const selection = selectCertifiedReviewForHead({
    comments,
    headSha,
    reviewMarkers: REVIEW_MARKERS,
    // A full/persistent review records the head its state advanced to; that is what pins the replay
    // to one exact head instead of to whenever the accumulating marker comment was last edited.
    headShaOf: (body) => parseFindings(body).runHeadSha,
    allowUnconfirmedHead: allowUnconfirmed === true,
  });
  if (!selection.comment) {
    throw new Error(`refusing to score an unverified review: ${selection.reason}`);
  }

  const body = selection.comment.body ?? "";
  if (out) {
    writeFileSync(out, body, "utf8");
    console.log(`captured ${body.length} bytes for ${repo}#${pr} head ${headSha} -> ${out}`);
  } else {
    process.stdout.write(body);
  }
  console.error(
    `review comment ${selection.comment.id}; ${selection.consideredReviews} candidate review(s) considered; marker ${selection.marker.id}; head ${headSha} ${selection.headConfirmed ? "confirmed" : "UNCONFIRMED"} via ${selection.headEvidence}; ${selection.reason}`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
