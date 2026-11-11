---
name: review
description: Use when evaluating review comments or requested changes against current code; distinguishes real defects, stale advice, noise, and actionable corrections.
---

**REVIEW — Review Feedback & Readiness**

**Goal**
Review comments, errors, and requested changes; verify what is actually fixed; resolve only real remaining issues.

**1. Collect current feedback**
List each relevant review comment/problem and its current status.
Ignore stale/superseded feedback only after verifying why.

**2. Verify against current code**
Inspect the exact current branch/head and affected workflow.
Classify each item:
- ✅ Fixed
- 🟡 Partially fixed
- 🔴 Still broken
- ⚪ Stale/incorrect
- ❓ Needs evidence

**3. Find hidden blockers**
Check when relevant:
- security/auth/RLS
- persistence/transactions
- retries/idempotency
- failure handling
- deploy/schema/config drift
- missing regression tests

**4. Choose the fastest safe correction**
Ask:
> Is there a better, faster, simpler, safer way to complete this?
Prefer minimal fixes over broad refactors.

**5. Fix if requested**
When authorized:
- implement required corrections
- run targeted tests
- commit/push only if requested
- resolve review threads only after evidence proves the issue is fixed

**6. Decide readiness**
A clean diff is not enough.
Verify the real user/system outcome when the change is consequential.

**Output**

**Verdict**
Ready / Ready after fixes / Not ready.

**Review items**

**comment → status → evidence → fix**

**Additional blockers**
Only newly confirmed issues.

**Verification**
Tests/workflow proof.

**Next step**
Highest-value action.
