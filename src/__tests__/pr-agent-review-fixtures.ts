// Shared deterministic inputs for PR-Agent review certification and coverage tests.
import { reviewEnvelope } from "../../scripts/pr-agent/review-policy.mjs";

export const BASE_A = "a".repeat(40);
export const BASE_B = "b".repeat(40);
export const HEAD_A = "c".repeat(40);
export const HEAD_B = "d".repeat(40);
export const RUN_STARTED = Date.parse("2026-09-20T01:00:00Z");

export const REVIEW_MARKERS = ["<!-- pr-agent:review:full -->", "<!-- pr-agent:review:incremental -->"];
export const REVIEW_FULL = "## MDE PR Review\n\n<!-- pr-agent:review:full -->\n\nbody";
export const REVIEW_INCREMENTAL = "## Incremental MDE PR Review\n\n<!-- pr-agent:review:incremental -->\n\nbody";

/** The fallback PR-Agent publishes when it cannot update the persistent review: no token, no head. */
export function standaloneReview(body: string) {
  return [
    "## Standalone PR Review",
    "",
    "_PR-Agent could not safely update the persistent review. This standalone result will not replace the canonical review._",
    "",
    "## MDE PR Review 🔍",
    "",
    body,
  ].join("\n");
}

type ReviewEnvelopeOptions = {
  baseSha?: string;
  headSha?: string;
  command?: "/review" | "/review -i";
};

export function envelopedCanonical(options: ReviewEnvelopeOptions = {}) {
  const command = options.command ?? "/review";
  const envelope = reviewEnvelope({
    baseSha: options.baseSha ?? BASE_A,
    headSha: options.headSha ?? HEAD_A,
    command,
    type: "canonical",
  });
  const marker = command === "/review -i" ? "<!-- pr-agent:review:incremental -->" : "<!-- pr-agent:review:full -->";
  return `${envelope}
## MDE PR Review 🔍
${marker}
review body

<!-- pr-agent-review-state:v1
${JSON.stringify({ findings: [], schema_version: 1, last_run: { complete: true, excluded_files: [], head_sha: options.headSha ?? HEAD_A } })}
-->`;
}

export function envelopedStandalone(options: ReviewEnvelopeOptions = {}) {
  return `${reviewEnvelope({
    baseSha: options.baseSha ?? BASE_A,
    headSha: options.headSha ?? HEAD_A,
    command: options.command ?? "/review",
    type: "standalone",
  })}
${standaloneReview("review body")}`;
}

export function comment(body: string, updatedAt: string, login = "github-actions[bot]") {
  return { body, updated_at: updatedAt, user: { login } };
}
