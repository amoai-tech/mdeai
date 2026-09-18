-- SAN-1306 · SB-002D — Remove dead outbox, cron and delivery-receipt dependencies
--
-- Three removals sharing one root cause: 20260524022749_mdeapp_canonical_schema_cleanup.sql
-- dropped legacy objects but left dependent production configuration behind. Each
-- section is idempotent and safe on a database that never had the defect.
--
-- Do NOT recreate `agent_audit_log`, `agent_tool_calls` or `posts_outbox`. The repo
-- deliberately replaced that legacy stack with Mastra + `ai_runs`; recreating the
-- tables would resurrect a retired design.
--
-- Live evidence, read-only, 2026-09-17 (project zkwcbyxiwklihegjhuql):
--
--   P0  public.outbox had 3 triggers: tg_audit_outbox, tg_outbox_suppression_check,
--       tg_outbox_updated_at. tg_audit_outbox -> fn_audit_outbox(), whose body inserts
--       into public.agent_audit_log. That table is ABSENT — dropped by the cleanup
--       migration (line 26). => every INSERT into public.outbox raised; outbox = 0 rows.
--       fn_audit_outbox() has exactly ONE dependent object (that trigger) and is
--       therefore orphaned once the trigger goes — verified by catalogue query:
--         triggers using it:  outbox.tg_audit_outbox   (the only one)
--         functions/views/cron jobs/constraints referencing it: none
--         repo source references: none (comments only)
--       So P0 drops the function too, completing the removal instead of leaving a
--       broken definition behind. The task's own goal is removing dead dependencies,
--       not preserving a function that can never succeed.
--
--   P1  cron job `agent_tool_calls_cleanup`, schedule '0 4 * * *', active=true,
--       command: DELETE FROM public.agent_tool_calls WHERE created_at < now() - 30d.
--       public.agent_tool_calls is ABSENT — dropped by the same migration (line 20).
--       => cron.job_run_details shows status='failed' every day, 2026-09-12 .. 09-17.
--
--   P2  delivery_receipts_outbox_table_check still permitted 'posts_outbox'.
--       public.posts_outbox is ABSENT — dropped by the same migration (line 72).
--       => delivery_receipts holds 0 rows, so tightening the CHECK now is safe.
--
-- Caller search for 'posts_outbox' (2026-09-17): no database function, view, or cron
-- job references it. Two live Edge Functions (postiz-schedule-posts,
-- postiz-approval-webhook) do write the `posts_outbox` TABLE, but that table is gone,
-- so those paths are already broken independently of this CHECK and belong to
-- SB-008 / EDGE-001. Nothing needs 'posts_outbox' as a valid delivery_receipts value.
--
-- Plan tier: Supabase Free. No preview branch. This migration is the SAN-1306 change
-- set intended to alter current production behaviour/schema state.

-- ═══════════════════════════════════════════════════════════════════════════════
-- Prerequisite — fail fast, do not half-apply
-- ═══════════════════════════════════════════════════════════════════════════════
-- P0 and P2 operate on tables that exist only after the SB-002 recovery migration.
-- On a partially rebuilt or independently reconciled database that has this
-- migration's history but not the recovered tables, `DROP TRIGGER ... ON public.outbox`
-- and `ALTER TABLE public.delivery_receipts` would both raise 42P01 and leave a
-- confusing half-state. Assert the baseline explicitly instead, naming the migration
-- to apply first. (P1 needs no such guard: its cron references are already dynamic
-- and its own guard is the absent-schema path.)

do $$
begin
  if to_regclass('public.outbox') is null then
    raise exception
      'SAN-1306 prerequisite missing: public.outbox does not exist. Apply 20260917220000_sb002_recover_live_only_objects.sql first.';
  end if;

  if to_regclass('public.delivery_receipts') is null then
    raise exception
      'SAN-1306 prerequisite missing: public.delivery_receipts does not exist. Apply 20260917220000_sb002_recover_live_only_objects.sql first.';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- P0 — remove the broken outbox audit trigger AND its now-orphaned function
-- ═══════════════════════════════════════════════════════════════════════════════
-- This is the only change that unblocks a production write path. Order matters:
-- the trigger must go first, because it is the function's sole dependent object.
-- The remaining two outbox triggers (tg_outbox_suppression_check,
-- tg_outbox_updated_at) must survive — the pgTAP suite asserts they do.

drop trigger if exists tg_audit_outbox on public.outbox;

-- Sole caller removed above; zero other dependents verified 2026-09-17.
drop function if exists public.fn_audit_outbox();

-- ═══════════════════════════════════════════════════════════════════════════════
-- P1 — unschedule the dead cleanup job
-- ═══════════════════════════════════════════════════════════════════════════════
-- Unschedule by JOB NAME, never by job id: the id is environment-specific
-- (production reports 10) while the name is the stable contract.
-- https://supabase.com/docs/guides/cron/quickstart — cron.unschedule('job-name')
-- removes the job while preserving historical execution records.
--
-- Guarded twice on purpose:
--   * `cron` may not exist at all. pg_cron ships with Supabase but no migration in
--     this repo installs it, so a database rebuilt from migrations alone has NO cron
--     schema (verified locally 2026-09-17). Without this guard the replay breaks.
--   * the job may already be absent (idempotency, and local/production states differ).
--
-- The cron references are inside EXECUTE strings ON PURPOSE. A plain
--     if to_regclass('cron.job') is not null and exists (select 1 from cron.job ...)
-- does NOT work: PL/pgSQL plans that whole condition as a single SQL statement, so
-- `cron.job` is resolved at plan time and raises 42P01 even when the first operand is
-- false. (The to_regclass guard in 20260503130000 works only because its condition
-- touches always-present objects — pg_constraint — and defers the guarded object to
-- the ALTER inside the branch.) Dynamic SQL defers resolution until reached.

do $$
declare
  v_exists boolean;
begin
  if to_regclass('cron.job') is null then
    -- pg_cron is not installed in this environment; there is nothing to unschedule.
    return;
  end if;

  execute 'select exists (select 1 from cron.job where jobname = $1)'
     into v_exists using 'agent_tool_calls_cleanup';

  if v_exists then
    execute 'select cron.unschedule($1)' using 'agent_tool_calls_cleanup';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- P2 — tighten the delivery_receipts CHECK
-- ═══════════════════════════════════════════════════════════════════════════════
-- Native `DROP CONSTRAINT IF EXISTS …, ADD CONSTRAINT …` in a single statement:
-- idempotent, because the drop is tolerated when absent and the add always produces
-- the tightened definition. Also corrects a fresh replay, where the constraint
-- recovered by PR #58 (20260917220000) deliberately carried the same dangling
-- 'posts_outbox' value for fidelity with production at the time.
-- Safe at 0 rows; the prerequisite block above guarantees the table exists.

alter table public.delivery_receipts
  drop constraint if exists delivery_receipts_outbox_table_check,
  add constraint delivery_receipts_outbox_table_check
    check (outbox_table in ('wa_outbox', 'email_outbox'));
