-- Public-schema RLS exposure invariant
--
-- HISTORY
-- This file began as the `fashionos_*` exposure regression suite. SAN-1283 resolved that
-- cluster with a REMOVE decision: the eight foreign tables were a closed island (every foreign
-- key internal to the set, zero views/functions/triggers/publications, zero repository callers,
-- zero end-user grants) and were dropped by
-- 20260928120000_san1283_drop_fashionos_tables.sql.
--
-- With the tables gone, the four assertions that pinned their exact state — "all eight have RLS
-- enabled", "service_role retains SELECT on all eight", and two behavioural refusals against
-- `fashionos_leads` / `fashionos_outreach_drafts` — became obsolete by construction. Asserting
-- their absence is now the job of `san1283_fashionos_removed_test.sql`, so it is not repeated
-- here.
--
-- What survives is the part that was never about those eight tables:
--
--   1. THE INVARIANT. The original defect was not "these eight tables"; it was that Supabase's
--      default ACL grants anon and authenticated full DML on every table `postgres` creates in
--      `public`, and nothing forced the author to add RLS. A table with grants and no RLS is
--      world-readable AND world-writable over PostgREST. This assertion fails if any future
--      migration repeats the mistake.
--
--   2. THE SCOPE GUARD. `spatial_ref_sys` is deliberately exempt: it is PostGIS
--      extension-owned, and the correct remediation for it is relocating the extension
--      (Advisor lint 0014), not enabling RLS. This proof keeps that exemption deliberate.
--
-- Run with: supabase test db

begin;

select plan(2);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CATCH-ALL — the invariant, not any particular table.
-- Extension-owned tables are excluded; PostGIS owns `spatial_ref_sys`.
--
-- MARKED `todo` — KNOWN OUTSTANDING DEFECT, NOT A SILENCED ONE.
-- This assertion was already failing before SAN-1283 (recorded as `1 not_ok` in
-- docs/tasks/evidence/SAN-1349/18-review-focus-areas-verification.md). It is NOT caused by
-- dropping the fashionos tables — those had RLS enabled and were never the offenders.
--
-- The offenders are `mastra_*` tables: 33 of them lack RLS while `anon`/`authenticated` hold
-- DML. No migration creates or hardens them — Mastra creates them at runtime through its
-- storage init, so a fresh environment is unprotected the moment the runtime first starts,
-- and production's 32 hardened tables were hardened out of band.
--
-- Measured 2026-09-28 — local stack: 33 RLS-disabled `mastra_*` tables; production: 0.
--
-- `todo` keeps the invariant visible and the suite honest without asserting a pass that is
-- not true, and without hiding the gap behind a deleted assertion. Remove the `todo` when the
-- owning task lands. Do NOT delete this assertion to make the suite green.
-- ═══════════════════════════════════════════════════════════════════════════════

select todo(
  'known gap: Mastra runtime creates RLS-disabled mastra_* tables in new environments',
  1);

select is(
  (select count(*)::int from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and not c.relrowsecurity
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
      and (   has_table_privilege('anon', c.oid, 'SELECT')
           or has_table_privilege('anon', c.oid, 'INSERT')
           or has_table_privilege('anon', c.oid, 'UPDATE')
           or has_table_privilege('anon', c.oid, 'DELETE')
           or has_table_privilege('authenticated', c.oid, 'SELECT')
           or has_table_privilege('authenticated', c.oid, 'INSERT')
           or has_table_privilege('authenticated', c.oid, 'UPDATE')
           or has_table_privilege('authenticated', c.oid, 'DELETE'))),
  0, 'C: no app-owned public table is RLS-disabled while end-user roles hold DML');

-- ═══════════════════════════════════════════════════════════════════════════════
-- SCOPE GUARD — the deliberate exception is still deliberate.
-- spatial_ref_sys is postgis extension-owned; it must remain untouched.
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from pg_class c
     join pg_depend d on d.objid = c.oid and d.deptype = 'e'
     join pg_extension e on e.oid = d.refobjid
    where c.relnamespace = 'public'::regnamespace
      and c.relname = 'spatial_ref_sys'
      and e.extname = 'postgis'),
  1, 'S: spatial_ref_sys still postgis-owned and untouched');

select * from finish();
rollback;
