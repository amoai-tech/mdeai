---
name: plan
description: Creates the smallest correct implementation plan from verified current truth without implementing it. Use when work needs sequencing, scope, dependencies, architecture fit, risks, files, and verification before coding.
---

**PLAN — Implementation Planning**

**Goal**
Create the smallest correct implementation plan. Do not implement unless explicitly asked.

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

**Output**

**Outcome**
What changes for the user/system.

**Current truth**
Only facts that affect the plan.

**Better approach**
Simpler/faster path if one exists.

**Implementation**
Ordered steps.

**Files/systems**
Exact touch points when known.

**Risks**
Only material blockers/failure modes.

**Verification**
How each outcome is proven.

**Done when**
Observable completion condition.

**Next step**
First implementation action.

**Rules**
- Plan only required work.
- Current truth beats stale docs.
- Do not invent file paths.
- Reuse before custom work.
- Do not implement unless explicitly asked.
