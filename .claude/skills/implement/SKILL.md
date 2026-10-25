---
name: implement
description: Use when the user explicitly asks to build, fix, complete, or implement known work rather than only analyze it; implements a verified task end to end with the smallest safe change and focused verification.
---

**IMPLEMENT — Complete a Verified Task**

**Goal**
Implement the requested task completely using the smallest safe change and prove the real outcome.

**1. Verify before changing**
Confirm:
- requested outcome
- current implementation
- dependencies/blockers
- existing canonical path
- acceptance criteria
Do not implement stale assumptions.

**2. Choose the fastest safe path**
Prefer:

**reuse → configure → adapt → minimal change**
Do not create duplicate services, schemas, state, workflows, or abstractions.

**3. Implement in dependency order**
Change only what is required.
For consequential writes prefer:

**validate → authorize → execute → persist → confirm**
Preserve contracts and security boundaries.

**4. Handle failure states**
When relevant verify:
- unauthorized/cross-user denial
- retry/idempotency
- concurrency
- partial failure/recovery
- no false success

**5. Test smallest first**
Use:

**focused tests → integration/RLS → typecheck/lint → build → E2E → production when required**
Fix failures caused by the change; do not expand into unrelated cleanup.

**6. Recheck changed path**
Reread changed files and verify:
- no stale/dead code
- no accidental scope
- tests prove the intended outcome

**Output**

**Implemented**
What changed.

**Verification**
Exact tests/results.

**Blockers**
Only real blockers.

**Verdict**
Outcome proven / Partially proven / Failed.

**Next step**
Highest-value action.

**Rules**
- When asked to implement, do not stop at analysis.
- Minimal focused change.
- Unknown stays unknown.
- Do not claim production-ready without production proof.
