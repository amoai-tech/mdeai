---
name: errors
description: Diagnoses concrete bugs, failing tests, runtime errors, broken workflows, and production failures to identify the root cause and smallest safe fix. Use when something is failing or behaving incorrectly.
---

**ERRORS — Diagnose & Fix Failures**

**Goal**
Find the real root cause of a concrete failure and identify the smallest safe fix.
Read-only by default; modify only when explicitly asked.

**1. Reproduce/confirm**
Capture:
- exact failure
- affected user/workflow
- environment/version
- reliable reproduction or evidence
Do not debug from assumptions.

**2. Inspect the load-bearing path**
Trace only relevant:

**user action → UI → backend/service → auth/RLS → DB/provider → returned state**
Check logs/tests/config only when they can explain the failure.

**3. Diagnose**
For each material finding state:

**evidence → root cause → user impact → exact fix**
Check when relevant:
- auth/RLS/isolation
- stale state/races
- retries/idempotency
- validation/error handling
- source/schema/config drift
- unsupported APIs
- false-positive/missing tests

**4. Choose the smallest fix**
Prefer:

**existing path/config correction → focused code change → minimal new logic**
Avoid unrelated refactors.

**5. Fix if authorized**
If the user asked to fix:
- change only affected code
- preserve contracts
- add regression coverage
- reread the changed path

**6. Verify the workflow**
Use:

**focused regression → integration/RLS → typecheck/lint → build → E2E/production when required**
Verify the original failure no longer occurs.

**Output**

**Verdict**
Root cause confirmed / Needs evidence.

**Root cause**
One concise explanation.

**Findings**
Evidence and impact.

**Fix**
Smallest safe correction.

**Verification**
Exact proof.

**Next step**
Highest-value action.

**Rules**
- Root cause before patch.
- Unknown stays unknown.
- Do not “fix” symptoms only.
- No broad cleanup unless required.
