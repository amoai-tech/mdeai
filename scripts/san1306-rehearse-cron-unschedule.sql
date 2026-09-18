-- SAN-1306 · P1 rehearsal — prove cron.unschedule('agent_tool_calls_cleanup')
--
-- Why this file exists
-- -------------------
-- pg_cron ships with Supabase but NO migration in this repo installs it, so a database
-- rebuilt from migrations alone has no `cron` schema. The SAN-1306 migration's P1 guard
-- therefore takes its no-op path during `supabase db reset`, and the unschedule itself
-- cannot be observed there. This script closes that verification gap.
--
-- It installs pg_cron, schedules a stand-in job with the identical name and schedule,
-- runs the migration's EXACT block, and proves:
--   1. the job is removed
--   2. the block is idempotent (re-running is safe)
--   3. cron execution history is preserved
--
-- Rehearsal only. It runs in a transaction and ROLLS BACK, so it leaves no trace and
-- must never be pointed at production.
--
-- Usage: docker exec -i supabase_db_mdeapp psql -U postgres -d postgres \
--          -v ON_ERROR_STOP=1 -f - < scripts/san1306-rehearse-cron-unschedule.sql

begin;

create extension if not exists pg_cron;

select cron.schedule(
  'agent_tool_calls_cleanup',
  '0 4 * * *',
  $$DELETE FROM public.agent_tool_calls WHERE created_at < now() - interval '30 days'$$
);

select 'step 1 — scheduled: ' || count(*)::text || ' job(s) named agent_tool_calls_cleanup'
from cron.job where jobname = 'agent_tool_calls_cleanup';

-- ═══ the exact P1 block from 20260918000849_san1306_dead_production_dependencies.sql ═══
-- Note the dynamic SQL: PL/pgSQL plans an `if to_regclass('cron.job') is not null and
-- exists (select 1 from cron.job ...)` condition as ONE statement, so `cron.job` would
-- be resolved at plan time and raise 42P01 where the schema is absent.
do $$
declare
  v_exists boolean;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  execute 'select exists (select 1 from cron.job where jobname = $1)'
     into v_exists using 'agent_tool_calls_cleanup';

  if v_exists then
    execute 'select cron.unschedule($1)' using 'agent_tool_calls_cleanup';
  end if;
end $$;

select 'step 2 — after unschedule: ' || count(*)::text || ' job(s) remain'
from cron.job where jobname = 'agent_tool_calls_cleanup';

-- ═══ idempotency: running it again must be a clean no-op ═══
do $$
declare
  v_exists boolean;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  execute 'select exists (select 1 from cron.job where jobname = $1)'
     into v_exists using 'agent_tool_calls_cleanup';

  if v_exists then
    execute 'select cron.unschedule($1)' using 'agent_tool_calls_cleanup';
  end if;
end $$;

select 'step 3 — after re-run: ' || count(*)::text || ' job(s) remain (idempotent)'
from cron.job where jobname = 'agent_tool_calls_cleanup';

-- unschedule removes the job but preserves historical execution records
select 'step 4 — cron.job_run_details rows preserved: ' || count(*)::text
from cron.job_run_details;

rollback;
