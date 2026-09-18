-- SAN-1284 · Batch 0A — make function exposure opt-in for new public functions
--
-- SCOPE: default privileges only. This migration deliberately does NOT touch the ACL of
-- any existing function. Cleaning those up is Batch 0B/0C/1/2, per the task split.
--
-- ─────────────────────────────────────────────────────────────────────────────────
-- WHY THE OBVIOUS FORM DOES NOT WORK (and this one does)
-- ─────────────────────────────────────────────────────────────────────────────────
-- Production had these default privileges for functions created by `postgres` in
-- `public`:
--
--     {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- so every new function automatically became executable by anon and authenticated.
--
-- The schema-scoped form of the PUBLIC revoke — which Supabase's own guidance shows,
-- and which this migration originally used — is NOT sufficient:
--
--     alter default privileges in schema public revoke execute on functions from public;
--
-- Measured on a local stack and on production (rolled back): after that statement a new
-- function still had `proacl = NULL`, effective ACL
-- `{=X/postgres,postgres=X/postgres}`, and `has_function_privilege('anon', …, 'EXECUTE')
-- = TRUE`. The reason is that PostgreSQL grants EXECUTE to PUBLIC on functions as a
-- BUILT-IN default, and a schema-scoped default-privilege revoke does not clear it.
--
-- The working form is the GLOBAL revoke, with the creator role named explicitly:
--
--     alter default privileges for role postgres revoke execute on functions from public;
--
-- Verified after that statement: pg_default_acl gained a global row
-- `<GLOBAL> -> {postgres=X/postgres}`, and a newly created function came back with
-- `proacl = {postgres=X/postgres}` and anon/authenticated/service_role all FALSE.
--
-- Two details that both matter:
--   * `FOR ROLE postgres` — without it the statement targets whatever role runs the
--     migration, so a non-postgres runner would leave postgres' permissive defaults
--     intact and the fix would silently do nothing.
--   * no `IN SCHEMA public` on the PUBLIC revoke — the built-in PUBLIC grant is global,
--     so the revoke has to be global too. The role grants below stay schema-scoped
--     because they were recorded that way.
--
-- NOTE ON BREADTH: the global row applies to functions `postgres` creates in any schema
-- that has no more specific default row of its own. That is intended — secure by default
-- — and it does not affect schemas that already define their own row (e.g. `storage`),
-- which keep their existing defaults.
--
-- Note for Batch 0B: this is not retroactive. Existing functions keep their current ACLs,
-- so the 21 functions where the replay is more permissive than production (notably
-- ticket_payment_refund, ticket_payment_finalize, p1_* rental writes) still need
-- per-function revokes, driven by the replay-vs-production diff. See the task record.
-- ─────────────────────────────────────────────────────────────────────────────────

-- 1. Clear the BUILT-IN PUBLIC grant for functions created by postgres. Global, not
--    schema-scoped — this is the statement that actually fixes recurrence.
alter default privileges for role postgres
  revoke execute on functions from public;

-- 2. Remove the recorded Data API role grants for schema public, so `anon`,
--    `authenticated` and `service_role` are no longer added automatically.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;

alter default privileges for role postgres in schema public
  revoke execute on functions from authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from service_role;
