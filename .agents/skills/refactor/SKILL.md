---
name: refactor
description: Use when simplifying existing code while preserving its observable behavior; removes avoidable coupling and duplication using focused regression evidence.
---

**REFACTOR — Simplify Without Changing Behavior**

**Goal**
Improve structure/maintainability while preserving intended behavior.

**1. Understand behavior**
Inspect:
- current workflow
- direct dependencies
- contracts/APIs
- relevant tests
Define what must remain unchanged.

**2. Find worthwhile debt**
Look for:
- duplication
- oversized functions/files
- mixed responsibilities
- dead code
- unnecessary coupling/state
- confusing control flow

**3. Choose the smallest refactor**
Prefer:

**delete dead code → reuse existing abstraction → extract focused unit → simplify flow → minimal new abstraction**
Avoid rewrites and speculative frameworks.

**4. Preserve contracts**
Keep stable unless the task explicitly changes them:
- public APIs
- persisted data
- auth/RLS behavior
- error semantics
- user-visible behavior

**5. Verify**
Use the cheapest proof:

**focused regression tests → typecheck/lint → build → E2E if behavior crosses boundaries**
If a bug is discovered, report it separately; fix only if authorized or required.

**Output**

**Refactored**
What changed.

**Structure**
Why it is simpler.

**Behavior**
What was preserved.

**Verification**
Tests/checks.

**Remaining issues**
Only material debt left.

**Verdict**
Safe / Needs follow-up.

**Next step**
Highest-value action.

**Rules**
- Behavior preservation first.
- No unrelated churn.
- Prefer fewer abstractions.
- Delete superseded logic when safe.
