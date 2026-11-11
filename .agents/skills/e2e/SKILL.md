---
name: e2e
description: Use when proving an end-to-end workflow, retry behavior, failure handling, cross-user isolation, or durable success; verifies a complete real user journey across UI, backend, authorization, persistence, providers, and final outcome.
---

**E2E — Prove the Real User Journey**

**Goal**
Verify a complete workflow across UI, backend, auth, data, providers, and final user-visible outcome.

**1. Define the journey**
State the exact:

**user action → expected final result**
Identify environment and release/branch under test.

**2. Verify prerequisites**
Check only relevant:
- deployment/version
- auth/test account
- schema/config/provider
- required real/representative data

**3. Trace the full path**
Verify:

**UI → server/API → auth/RLS → DB → agent/tool/provider → persisted result → final UI/operator outcome**
Do not stop at UI success.

**4. Test critical failure modes**
When relevant:
- unauthorized/cross-user
- invalid input
- retry/double-click
- concurrency
- provider failure/timeout
- partial failure
- false success
- refresh/read-back
- mobile

**5. Verify durable truth**
Compare:

**request → persisted state → read-back → visible result**
For writes prove retries do not duplicate.

**6. Diagnose failures**
Use:

**evidence → failing step → root cause → smallest fix**
If authorized, fix then rerun the complete path.

**Output**

**Verdict**
✅ PASS / 🟡 PARTIAL / 🔴 FAIL

**Journey**
Exact path tested.

**Evidence**
Observed/persisted proof.

**Failures**
Root cause and fix.

**Security/retry**
Relevant isolation/idempotency proof.

**Unproven**
Anything not verified.

**Next step**
Highest-value action.

**Rules**
- CI is not E2E proof.
- Optimistic UI is not persistence proof.
- Test the exact environment that matters.
