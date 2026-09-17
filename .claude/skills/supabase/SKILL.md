---
name: supabase
description: >-
  Use for any MDE request clearly involving Supabase, including Database, Auth, RLS, migrations, RPC/functions, Realtime, Storage, pgvector, Edge Functions, logs, live database behavior, Postgres schema/SQL/indexes/locking/performance/tenant isolation, and Supabase-specific bugs/errors/failures. Known Supabase/RLS failures stay with this domain owner rather than generic systematic-debugging.
metadata:
  mde-version: "2.0.0"
  upstream-commit: "8331f910845103c08d51f6ca1d86ebb7d1f745e3"
  verified-package: "@supabase/supabase-js ^2.106.1"
---

# Supabase — official upstream + MDE overlay

## Source order

1. Inspect current MDE schema, migrations, Supabase clients, generated types, and live read-only state when authorized.
2. Read `references/official/supabase/SKILL.md` for current platform/security/CLI guidance.
3. For any Postgres change, also read `references/official/supabase-postgres-best-practices/SKILL.md` and the matching rule files.
4. Check current Supabase changelog/docs for version-sensitive behavior.
5. Apply MDE-specific project rules and invariants below.

Do not rely on remembered Supabase CLI/API/security behavior when current official guidance can prove it.

## Ownership

Own Supabase schema/migrations, RLS/Auth, database functions/RPCs, Realtime, Storage, pgvector, Edge Functions, live DB verification, and Postgres behavior. Domain skills own business rules; `stripe` owns payment semantics; `mastra` owns agent/workflow semantics.
## Current MDE invariants

- Every exposed table must have an explicit access model; RLS is the database boundary, not frontend filtering.
- Never authorize from user-editable metadata; use trusted app metadata or relational ownership.
- Never expose service-role/secret keys to browser code.
- Treat `SECURITY DEFINER`, storage policies, exposed views, and cross-tenant access as security-critical changes.
- UPDATE policies need both visibility and write checks; test allow and deny paths.
- Verify migration workflow from the repo before creating schema history; do not guess CLI commands or filenames.
- For S3/S4 database work, prove tenant deny cases, replay/idempotency where relevant, and actual live/read-only state when authorized.

## Workflow

1. Classify: schema/migration, RLS/Auth, RPC/function, Realtime, Storage, Edge Function, vector/search, or performance.
2. Load official Supabase guidance plus official Postgres rules for any SQL/schema work.
3. Load only the matching MDE reference/project rule already in this skill directory.
4. Inspect current migration/schema conventions before editing.
5. Make the smallest safe change; do not use privileged code to bypass an unexplained permission failure.
6. Verify positive and negative cases, then run advisors/tests when the environment supports them.

## MDE references

Preserve the existing MDE topic files and `references/project-rules/` for repository-specific conventions. Treat historical inventories or counts as stale unless current code/live state confirms them.

## Verification

For auth/RLS/storage/functions: prove authorized success and unauthorized denial. For migrations: prove ordering, replay safety, and schema state. For performance: use evidence such as EXPLAIN/advisors rather than intuition. S3/S4 changes require independent `code-review` and `task-verifier`.

## References

- `upstream.yaml`
- `references/official/supabase/SKILL.md`
- `references/official/supabase-postgres-best-practices/SKILL.md`
- `references/project-rules/`
- https://supabase.com/docs
- https://github.com/supabase/supabase
