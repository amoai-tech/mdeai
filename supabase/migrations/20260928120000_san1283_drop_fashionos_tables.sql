-- SAN-1283 · REMOVE — drop the eight foreign FashionOS tables from `public`
--
-- DECISION: REMOVE (not RETAIN-ISOLATED).
--
-- WHY REMOVE — measured read-only against production `zkwcbyxiwklihegjhuql` on 2026-09-28:
--
--   * The eight tables are a CLOSED ISLAND. Every foreign key is internal to the
--     fashionos_* cluster. No MDE table references them and they reference no MDE table:
--
--       fashionos_people         → fashionos_companies
--       fashionos_leads          → fashionos_sources, fashionos_companies, fashionos_people
--       fashionos_lead_events    → fashionos_leads
--       fashionos_outreach_drafts→ fashionos_leads
--
--     The remaining three (fashionos_activity_log, fashionos_workflow_runs,
--     fashionos_sources) have no foreign keys in either direction.
--
--   * Zero views, zero functions, zero triggers and zero publications reference them.
--   * Zero repository callers: `grep -ri fashionos src/ scripts/ supabase/functions/` → 0 files.
--   * No `anon` or `authenticated` grants — the exposure was already closed by
--     20260920120000_fashionos_rls_and_revoke.sql, which is why this is an ownership
--     decision and no longer a security incident.
--   * RLS is enabled with ZERO policies (default-deny), so even `service_role` was the only
--     role with access, and only because it carries BYPASSRLS.
--   * Total data is negligible and entirely foreign to this product (18 rows across eight
--     tables: activity_log 9, leads 2, lead_events 2, outreach_drafts 2, sources 2,
--     workflow_runs 1, companies 0, people 0).
--
-- RETAIN-ISOLATED was rejected: retention was chosen for safety when the exposure was live.
-- With exposure closed, zero consumers and an island graph, retaining buys nothing and leaves
-- eight dead relations that will keep appearing in schema audits, drift reports and
-- `information_schema` diffs — which is the condition SAN-1283 exists to remove.
--
-- RESTRICT, NOT CASCADE — deliberately.
-- `RESTRICT` fails loudly if any dependency appears between the decision and the apply. That
-- converts an unnoticed dependency into an error instead of silently deleting a neighbour.
-- Measured today there is nothing to cascade to; the guard is there for the gap between
-- measurement and execution.
--
-- ONE ATOMIC STATEMENT
-- All eight tables are dropped in a single `DROP TABLE`, so the cluster is removed as a unit.
-- Because every foreign key is internal to the set, PostgreSQL resolves the ordering; the
-- children are still listed first for readability.
--
-- ⚠️ OPERATOR ACTION BEFORE APPLYING TO PRODUCTION — NOT COMMITTED HERE
-- These tables hold third-party personal data (`fashionos_people.name/email/phone`,
-- `fashionos_leads`). If this data must be recoverable, take a dump to a SECURE LOCATION
-- OUTSIDE THIS REPOSITORY before applying:
--
--     supabase db dump --data-only \
--       -t public.fashionos_activity_log -t public.fashionos_companies \
--       -t public.fashionos_lead_events -t public.fashionos_leads \
--       -t public.fashionos_outreach_drafts -t public.fashionos_people \
--       -t public.fashionos_sources -t public.fashionos_workflow_runs \
--       -f /secure/off-repo/san1283-fashionos-$(date +%F).sql
--
-- Do NOT commit that file, attach it to Linear, or paste it into a PR. `DROP ... RESTRICT`
-- makes an unnoticed dependency fail; it does not make deleted rows recoverable.
--
-- IDEMPOTENT: `IF EXISTS` makes a re-run a no-op, matching the style of the migration that
-- closed the exposure (20260920120000_fashionos_rls_and_revoke.sql).

drop table if exists
  public.fashionos_lead_events,
  public.fashionos_outreach_drafts,
  public.fashionos_leads,
  public.fashionos_people,
  public.fashionos_activity_log,
  public.fashionos_sources,
  public.fashionos_workflow_runs,
  public.fashionos_companies
restrict;
