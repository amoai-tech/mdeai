---
name: praudit
description: Use when auditing the exact current PR head for merge readiness; verifies requirements, security, reviews, CI, tests, and unresolved risks before merge.
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


For remaining steps, checks, and examples, see [full prompt](references/full-prompt.md).
