---
name: tests
description: Designs focused tests and evaluations that prove real requirements with the cheapest reliable layer and grader. Use when defining test plans, regression coverage, edge cases, E2E proof, or AI evaluation criteria.
---

**TESTS — Design High-Value Tests**

**Goal**
Prove the real requirement works with the smallest reliable test set.

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

**4. Pick the cheapest valid layer**

**unit → integration → RLS/security → API/provider → browser/E2E → production**
Use E2E only when the risk crosses system boundaries.

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

**Output**

**Success criteria**
What must be proven.

**Test plan**
Smallest ordered set.

**Cases**

**scenario → expected result → layer → assertion/grader**

**Gaps**
Anything still unproven.

**Next step**
Highest-value test first.

**Rules**
- Real requirements over coverage.
- Deterministic grading first.
- Test failure/recovery for critical writes.
- Never claim production proof from unit/CI results alone.
