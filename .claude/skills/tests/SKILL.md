---
name: tests
description: Use to DESIGN regression coverage, edge cases, or AI eval criteria (e.g. duplicate lead retry checks). Not for executing and interpreting an existing test suite (testing) or running a browser journey (e2e).
---

**TESTS — Design High-Value Tests**

**Goal**
Prove the real requirement works with the smallest reliable test set.

**Use / do not use:** Use for “Which regression tests should prevent a duplicate rental lead?” Do **not** use for “Execute the existing test suite and interpret failures” (use `testing`); use `e2e` for an actual browser user journey.

**1. Define success first**
State measurable outcomes: behavior, security, persistence, consistency, latency/cost when relevant.
Avoid vague goals such as “works well.”

**2. Mirror real usage**
Cover:
- happy path
- common variation
- material edge cases
- known regressions
- failure/recovery when consequential

**3. Prioritize risk**
Test in this order:

**critical journey → security/data integrity → regression → edge cases → polish**
Do not chase coverage numbers for their own sake.

**Public behavior first (Matt Pocock TDD):** Agree on the observable interface/seam from the existing task, then write a test that fails for the missing behavior. Avoid testing private helpers, snapshot-only success or mocking away the integration being proved. For implementation work prefer RED → GREEN → REFACTOR; do not require a new testing plan when existing acceptance criteria settle the seam.

**4. Pick the cheapest valid layer**

**unit → integration → RLS/security → API/provider → browser/E2E → production**
Use E2E only when the risk crosses system boundaries.

**Risk-to-test rule (choose the cheapest layer that can catch the failure):**
- **UI-only:** focused component assertion; add 390px Playwright only when responsive layout/interaction is the risk.
- **Auth/RLS or cross-user data:** integration/RLS negative test, unauthorized denial, permitted-user readback.
- **Stripe, bookings, tickets, leads:** real transactional boundary in safe test mode; verify retries create exactly one result, signature/auth checks, atomic rollback and recovery. Require independent S4 verification before completion.

**5. Prefer deterministic assertions**
Use exact values, row counts, statuses, relationships, auth results, schema invariants, and idempotency checks.
Avoid fragile assertions on irrelevant wording/timing.

**6. Test consequential writes**
Verify:

**user action → authorization → execution → persistence → read-back → visible result**
Also test unauthorized access, cross-user isolation, retry/no duplicates, partial failure, and false-success prevention when relevant.

**7. Choose the grader**
Prefer:
1. code-based checks
2. LLM grader for nuanced judgment
3. human review for subjective/high-stakes cases
Do not use an LLM where code can verify exactly.

**8. Compare changes**
For prompts/agents/models:
- keep the same eval set
- compare current vs baseline
- inspect regressions, not only averages
- keep some held-out cases

**9. Keep tests valuable**
For every test ask:
- What requirement does this prove?
- What bug would it catch?
- Could the real workflow still be broken?
- Is it flaky or duplicated?
- Is there a cheaper proof?
Delete tests that do not earn maintenance cost.


**Stop when:** Each material acceptance criterion maps to a deterministic assertion and the minimum sufficient test layer; identify untested or manual evidence explicitly. This skill designs coverage; it does not pretend the tests ran.

For remaining steps, checks, and examples, see [full prompt](references/full-prompt.md).
