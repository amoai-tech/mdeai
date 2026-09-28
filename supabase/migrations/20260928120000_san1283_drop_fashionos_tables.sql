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
--     pg_dump --data-only --no-owner --no-privileges \
--       --table public.fashionos_activity_log --table public.fashionos_companies \
--       --table public.fashionos_lead_events  --table public.fashionos_leads \
--       --table public.fashionos_outreach_drafts --table public.fashionos_people \
--       --table public.fashionos_sources      --table public.fashionos_workflow_runs \
--       --file /secure/off-repo/san1283-fashionos-$(date +%F).sql \
--       "$SUPABASE_DB_URL"
--
-- `pg_dump`, not `supabase db dump`: the CLI's dump command selects whole schemas
-- (`--schema`) or excludes `schema.table` pairs (`--exclude`); it has no per-table `-t`
-- flag, so the eight tables cannot be selected with it.
--
-- RESTORE PATH — a data-only dump is not self-contained. `--table` does not carry the table
-- definitions, so the dump cannot be restored into an empty database on its own. To recover:
--
--     1. re-apply 20260628050558_fashionos_lead_finder_mvp_namespaced.sql to recreate the
--        eight tables (and the migration that follows it for the RLS/revoke state), then
--     2. restore this data-only dump into those tables.
--
-- Recorded here because a backup whose restore path is undocumented is not a backup.
--
-- The connection string comes from the environment and is NEVER written here. Do NOT commit
-- the dump, attach it to Linear, or paste it into a PR — it is unmasked PII. `DROP ...
-- RESTRICT` makes an unnoticed dependency fail; it does not make deleted rows recoverable.
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
