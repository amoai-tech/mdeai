---
name: supabase-review
description: Review MDE Supabase schema, migrations, RLS, RPCs, functions, grants, Auth, Storage and service-role boundaries for material security and data-integrity defects.
metadata:
  owner: SAN-1312
  version: "1.0.0-mde.1"
---

# Supabase PR Review

## Source of truth

1. Changed MDE SQL/functions/tests and current migrations/schema.
2. Generated types and actual caller code.
3. Canonical MDE .claude/skills/supabase/SKILL.md and project rules.
4. Current official Supabase/Postgres documentation.

## Review invariants

- RLS stays enabled and ownership/tenant predicates remain server-enforced.
- User A must not read, update, delete or create data as User B unless explicitly authorized.
- Never expose service-role credentials or use service role as a client authorization shortcut.
- SECURITY DEFINER functions require deliberate ownership, grants and safe search_path.
- RPCs must derive/verify caller authority rather than trust user-supplied ownership IDs.
- Grants/revokes must preserve least privilege.
- Migrations must be ordered, replay-aware and safe for the repository's migration workflow.
- Schema changes must keep generated types/callers aligned where required.
- Storage policies and signed URL paths must enforce the same ownership model as database rows.

For RLS/auth findings include:
- Fix: the smallest policy/RPC boundary correction.
- Verification: authenticated User A vs User B positive/negative proof plus targeted migration/policy tests.
- Expected result: owner access succeeds and foreign access fails deterministically.
