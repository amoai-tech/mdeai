---
name: praudit
description: Audits the exact current pull request head for merge readiness, including linked task outcome, review comments, security, regressions, tests, and material risks. Use before deciding whether a PR should merge.
---

**PR AUDIT — Merge Readiness**

**Goal**
Audit the exact current PR head and decide whether it is safe to merge.

**1. Verify context**
Check:
- linked Linear task and required outcome
- exact PR head/base
- diff/commits
- reviews/comments
- current CI
Use full Linear names: **SAN-#### · Exact Linear Task Name**.

**2. Trace the affected workflow**
Inspect only load-bearing paths.
Check when relevant:
- requirements mismatch
- auth/RLS/isolation
- persistence/transactions
- retries/idempotency/concurrency
- failure handling
- source/schema/config drift
- unsupported APIs
- duplicate architecture
- deploy/config requirements
- missing regression coverage

**3. Review comments**
Classify:
- must fix
- optional
- stale/incorrect
- resolved
- needs evidence
Do not treat resolved comments as proof without checking current code.

**4. Run targeted verification**
Prefer:

**focused tests → RLS/integration → typecheck/lint → build → E2E**
Test the exact PR head.

**5. Fix only if requested**
Audit-only by default.
If explicitly asked to fix:
- make the smallest required change
- rerun affected tests
- reread changed files
- commit/push only when requested

**Output**

**Verdict**
✅ MERGE / 🟡 MERGE AFTER FIXES / 🔴 DO NOT MERGE

**Task outcome**
Does the PR satisfy it?

**Findings**
Ordered by severity with evidence/fix.

**Review comments**
Status of material feedback.

**Verification**
Exact checks/results.

**Blockers**
Only merge blockers.

**Post-merge**
Required follow-up if any.

**Next step**
Highest-value action.

**Rules**
- Exact head only.
- Green CI is not enough for consequential workflows.
- No speculative blockers.
