---
name: linear-task
description: Use when creating, rewriting, or improving a Linear issue; creates or cleans up one executable Linear task with current truth, ordered implementation steps, acceptance criteria, dependencies, and verification.
---

**LINEAR TASK — Create or Clean One Task**

**Goal**
Create or rewrite one executable Linear task from current truth.

**Mandatory naming**
Always use:

**SAN-#### · Exact Linear Task Name**
Never use a Linear ID alone.

**1. Verify current state**
Check:
- exact task title/status/labels
- parent/dependencies/blockers
- linked PRs/comments
- current implementation/runtime
- Supabase/live state only when relevant
Current truth beats stale task text.

**2. Define the outcome**
State the real user/business result.
Separate:
- in scope
- out of scope
- blocker vs supporting work
Do not create a new task when an existing task clearly owns the work.

**3. Find the fastest safe approach**
Ask:
> Is there a better, faster, simpler, safer, or more efficient way to complete this?
Prefer:

**reuse → configure → adapt → minimal change → verify**

**4. Write ordered implementation steps**
Use exact files/functions/routes/components/migrations/RLS/RPCs when known.
Each step should produce an observable result.

**5. Define acceptance**
Criteria must be:
- specific
- observable
- testable
- tied to the task outcome
Avoid vague “works correctly.”

**6. Define verification**
Use only needed proof:

**focused tests → RLS/integration → typecheck/lint → build → E2E → production**

**Task format**

**Description**
Why this matters and expected outcome.

**Current truth**
Only verified facts.


For remaining steps, checks, and examples, see [full prompt](references/full-prompt.md).
