---
name: code-review
description: >-
  Use when reviewing an existing PR, branch, commit range, or work-in-progress diff for correctness, regressions, security, maintainability, or spec fit.
context: fork
---

# Code Review

## Purpose

Review the actual diff against both the repository contract and the task/spec. Findings are hypotheses until proven against the exact current head.

## Ownership

`code-review` reviews implementation quality and spec fit. `task-verifier` independently decides whether the task/PR is actually complete and production-safe. Do not duplicate the verifier's full release gate here.

## Review inputs

Resolve before reviewing:
- exact head SHA;
- base/fixed point (`main`, merge-base, or user-supplied SHA);
- Linear task/spec and acceptance criteria when available;
- changed files plus relevant surrounding code;
- repository instructions (`AGENTS.md`, `CLAUDE.md`, domain skills);
- current tests/CI for the same head.

If the fixed point is ambiguous, use the PR merge-base when reviewing a PR; otherwise state the comparison chosen.

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

For every actionable finding provide:

```text
Severity: HIGH | MEDIUM | LOW
Category: correctness | security | data | reliability | architecture | test-gap | maintainability | performance
Evidence: file:line + exact behavior
Why it matters: concrete failure/user impact
Smallest safe fix: bounded recommendation
Verification: exact test/probe that proves the fix
```

Use `NOISE` when a reviewer/bot comment is disproven by current-head evidence.

## MDE rule

Prefer the smallest safe change. Do not use review as permission to redesign unrelated modules, add speculative abstractions, or create extra PRs for fixes/evidence that belong in the current task PR.
