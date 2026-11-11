---
name: migration
description: Designs or reviews safe database migrations, backfills, constraints, indexes, function changes, rollout order, and recovery. Use when changing database schema or production data and migration safety matters.
---

**MIGRATION — Safe Database Change**

**Goal**
Design or review a migration that preserves data integrity, security, compatibility, and recoverability.

**1. Verify current state**
Inspect:
- current/live schema
- migration history/pending migrations
- affected data shape/size
- existing constraints/indexes
- RLS/grants/functions/triggers
- application callers
Do not assume production is clean or matches local.

**2. Define the invariant**
State:
- desired final schema/data state
- compatibility requirements
- backfill need
- existing rows that may violate the new rule

**3. Prefer additive rollout**
Use when possible:

**preflight → additive schema → compatible app → backfill → enforce constraint/index → remove obsolete path later**
Avoid destructive one-step changes.

**4. Preflight data**
Check for:
- NULLs
- duplicates
- invalid values
- orphaned foreign keys
- malformed data
- conflicting keys/timestamps
Define deterministic cleanup. Unknown facts stay unknown.

**5. Backfill safely**
- use a canonical source
- make transformation deterministic/idempotent when practical
- batch large tables
- avoid long locks
- verify row counts/invariants
- surface rows that cannot be transformed safely

**6. Constraints/indexes/functions**
Before enforcement:
- remove violations deterministically
- avoid duplicate/redundant indexes/functions
- consider lock/build cost
- verify function signatures/grants/search_path
- verify triggers fire exactly as intended

**7. Security**
Confirm RLS/grants still enforce intended access after schema/function changes.

**8. Recovery**
Define:
- reversible vs irreversible steps
- forward-fix vs rollback
- partial execution cleanup
- safe resume
- backup/snapshot need
Do not call rollback safe if it can destroy data.

**9. Verify**

**migration test → invariant queries → RLS/security → integration → production smoke when required**
Prove the migration applies from the expected prior state.

**Output**

**Verdict**
🟢 Safe / 🟡 Safe after changes / 🔴 Unsafe

**Design**
Ordered migration steps.

**Data**
Preflight/backfill rules.

**Security**
RLS/grant/function impact.

**Recovery**
Failure/resume strategy.

**Verification**
Exact proof.

**Blockers**
Only unsafe conditions.

**Next step**
Highest-value action.

**Rules**
- Inspect data before enforcing new invariants.
- Prefer additive/backward-compatible changes.
- Deterministic cleanup only.
- Production path proof matters more than final schema appearance.
