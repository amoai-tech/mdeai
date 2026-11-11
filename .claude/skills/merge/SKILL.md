---
name: merge
description: Use when validating a PR after it has merged; checks current main, post-merge integration, deployed user outcomes, and remaining verification.
---

**MERGE — Post-Merge Verification**

**Goal**
Verify the merged change on current main and confirm the real outcome, not just the merge event.

**1. Confirm merge**
Verify:
- merged PR
- merge SHA
- current main contains the change
- linked task
Use full Linear names: **SAN-#### · Exact Linear Task Name**.

**2. Verify deployment/state**
When relevant check:
- deployed SHA
- migrations/schema
- RLS/grants/functions
- config/env/provider
- required production data

**3. Run targeted regressions**
Test the merged main, not the old PR head.
Use:

**focused regression → RLS/integration → build → E2E → production smoke when required**

**4. Prove the real workflow**
For consequential writes verify:

**authorized succeeds → persisted state correct → retry no duplicate → unauthorized fails → failure safe**
Include mobile when required by the task.

**5. Check regressions/operations**
Review only relevant:
- logs/errors
- adjacent workflow breakage
- deployment drift
- diagnostics

**6. Update execution truth**
Update Linear based on evidence, not the merge status alone.

**Output**

**Verdict**
✅ Verified / 🟡 Follow-up required / 🔴 Post-merge failure

**Merge**
PR + merge SHA.

**Verification**
Tests and workflow proof.

**Production**
What was actually verified.

**Issues**
Only confirmed regressions/gaps.

**Linear**
Task status/update needed.

**Next step**
Highest-value action.

**Rules**
- Merge ≠ Done.
- Current main is the source.
- No production-ready claim without production evidence.
