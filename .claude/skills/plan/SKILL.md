---
name: plan
description: Use for explicit planning without code (e.g. event ticket receipt fix plan); sequence existing owners, risks, and proof. Not for implementing an already-specified task or answering a simple fact.
---

**PLAN — Implementation Planning**

**Goal**
Create the smallest correct implementation plan. Do not implement unless explicitly asked.

**Use / do not use:** Use for “Plan how to fix event ticket receipts without modifying code.” Do **not** use when asked to implement an already-specified Linear task (use `implement`) or for a one-line factual question.

**1. Define the outcome**
State:
- real user/business result
- in scope / out of scope
- constraints and dependencies
- observable Done condition
- Success criteria

**2. Verify current truth**
Inspect only relevant:
- current repo/routes/services
- schema/RLS when needed
- linked Linear/PRs
- installed packages/APIs
- production/runtime when the plan depends on it
Do not plan from stale task text when live truth exists.

**Requirements clarity (Matt Pocock):** Check whether the user already supplied the decision, acceptance criteria or a verified Linear issue. Only ask a focused question when an unresolved product choice would change implementation; otherwise identify a grounded default and proceed. Record non-obvious decisions using existing MDE docs rather than producing a fresh document by default.

**3. Find the fastest safe path**
Prefer:

**reuse → configure → adapt installed/vendor capability → official supported pattern → minimal custom code**
Avoid duplicate services, schemas, state, search, validation, or workflows.

**4. Check architecture fit**
Identify:
- existing source of truth
- existing module/service/schema/workflow to extend
- boundaries and ownership
- auth/RLS implications
- write/idempotency/failure behavior

**Default shape:** When scope and acceptance are already known, return **outcome → existing owner → smallest ordered changes → focused verification → blocker, if any**. Do not re-interview the owner, duplicate Linear issues, or produce a new PRD for an implementation-ready task.

**5. Build one ordered plan**
For each step state:
- outcome
- exact file/function/route/component/migration when known
- dependencies
- failure/security concern
- verification
Create subtasks only when they are independently executable.

**6. Plan proof**
Use the smallest proof:

**focused test → integration/RLS → typecheck/lint → build → browser/E2E → production**
Map acceptance criteria to evidence.

**Stop when:** The plan maps the requested outcome to existing owners, dependencies, a short executable order and observable proof; unknown material decisions are labeled, not guessed. Do not turn planning into coding unless asked.

**Output**

**Outcome**
What changes for the user/system.

**Current truth**
Only facts that affect the plan.


For remaining steps, checks, and examples, see [full prompt](references/full-prompt.md).
