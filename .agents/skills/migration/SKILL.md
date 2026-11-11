---
name: migration
description: Use when changing database schema or production data and migration safety matters; designs or reviews safe database migrations, backfills, constraints, indexes, function changes, rollout order, and recovery.
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


For remaining steps, checks, and examples, see [full prompt](references/full-prompt.md).
