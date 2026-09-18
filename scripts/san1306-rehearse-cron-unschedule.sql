-- SAN-1306 · P1 rehearsal — prove cron.unschedule('agent_tool_calls_cleanup')
--
-- Why this file exists
-- -------------------
-- pg_cron ships with Supabase but NO migration in this repo installs it, so a database
-- rebuilt from migrations alone has no `cron` schema. The SAN-1306 migration's P1 guard
-- therefore takes its no-op path during `supabase db reset`, and the unschedule itself
-- cannot be observed there. This script closes that verification gap.
--
-- What this PROVES
--   * the migration's exact block removes a job named 'agent_tool_calls_cleanup'
--   * re-running that block is a clean no-op (idempotency)
--
-- What this does NOT prove — do not claim it from this output
--   * historical row preservation. This environment has no cron execution history, so
--     the old script's "history rows preserved: 0" line was vacuous: zero before and
--     zero after look identical whether or not anything was preserved.
--     Verify history against PRODUCTION instead, capturing jobid + row count in
--     cron.job_run_details BEFORE and AFTER the release and comparing them.
--
-- Every expectation below raises on failure, so this is a test rather than a printout.
--
-- Rehearsal only. Runs in a transaction and ROLLS BACK; never point it at production.
--
-- Usage: docker exec -i supabase_db_mdeapp psql -U postgres -d postgres \
--          -v ON_ERROR_STOP=1 -f - < scripts/san1306-rehearse-cron-unschedule.sql

begin;

create extension if not exists pg_cron;

-- ── step 0: nothing scheduled yet ────────────────────────────────────────────
do $$
declare v int;
begin
  select count(*) into v from cron.job where jobname = 'agent_tool_calls_cleanup';
  if v <> 0 then
    raise exception 'step 0 FAILED: expected 0 pre-existing jobs, found %', v;
  end if;
  raise notice 'step 0 PASS — 0 jobs named agent_tool_calls_cleanup before scheduling';
end $$;

select cron.schedule(
  'agent_tool_calls_cleanup',
  '0 4 * * *',
  $$DELETE FROM public.agent_tool_calls WHERE created_at < now() - interval '30 days'$$
);

-- ── step 1: the stand-in job exists ──────────────────────────────────────────
do $$
declare v int;
begin
  select count(*) into v from cron.job where jobname = 'agent_tool_calls_cleanup';
  if v <> 1 then
    raise exception 'step 1 FAILED: expected exactly 1 scheduled job, found %', v;
  end if;
  raise notice 'step 1 PASS — 1 job scheduled (schedule=%, command targets the absent table=%)',
    (select schedule from cron.job where jobname = 'agent_tool_calls_cleanup'),
    (select command like '%agent_tool_calls%' from cron.job where jobname = 'agent_tool_calls_cleanup');
end $$;

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

-- ── step 2: the job is gone ──────────────────────────────────────────────────
do $$
declare v int;
begin
  select count(*) into v from cron.job where jobname = 'agent_tool_calls_cleanup';
  if v <> 0 then
    raise exception 'step 2 FAILED: expected the job to be removed, found %', v;
  end if;
  raise notice 'step 2 PASS — job removed by the migration''s exact block';
end $$;

-- ── step 3: re-running is a clean no-op (idempotency) ────────────────────────
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

do $$
declare v int;
begin
  select count(*) into v from cron.job where jobname = 'agent_tool_calls_cleanup';
  if v <> 0 then
    raise exception 'step 3 FAILED: re-run changed state, found %', v;
  end if;
  raise notice 'step 3 PASS — re-running the block is idempotent';
end $$;

-- Bare `raise` is only valid inside PL/pgSQL, hence the DO wrapper.
do $$
begin
  raise notice 'P1 rehearsal complete: removal + idempotency proven. History preservation must be verified against production.';
end $$;

rollback;
