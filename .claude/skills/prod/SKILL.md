---
name: prod
description: Use when deciding whether a release is truly production-ready; certifies the exact deployed production release by checking source-to-production parity, critical journeys, security, reliability, recovery, and drift.
---

**PROD — Production Certification**

**Goal**
Certify the exact deployed release and real production journey. This is verification, not planning.

**1. Identify the release**
Verify:
- commit/release/deployment
- production environment
- schema/migration version
- provider/config version

**2. Check source-to-production parity**
Verify relevant:
- deployed commit
- migrations/schema
- RLS/grants/functions
- env/config/providers
- required services/data
- no local-only dependency

**3. Prove critical journeys**
Run the real production path:

**user action → authorization → backend/provider → persisted/transaction state → final outcome**
Synthetic-only proof is insufficient when real certification is required.

**4. Verify security**
Check:
- authorized access succeeds
- unauthorized/cross-user fails
- privileged actions remain server-side
- RLS/grants enforce isolation
- no service-role exposure

**5. Verify reliability**
When relevant:
- retry/webhook replay idempotent
- concurrency safe
- partial failure recoverable
- no false success
- refresh/read-back matches durable truth

**6. Verify operations**
Check only relevant:
- logs/diagnostics
- alerts for critical failure
- rollback/recovery path
- provider failure behavior
- test/synthetic contamination
- source/schema/config drift

**Output**

**Verdict**
✅ Certified / 🟡 Conditional / 🔴 Failed

**Release**
Exact deployed version.


For remaining steps, checks, and examples, see [full prompt](references/full-prompt.md).
