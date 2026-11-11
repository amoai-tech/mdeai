---
name: supabase
description: Reviews Supabase schema, RLS, grants, functions, triggers, Edge Functions, auth, data integrity, and source-to-production drift. Use when Supabase or Postgres backend behavior, security, or schema is involved.
---

**SUPABASE — Database & Security Review**

**Goal**
Inspect the relevant Supabase path and identify the smallest safe change using live/current truth.

**1. Verify current state**
Check only relevant:
- repo migrations/schema
- live schema when available
- tables/constraints/indexes
- RLS/policies/grants
- functions/RPCs/triggers
- Edge Functions/auth
- source vs production drift
Do not create a new table/function before checking the canonical system.

**2. Trace the data flow**
Follow:

**client/server call → auth → RLS/grant → function/table → persisted state → read-back**
Identify the canonical owner/writer for each important fact.

**3. Check security**
Verify when relevant:
- RLS enabled where required
- tenant/user isolation
- anon/authenticated grants
- SECURITY DEFINER search_path and authorization
- service-role keys remain server-side
- RPC/Edge Function exposure

**4. Check data integrity**
Look for:
- missing constraints
- duplicate/orphan data
- unsafe retries
- non-atomic multi-write flows
- stale triggers/functions
- source/live migration drift
- synthetic/test-data leakage

**5. Choose the smallest safe fix**
Prefer:

**existing schema/function/policy → configure/extend → minimal migration/function**
Avoid duplicate state or parallel backend paths.

**6. Verify**
Use:

**SQL/invariant checks → RLS/auth tests → integration → app workflow → production smoke when required**
For writes prove authorized success, unauthorized failure, persistence, and retry safety.

**Output**

**Verdict**
Safe / Needs changes / Blocked.

**Current truth**
Relevant live/repo facts.

**Security/data risks**
Only material issues.

**Fix**
Smallest safe change.

**Migration impact**
Required schema/data rollout.

**Verification**
Exact checks.

**Next step**
Highest-value action.

**Rules**
- Live truth matters when DB behavior matters.
- Never expose service-role credentials.
- Preserve RLS/isolation.
- No new DB objects without checking existing canonical support.
