---
name: code-review
description: >-
  Use to review existing PRs, branches, diffs or standalone code snippets for correctness, security, maintainability and spec fit (e.g. an RLS migration or memory-leak snippet). Not for implementing reviewer feedback (review) or merge-readiness audits (praudit). Verify findings against current source.
context: fork
---

# Code Review

## Purpose

Review the actual diff against both the repository contract and the task/spec. Findings are hypotheses until proven against the exact current head.

## Ownership

`code-review` reviews implementation quality and spec fit. `task-verifier` independently decides whether the task/PR is actually complete and production-safe. Do not duplicate the verifier's full release gate here.

## Specialist references

Load specialist guidance only when the changed surface requires it:
- GitHub Actions, CI scripts, required gates, permissions, secret exposure, event/path filters, or false-green pipelines → [`references/ci-review.md`](references/ci-review.md).
- Large PRs, generated JSON snapshots, missing chunk coverage or bounded re-review → [`references/large-pr-review.md`](references/large-pr-review.md).

`code-review` remains the owner; the reference adds CI-specific invariants rather than creating a second review skill.

## Source of truth

Changed code/tests, the exact task/spec, trusted repository policy, and relevant surrounding contracts are the evidence hierarchy. PR prose is not authoritative when it conflicts with current code.

**Use / do not use:** Use for “Review the RLS migration PR for cross-user access and regressions.” Do **not** use for “Address the reviewer's existing comment” (`review`) or “Decide whether all merge approvals are satisfied” (`praudit` + independent `task-verifier` for S4).

## Review inputs

Resolve before reviewing:
- exact head SHA;
- base/fixed point (`main`, merge-base, or user-supplied SHA);
- Linear task/spec and acceptance criteria when available;
- changed files plus relevant surrounding code;
- repository instructions (`AGENTS.md`, `CLAUDE.md`, domain skills);
- current tests/CI for the same head.

If the fixed point is ambiguous, use the PR merge-base when reviewing a PR; otherwise state the comparison chosen.

**Review-efficiency rule (Addy Osmani + P Stack):** Prioritize demonstrable correctness, security and behavioral regressions before style. Try to falsify the smallest risky assumption against changed code and its immediate callers. Stop when the user outcome and risk-matched evidence are established; do not spawn parallel reviews for routine, low-risk changes.

## Review invariants

Apply this universal order to every PR:
1. Outcome — does the change produce the intended user/business result?
2. Truth — verify current repository/runtime/config facts; distrust stale prose.
3. Reuse — prefer existing code/platform/SDK capabilities over duplication.
4. Architecture — verify ownership and one source of truth.
5. Security — auth, authorization, RLS, tenancy, secrets, privilege boundaries.
6. Data integrity — duplicates, races, replay, partial writes, stale relationships.
7. Failure modes — invalid input, timeout, retry, cancellation, dependency/partial failure.
8. Integration correctness — versions, env/API/RPC/schema/webhook/event identifiers.
9. Real workflow — trace the affected end-to-end user/system journey.
10. Proof — tests/build/E2E/pgTAP must actually exercise the changed behavior.

Before declaring a change safe, run an adversarial falsification pass: assume the PR is subtly wrong and try to prove it through silent skips, false-green tests, exit-code mistakes, stale assumptions, misplaced permission checks, retry/replay races, wrong identifiers, or missing negative tests. Inspect unchanged surrounding callers/contracts when needed, but report only defects introduced or exposed by this PR.

### Boundary validation for new parsers and gates

A new or changed validator, parser, regex, version gate, identifier parser, permission gate, or custom implementation of a published standard is not proven by the author's own examples. Enumerate malformed near-miss inputs yourself and report the concrete inputs that pass when they should not: leading or trailing separators, empty identifiers, leading zeros, whitespace, malformed composite values, missing or duplicated components, and values immediately outside the accepted grammar. A suite that exercises only well-formed inputs is a test gap, not proof. Prefer an already-installed standards-compliant library over a hand-written pattern when it safely fits the requirement.

**Classify evidence before writing findings:**
- **VERIFIED DEFECT:** Reproduced or directly proven on the exact head; give the exact fix and regression check.
- **RISK / TEST GAP:** A plausible unproven failure path; state what targeted probe would settle it, as advisory rather than a confirmed blocker.
- **UNKNOWN / STALE CLAIM:** Missing evidence or a disproven old comment; say what is unknown or mark NOISE. Never upgrade a suspicion to a VERIFIED finding.

**Stop when:** The changed behavior and material risk boundaries have been checked, real findings have precise fixes, and untested claims are explicitly labeled. Do not create extra rounds of duplicate speculative review.

## Two-axis review

### 1. Spec fit

Map each acceptance criterion to code/tests/evidence. Flag missing behavior, invented scope, stale assumptions, broken migrations, unhandled states, or implementation that technically exists but does not produce the requested user outcome.

### 2. Code quality

Review only material risks:
- correctness and edge cases;
- auth/RLS/tenant boundaries;
- data integrity, retries, concurrency, idempotency;
- error/loading/empty/recovery behavior;
- duplicated or shallow abstractions;
- maintainability and naming;
- performance regressions;
- dependency/config/workflow risk;
- missing tests at the correct seam.

Do not report style trivia already handled by formatters/linters unless it changes meaning.

## Finding format

For every actionable finding, write for both the engineer fixing it and the product owner deciding whether it matters:

When PR-Agent uses this skill, every finding lives in `key_issues_to_review[].issue_content`. Make that block itself the readable review. Do not return one prose paragraph.

Use this exact YAML shape:

```yaml
issue_content: |
  **Severity:** HIGH

  **Technical:** concrete defect + affected file/function/schema + exact evidence + why it is technically incorrect

  **Plain English:** consequence in 1-2 short sentences with minimal jargon

  **Real-world example:** one realistic MDE user/operator/developer failure scenario

  **Fix:** smallest safe bounded change using existing MDE patterns

  **Verify:** exact deterministic test/probe that proves the fix

  **Verification state:** VERIFIED

  **Status:** changes_required
```

Choose exactly one allowed value: Severity = BLOCKER/HIGH/MEDIUM/LOW; Verification state = VERIFIED/NEEDS VERIFICATION; Status = changes_required/advisory. Never print the option list in a finding. If every field cannot be filled, omit the finding instead of returning an unstructured paragraph.

Keep the sections concise and non-repetitive. BLOCKER/HIGH findings must make the reason to delay merge understandable in Plain English.

Use `NOISE` when a reviewer/bot comment is disproven by current-head evidence.

## MDE rule

Prefer the smallest safe change. Do not use review as permission to redesign unrelated modules, add speculative abstractions, or create extra PRs for fixes/evidence that belong in the current task PR.
