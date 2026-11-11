---
name: cleanup
description: Use when cleaning a codebase or reducing technical debt without changing required behavior; finds and safely removes or consolidates dead code, stale docs, obsolete tasks, duplicate systems, unused configuration, and redundant tests.
---

**CLEANUP — Remove Dead & Duplicate Work**

**Goal**
Safely remove or consolidate dead code, obsolete tasks, duplicate systems, stale docs, config, and tests.

**1. Define scope**
State what area is being cleaned and why.

**2. Verify current truth**
Check relevant:
- current main/runtime
- callers/imports/routes
- tests
- Linear/docs
- schema/config when relevant

**3. Find candidates**
Look for:
- unused files/functions/components/routes
- duplicate utilities/services/state/workflows
- obsolete flags/scripts/config/env
- stale docs/tasks/tests/assets

**4. Prove safe**
Before deleting verify:
- no caller/dynamic use
- no external/API dependency
- no migration/data/job/auth dependency
If uncertain, classify **Needs evidence** instead of deleting.

**5. Choose the canonical path**
For duplicates identify the owner/source of truth, then:

**delete → consolidate → update references → minimal refactor**
Do not delete production data without explicit authorization and a safe plan.

**6. Verify**
Use:

**reference/import check → focused tests → typecheck/lint → build → E2E if user-visible**

**Output**

**Verdict**
Safe / Needs evidence / Unsafe.

**Remove**
Proven dead items.

**Consolidate**
Duplicates and canonical owner.

**Update**
References/docs/config.

**Keep**
Items still needed.

**Needs evidence**
Unproven candidates.

**Verification**
Checks required/run.

**Next step**
Highest-value cleanup action.

**Rules**
- Prove dead before deleting.
- Prefer deletion over abstraction.
- Do not mix unrelated refactors.
