---
name: errors
description: Use for an actual failing test, broken workflow, or runtime error (e.g. Gemini follow-up failure); reproduce and diagnose the smallest root-cause fix. Not for generic technical explanations with no reported failure.
---

**ERRORS — Diagnose & Fix Failures**

**Goal**
Find the real root cause of a concrete failure and identify the smallest safe fix.
Read-only by default; modify only when explicitly asked.

**Use / do not use:** Use for “Why does Ask MDE lose filtered rental cards after refresh?” Do **not** use for “Explain HTTP 404” without an actual MDE failure; reserve `systematic-debugging` for deeper methodology when a bounded investigation is insufficient.

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

**Hypothesis-driven investigation (P Stack + Matt Pocock):** First build the tightest pass/fail signal you can for the failure (failing test, request replay, or a one-command repro); everything else consumes it. Then write **observed failure → one falsifiable hypothesis → cheapest discriminating check → result**. If the check rejects the hypothesis, revise it; do not stack speculative fixes. Distinguish a real reproduction from an inferred explanation. When possible capture a failing regression test before the change and verify it passes after. If reproduction is blocked, record the exact missing evidence rather than inventing a root cause. Redact secrets, tokens and auth headers from any command output you quote.

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

**Stop when:** For a diagnosis-only request, the confirmed root cause and minimal corrective action are supported by evidence (or the unknown is stated). For a requested fix, also verify the original failure no longer occurs, a regression covers it, and applicable security checks hold. Do not require exhaustive unrelated inspection.

**Output**

**Verdict**
Root cause confirmed / Needs evidence.

**Root cause**
One concise explanation.


For remaining steps, checks, and examples, see [full prompt](references/full-prompt.md).
