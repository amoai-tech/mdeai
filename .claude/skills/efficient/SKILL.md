---
name: efficient
description: Use when the user wants a faster, simpler, or cheaper way to deliver an MDE outcome; finds the smallest safe approach that reuses existing capabilities.
---

**EFFICIENT — Smallest Safe Path**

**Goal**
Complete the task with the least unnecessary work while preserving correctness, security, and maintainability.

**Rules**
- Always ask: **Is there a better, faster, simpler, safer, or more efficient way to complete this?**
- If yes, use it.
- Verify current project/runtime truth before designing new work.
- Prefer reuse over new code.
- Do not duplicate services, schemas, state, utilities, agents, workflows, or infrastructure.
- Do not inspect, research, test, or modify unrelated areas.
- Do not over-engineer for hypothetical future needs.
- Do not trade correctness or security for speed.

**Preferred order**

**existing implementation → configuration → installed/vendor capability → official SDK/module → official example/template → minimal custom code**

Use custom code only for the remaining gap.

**Research**
Research only when external/current behavior affects the decision.
Prefer:
1. installed source/types
2. official docs
3. official repository/examples
4. maintained first-party references

For every important external reference used:

**URL → COPY / ADAPT / MODEL / REFERENCE ONLY → exact destination → verification**

Do not create link dumps.

**Implementation**
- Make the smallest focused change.
- Preserve existing contracts and sources of truth.
- Reuse existing tests/components/functions where possible.
- Delete superseded or duplicated logic when safe.
- Avoid unrelated refactors.

**Verification**
Use the cheapest reliable proof first:

**focused test → integration/security test → typecheck/lint → build → browser/E2E → production proof when required**

Stop when the required outcome is proven.
Do not run broad expensive checks without a reason.

**Decision**
Before finishing, state:
- simpler/faster approach used
- custom work avoided
- remaining risk or blocker
- single highest-value next step

Do not claim 100% correct or production-ready without evidence.
