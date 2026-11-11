// SAN-1312 · MDE-PR-REVIEW-001
//
// The two-case canary plus four high-risk cases. Each case declares:
//   - the changed-file set, so the router can be checked against the expected owner skill;
//   - the review signals a material finding must contain, so the verdict is not a vibe;
//   - the recorded v0.45 baseline for the two real PRs, where one exists.
//
// `signals` are OR-within-a-group, AND-across-groups: `minSignals` of the listed groups must match.

/** A new validator/parser/regex with malformed near-miss inputs that the tests never exercise. */
const semverBoundary = {
  id: "semver-boundary",
  kind: "defect",
  summary: "PR #157 — the EXACT_VERSION pattern accepted malformed SemVer, and the suite only covered well-formed pins.",
  provenance: "Real MDE false negative. Recorded v0.45 review scored 95/100 and said Safe to merge with 0 findings.",
  changedFiles: ["scripts/check-mastra.mjs"],
  expectedOwnerSkills: ["code-review"],
  // Golden requirement: a finding's quoted code must exist in the exact changed source. Scoring
  // reports `grounding` against this file so a finding that misquotes the code it reviewed is
  // visible instead of being credited.
  sourceFile: "scripts/check-mastra.mjs",
  // Contract, all inside ONE finding:
  //   MUST  identify the validator
  //   MUST  cite at least one literal malformed input
  //   PLUS  explain enough boundary behavior to show why it fails
  minSignals: 2,
  mandatorySignals: ["names the validator"],
  // Literals rather than a pattern: a generic regex can be satisfied by ordinary prose, and an
  // example the reviewer never actually named is not evidence that it tested the boundary.
  requiredExamples: [
    "01.2.3",
    "1.02.3",
    "1.2.3-01",
    "1.2.3-alpha..1",
    "1.2.3-a..b",
    "1.2.3-a.",
    "1.2.3-.a",
    "1.2.3+build.",
  ],
  signals: [
    {
      name: "names the validator",
      any: [/\bEXACT_VERSION\b/, /exact[-\s]?version/i, /version (?:pattern|regex|check|gate)/i],
    },
    {
      name: "states the leading-zero boundary",
      any: [/leading zero/i, /\b0\d\.\d+\.\d+\b/, /\b\d+\.\d+\.\d+\b[^\n]{0,40}\bleading\b/i],
    },
    {
      name: "states the empty-identifier or build-metadata boundary",
      any: [/prerelease|pre-release/i, /build metadata/i, /empty (?:dot[- ]separated )?identifier/i, /\ba\.\.b\b/],
    },
  ],
};

/** PR #158 — docs-only. The control: no material finding may be invented. */
const docsOnlyControl = {
  id: "docs-only-control",
  kind: "clean",
  summary: "PR #158 — AGENTS.md wording change only.",
  provenance: "Real MDE control. Recorded v0.45 review said Safe to merge with 0 findings, which is correct here.",
  changedFiles: ["AGENTS.md"],
  expectedOwnerSkills: ["code-review"],
  minSignals: 0,
  signals: [],
};

/** A new table or policy that leaves a cross-tenant read/write path open. */
const supabaseCrossTenant = {
  id: "supabase-rls-cross-tenant",
  kind: "defect",
  summary: "A migration adds a listing-notes table whose policy lets any authenticated user read another owner's rows.",
  changedFiles: ["supabase/migrations/20260101000000_add_listing_notes.sql"],
  expectedOwnerSkills: ["code-review", "supabase"],
  minSignals: 3,
  signals: [
    { name: "names cross-tenant/user-A-vs-user-B exposure", any: [/\buser a\b/i, /\btenant a\b/i, /cross[- ]tenant/i, /another (?:user|owner|tenant)/i] },
    { name: "names RLS or the policy predicate", any: [/\bRLS\b/i, /row[- ]level security/i, /policy predicate/i, /\bUSING\b/] },
    { name: "names the missing or over-broad authorization", any: [/missing (?:a )?policy/i, /USING\s*\(\s*true\s*\)/i, /not enforced/i, /over[- ]broad/i, /auth\.uid\(\)/i] },
    { name: "requires denial proof", any: [/denial proof/i, /negative test/i, /user b/i, /tenant b/i, /must (?:not|fail)/i] },
  ],
};

/** A webhook handler that applies a side effect before proving event uniqueness. */
const stripeReplay = {
  id: "stripe-webhook-replay",
  kind: "defect",
  summary: "A Stripe webhook fulfils on every delivery, so a replayed or out-of-order event duplicates the side effect.",
  changedFiles: ["src/app/api/stripe/webhook/route.ts"],
  expectedOwnerSkills: ["stripe"],
  minSignals: 3,
  signals: [
    { name: "names duplicate delivery or replay", any: [/duplicate (?:event|delivery|webhook)/i, /\breplay/i, /redeliver/i] },
    { name: "names out-of-order delivery", any: [/out[- ]of[- ]order/i, /event ordering/i, /arrives? (?:late|after)/i, /stale event/i] },
    { name: "names the duplicated protected effect", any: [/duplicate (?:ticket|ledger|inventory|payout|charge|row|record|email|booking)/i, /twice/i, /double/i] },
    { name: "requires one-effect proof", any: [/duplicate (?:event )?test/i, /only one/i, /exactly one/i, /idempoten/i] },
  ],
};

/** A required CI command whose failure is swallowed, so the job reports success. */
const ciSilentSuccess = {
  id: "ci-silent-success",
  kind: "defect",
  summary: "A workflow step ignores a failing command's exit status, so a broken gate still reports green.",
  changedFiles: [".github/workflows/floor.yml"],
  expectedOwnerSkills: ["code-review"],
  minSignals: 3,
  signals: [
    { name: "names the swallowed failure", any: [/silent skip/i, /swallow/i, /ignores? the exit/i, /\|\|\s*true/, /continue-on-error/i] },
    { name: "names a non-zero / exit-code requirement", any: [/exit code/i, /non-?zero/i, /set -e/, /pipefail/i, /propagat/i] },
    { name: "names the false-green consequence", any: [/false[- ]green/i, /reports? success/i, /still green/i, /passes? while/i] },
    { name: "requires a failing-command proof", any: [/failing (?:command|step)/i, /inject a failure/i, /force a failure/i, /must fail/i] },
  ],
};

/** Two writes with a retry boundary between them, so a retry duplicates or partially applies. */
const retryPartialWrite = {
  id: "retry-partial-write",
  kind: "defect",
  summary: "Fulfilment writes two records without a transaction or idempotency key, so a failure between writes is inconsistent after retry.",
  changedFiles: ["src/lib/orders/fulfilment.ts"],
  expectedOwnerSkills: ["code-review"],
  minSignals: 3,
  signals: [
    { name: "names the partial write", any: [/partial write/i, /between (?:the )?(?:two )?writes/i, /two writes/i, /half[- ]applied/i] },
    { name: "names retry / re-run", any: [/retr(?:y|ies)/i, /re-?run/i, /reprocess/i] },
    { name: "names the duplicated or inconsistent outcome", any: [/idempoten/i, /duplicate/i, /inconsistent/i, /exactly once/i] },
    { name: "names the missing transaction boundary", any: [/transaction/i, /atomic/i, /rollback/i, /single commit/i] },
  ],
};

export const CASES = [
  semverBoundary,
  docsOnlyControl,
  supabaseCrossTenant,
  stripeReplay,
  ciSilentSuccess,
  retryPartialWrite,
];

export const CASES_BY_ID = Object.fromEntries(CASES.map((entry) => [entry.id, entry]));

/**
 * Required review probes, each anchored to the skill file that owns it. If a probe is deleted
 * from the instruction the reviewer actually loads, this corpus fails instead of drifting quietly.
 */
export const REQUIRED_PROBE_ANCHORS = [
  {
    probe: "auth/RLS → User A vs User B or tenant A vs tenant B denial proof",
    skill: ".claude/skills/supabase/references/review.md",
    matches: /User A must not read, update, delete or create data as User B/,
  },
  {
    probe: "payment/webhook → duplicate and out-of-order delivery",
    skill: ".claude/skills/stripe/references/review.md",
    matches: /duplicate delivery must not duplicate tickets/,
  },
  {
    probe: "retry-sensitive side effect → retry must not duplicate the outcome",
    skill: ".claude/skills/stripe/references/review.md",
    matches: /Retry\/lost-response\/replay paths must converge on one business effect/,
  },
  {
    probe: "CI → failure must propagate a non-zero status",
    skill: ".claude/skills/code-review/references/ci-review.md",
    matches: /cannot be converted into success/,
  },
  {
    probe: "boundary validation → malformed near-miss inputs for a new parser",
    skill: ".claude/skills/code-review/SKILL.md",
    matches: /malformed near-miss inputs/,
  },
];
