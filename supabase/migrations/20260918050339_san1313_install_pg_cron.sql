-- SAN-1313 · B1 — canonical pg_cron installation (replay contract)
--
-- WHY
-- Production has `pg_cron` installed and a `cron` schema holding 5 live scheduled jobs,
-- but NO migration in this repository installs it. A database rebuilt from
-- supabase/migrations/** therefore has no `cron` schema at all, and every cron-aware
-- migration silently takes its "pg_cron not installed" branch. This is the drift that
-- made SAN-1306's cron work unverifiable on a fresh replay.
--
-- SCOPE — EXTENSION AND PRIVILEGES ONLY. This migration deliberately does NOT:
--   * drop the 8 dead agent_jobs functions   → SAN-1313 Migration A, separate approval
--   * create or alter any cron schedule      → SAN-1313 B2
--   * touch `chat-archive-abandoned`         → retire-or-migrate decision still pending
-- Keeping B1 to the extension alone means it is schema-state preserving on production,
-- where pg_cron already exists, and gives B2 a clean base to declare schedules from.
--
-- VERSION PINNING: deliberately omitted. Supabase now ignores explicit extension version
-- pinning in favour of the platform default, so pinning would be noise that drifts.

create extension if not exists pg_cron with schema pg_catalog;

-- `IF NOT EXISTS` is satisfied by ANY pre-existing installation, regardless of schema.
-- If a target database already had pg_cron somewhere other than pg_catalog, the statement
-- above would succeed while leaving `pg_extension.extnamespace` non-canonical — the
-- migration would report success without enforcing the state it claims. Fail loudly
-- rather than silently accepting a non-canonical install.
--
-- `ALTER EXTENSION ... SET SCHEMA` is deliberately NOT used: relocating an installed
-- pg_cron is more disruptive than an actionable error, and the operator should decide.
do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_cron';

  if v_schema is distinct from 'pg_catalog' then
    raise exception
      'pg_cron is installed in schema "%" but this project requires pg_catalog. Relocate it (ALTER EXTENSION pg_cron SET SCHEMA pg_catalog) or drop and re-create it, then re-run this migration.',
      v_schema;
  end if;
end $$;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
-- Sequences too. Measured 2026-09-18: postgres can ALREADY schedule without this — a
-- `cron.schedule()` probe in a fresh replay succeeded even though
-- `has_sequence_privilege('postgres','cron.jobid_seq','USAGE')` returned false, because
-- postgres bypasses these ACLs. Granted anyway: it costs nothing, keeps the documented
-- contract explicit, and means B2's `cron.schedule()` calls are not relying on an
-- accident of role membership.
grant all privileges on all sequences in schema cron to postgres;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDERING NOTE — verified, and deliberately NOT "fixed" by editing history
-- ═══════════════════════════════════════════════════════════════════════════════
-- The only cron-aware migration in the repository is
--   20260501204538_landlord_v1_response_metrics.sql
-- and it guards its schedule block on the extension already existing:
--
--     IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
--       RAISE NOTICE 'pg_cron not installed, skipping analytics cron schedule (local dev)';
--       RETURN;
--     END IF;
--     PERFORM cron.schedule('mdeai_analytics_daily_snapshot', '10 3 * * *', …);
--
-- That migration has a LOWER timestamp than this one, so during a fresh replay it still
-- executes while pg_cron is absent, still takes the skip branch, and
-- `mdeai_analytics_daily_snapshot` is still NOT created.
--
-- Installing the extension here does NOT retroactively create that schedule. That is
-- expected and accepted: rewriting an already-applied migration to move the install
-- earlier would alter existing history, which this epic forbids.
--
-- Consequence for B2: every schedule the replay should end up with — including
-- `mdeai_analytics_daily_snapshot` — must be declared FORWARD from a later migration,
-- not resurrected by editing 20260501204538. Verified by pgTAP in this increment:
-- a fresh replay has the extension and the schema but ZERO schedules.
