# Supabase review invariants

## Source of truth

1. Changed MDE SQL/functions/tests and current migrations/schema.
2. Generated types and actual caller code.
3. Canonical `supabase/SKILL.md` and project rules.
4. Current official Supabase/Postgres documentation.

## Review invariants

- RLS stays enabled and ownership/tenant predicates remain server-enforced.
- User A must not read, update, delete or create data as User B unless explicitly authorized.
- Never expose service-role credentials or use service role as a client authorization shortcut.
- SECURITY DEFINER functions require deliberate ownership, grants, and safe `search_path`.
- RPCs must derive/verify caller authority rather than trust user-supplied ownership IDs.
- Grants/revokes must preserve least privilege.
- Migrations must be ordered, replay-aware, and safe for the repository migration workflow.
- Schema changes must keep generated types/callers aligned where required.
- Storage policies and signed URL paths must enforce the same ownership model as database rows.

For RLS/auth findings, require authenticated User A vs User B positive/negative proof: owner access succeeds and foreign access fails deterministically.
