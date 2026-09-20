-- Close the fashionos_* public-schema exposure
--
-- THE DEFECT
-- 20260628050558_fashionos_lead_finder_mvp_namespaced.sql created eight tables in the `public`
-- schema with no RLS and no explicit grants. `public` is an exposed schema, and Supabase's
-- default ACL for objects created by `postgres` in `public` granted ALL to anon, authenticated
-- and service_role. That default is the same mechanism Batch 0A removed for FUTURE functions
-- and that Batches 0B/0C cleaned up per-object; these tables were never revisited.
--
-- Confirmed on production (read-only, 2026-09-20) — for all eight tables:
--
--   has_table_privilege('anon', oid, 'SELECT'|'INSERT'|'UPDATE'|'DELETE') = true
--   relrowsecurity = false
--
-- and they hold data (fashionos_activity_log 9 rows, fashionos_leads 2, fashionos_outreach_drafts
-- 2, fashionos_lead_events 2, fashionos_sources 2, fashionos_workflow_runs 1). Anyone holding the
-- project's publishable/anon key could therefore read AND write them over PostgREST, including
-- personal data: fashionos_people.name/email/phone and fashionos_leads.
--
-- Nothing in this repository uses them. A search for "fashionos" across `src/`,
-- `supabase/functions/` and `scripts/` returns no caller, and the only file that mentions them
-- is the migration that created them plus the supabase README. Despite the migration's
-- "_namespaced" name the tables are prefix-namespaced, not schema-namespaced, so they landed in
-- the API-exposed schema.
--
-- THE FIX — RLS *and* a REVOKE
-- `enable row level security` with no policy is a default-deny for anon/authenticated. The
-- REVOKE goes further and removes the tables from the Data API surface entirely, so a future
-- policy added by mistake cannot silently re-open them. `service_role` is deliberately left
-- with access: it carries BYPASSRLS, and any backend pipeline that owns this data should reach
-- it through the service role rather than the public API.
--
-- No policies are created on purpose. If this data is ever surfaced to end users it needs a
-- deliberate access model (owner column + policy, or a security-definer accessor), not an
-- accidental one.
--
-- SPATIAL_REF_SYS IS DELIBERATELY EXCLUDED
-- Security Advisor lint 0013 also flags `public.spatial_ref_sys`, but that table is owned by the
-- `postgis` extension (`pg_depend.deptype = 'e'`). Altering an extension-owned table risks
-- breaking PostGIS, and the correct remediation for it is moving PostGIS out of `public`
-- (Advisor lint 0014), not enabling RLS on it. Left untouched here.
--
-- IDEMPOTENT: `enable row level security` and `revoke` are both re-runnable no-ops.

-- Personal / lead-gen data: default-deny for end-user roles, service_role retained.
alter table public.fashionos_activity_log    enable row level security;
alter table public.fashionos_companies       enable row level security;
alter table public.fashionos_lead_events     enable row level security;
alter table public.fashionos_leads           enable row level security;
alter table public.fashionos_outreach_drafts enable row level security;
alter table public.fashionos_people          enable row level security;
alter table public.fashionos_sources         enable row level security;
alter table public.fashionos_workflow_runs   enable row level security;

-- Remove them from the Data API surface as well as the row-visibility layer.
revoke all on table public.fashionos_activity_log    from public, anon, authenticated;
revoke all on table public.fashionos_companies       from public, anon, authenticated;
revoke all on table public.fashionos_lead_events     from public, anon, authenticated;
revoke all on table public.fashionos_leads           from public, anon, authenticated;
revoke all on table public.fashionos_outreach_drafts from public, anon, authenticated;
revoke all on table public.fashionos_people          from public, anon, authenticated;
revoke all on table public.fashionos_sources         from public, anon, authenticated;
revoke all on table public.fashionos_workflow_runs   from public, anon, authenticated;
