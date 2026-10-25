---
name: linear-audit
description: Audits a Linear task against current code, runtime, dependencies, and product requirements to make it correct and implementation-ready. Use when reviewing whether an existing Linear task is current, complete, blocked, stale, or obsolete.
---

**LINEAR AUDIT — Verify Task Readiness**

**Goal**
Audit one Linear task against current code/runtime and make the task correct, complete, and implementation-ready.
Audit only unless explicitly asked to implement.

**Mandatory naming**
Always use:

**SAN-#### · Exact Linear Task Name**

**1. Verify the task**
Check:
- exact title/status/labels
- parent/dependencies/blockers
- acceptance criteria
- comments/linked PRs

**2. Verify current truth**
Inspect only the load-bearing implementation:
- current main
- relevant routes/services/components
- schema/RLS/functions when relevant
- runtime/production when required
Classify:
- ✅ Verified
- 🟡 Partial
- 🔴 Blocker
- ❌ Stale/incorrect
- ❓ Needs evidence

**3. Compare task vs reality**
Find:
- already implemented work
- missing steps
- stale assumptions
- wrong dependencies
- duplicate tasks/systems
- unverifiable acceptance criteria

**4. Improve the approach**
Ask:
> Is there a better, faster, simpler, safer, or more efficient way to complete this?
Prefer reuse and the current canonical workflow.

**5. Rewrite the task**
Produce one clean plan:

**outcome → current truth → ordered implementation → acceptance → verification → blockers**
Use exact files/systems only when verified.

**Output**

**Verdict**
Ready / Needs changes / Blocked / Obsolete.

**Current truth**
Verified state.

**Problems**
Only material gaps/errors.

**Better approach**
Simpler path.

**Updated task**
Clean copy/paste-ready task.

**Dependencies**
Full Linear task names.

**Verification**
Proof required for Done.

**Next step**
Highest-value action.

**Rules**
- Do not implement.
- No arbitrary scores.
- No stale project-specific boilerplate.
- Current implementation beats old task text.
