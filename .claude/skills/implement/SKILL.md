---
name: implement
description: Use for scoped build/fix requests with known outcomes (e.g. fix rental search); make the smallest verified change. Not for explanation-only requests, planning without code, or multi-PR task orchestration.
---

**IMPLEMENT — Complete a Verified Task**

**Goal**
Implement the requested task completely using the smallest safe change and prove the real outcome.

**Use / do not use:** Use for “Fix rental filtering and save one regression test.” Do **not** use for “Explain possible filtering designs without changing code” (use `plan` or answer directly); use `tasks` for a multi-PR delivery lifecycle.

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

**Vertical slices (Addy Osmani):** On multi-file changes, build one observable end-to-end behavior at a time (UI → existing API → persisted state where applicable). For each slice: implement → focused test → read back actual result → commit only when green. Prefer one small, recoverable slice to a broad unfinished refactor; don't require ceremonies for trivial edits.

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

**Risk-based proof:** A UI-only change needs a focused component test and relevant 390px browser check; auth/RLS or Stripe writes also need authorization, isolation, retry and atomicity tests, plus independent `task-verifier` for S4. Run broader repository gates at merge time, not after every edit.

**6. Recheck changed path**
Reread changed files and verify:
- no stale/dead code
- no accidental scope
- tests prove the intended outcome

**Stop when:** The requested change is in the existing canonical path, focused proof is recorded, affected failure/retry cases are covered as required, and the exact diff has been reread. If anything cannot be tested, report **partially proven** with the missing evidence; never label it Done.

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
