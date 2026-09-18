-- SAN-1306 · SB-002D regression suite — dead dependency removal
--
-- Proves the three removals AND that nothing was collateral damage: the two remaining
-- outbox triggers must still work, and the three retired tables must stay retired.
--
-- Run with: supabase test db
--
-- Environment note: pg_cron is available in the Supabase image but is NOT installed by
-- any migration in this repo, so a database rebuilt from migrations alone has no `cron`
-- schema. The migration's P1 guard therefore takes its no-op path here, and the
-- unschedule itself is proven separately by
--   scripts/san1306-rehearse-cron-unschedule.sql
-- which installs pg_cron, schedules a stand-in job with the same name, runs the
-- migration's exact block, and shows it removes the job idempotently.
--
-- Assertions are plain SQL on purpose: pgTAP's ok() called from inside a PL/pgSQL
-- DO block does not register reliably and corrupts TAP numbering.
begin;

select plan(17);

-- ═══════════════════════════════════════════════════════════════════════════════
-- P0 — broken outbox audit trigger removed, the other two preserved
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(
  not exists (
    select 1 from pg_trigger tg
      join pg_class c on c.oid = tg.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'outbox'
       and tg.tgname = 'tg_audit_outbox' and not tg.tgisinternal),
  'P0: tg_audit_outbox is ABSENT (was breaking every outbox INSERT)');

-- The function was the trigger's sole dependent object and can never succeed against
-- the absent agent_audit_log, so it is dropped rather than left orphaned.
select ok(
  to_regprocedure('public.fn_audit_outbox()') is null,
  'P0: orphaned fn_audit_outbox() DROPPED (zero callers after the trigger removal)');

select ok(
  exists (
    select 1 from pg_trigger tg
      join pg_class c on c.oid = tg.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'outbox'
       and tg.tgname = 'tg_outbox_suppression_check' and not tg.tgisinternal),
  'P0: tg_outbox_suppression_check PRESERVED');

select ok(
  exists (
    select 1 from pg_trigger tg
      join pg_class c on c.oid = tg.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'outbox'
       and tg.tgname = 'tg_outbox_updated_at' and not tg.tgisinternal),
  'P0: tg_outbox_updated_at PRESERVED');

select is(
  (select count(*)::int from pg_trigger tg
     join pg_class c on c.oid = tg.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'outbox' and not tg.tgisinternal),
  2, 'P0: outbox has exactly 2 triggers (not 1, not 3)');

-- The behavioural payoff: this INSERT fails in production today.
select lives_ok(
  $$insert into public.outbox (channel, action, idempotency_key, payload)
    values ('email', 'san1306-probe', 'san1306-ok', '{}'::jsonb)$$,
  'P0: INSERT into public.outbox now SUCCEEDS');

-- Suppression must still be enforced by the surviving trigger.
insert into public.suppression_list (channel, identifier, reason)
values ('email', 'blocked@example.com', 'manual');

-- 4-arg form: (sql, errcode, errmsg, description). The 3-arg form treats the third
-- argument as the expected MESSAGE, not a description.
select throws_ok(
  $$insert into public.outbox (channel, action, idempotency_key, payload)
    values ('email', 'san1306-probe', 'san1306-suppressed',
            '{"to":"blocked@example.com"}'::jsonb)$$,
  'P0001', NULL,
  'P0: suppression trigger still blocks a suppressed destination');

-- updated_at must still be maintained by the surviving trigger.
insert into public.outbox (channel, action, idempotency_key, payload)
values ('email', 'san1306-probe', 'san1306-upd', '{}'::jsonb);

update public.outbox set updated_at = timestamptz '2000-01-01'
 where idempotency_key = 'san1306-upd';

select ok(
  (select updated_at > timestamptz '2000-01-01' from public.outbox
    where idempotency_key = 'san1306-upd'),
  'P0: tg_outbox_updated_at still fires on UPDATE');

-- ═══════════════════════════════════════════════════════════════════════════════
-- P1 — dead cron job gone
-- ═══════════════════════════════════════════════════════════════════════════════

-- pg_cron is now installed canonically by SAN-1313 B1
-- (20260918050339_san1313_install_pg_cron.sql), which runs AFTER this task's migration
-- during a replay. So `cron.job` exists at test time and the earlier "no cron schema in
-- this environment" documentation is obsolete. Assert the real outcome instead.
--
-- Ordering note: this migration (20260918000849) still runs BEFORE pg_cron exists, so
-- during replay its P1 guard legitimately takes the no-op path; B1 then installs the
-- extension. Neither creates a cleanup job, so the job must be absent either way.
select ok(
  not exists (select 1 from cron.job where jobname = 'agent_tool_calls_cleanup'),
  'P1: agent_tool_calls_cleanup is ABSENT (pg_cron installed by SAN-1313 B1)');

-- Idempotency: re-running the exact P1 block must be safe.
-- Dynamic SQL for the same reason as the migration: a plain
-- `if to_regclass('cron.job') is not null and exists (select 1 from cron.job ...)`
-- is planned as ONE statement and raises 42P01 where `cron` is absent.
select lives_ok(
  $p1re$do $inner$
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
  end $inner$;$p1re$,
  'P1: the unschedule block is idempotent — safe to re-run');

select ok(to_regclass('public.agent_tool_calls') is null,
          'P1: agent_tool_calls table NOT recreated');

-- ═══════════════════════════════════════════════════════════════════════════════
-- P2 — stale delivery_receipts CHECK tightened
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(
  exists (select 1 from pg_constraint
           where conname = 'delivery_receipts_outbox_table_check'
             and conrelid = 'public.delivery_receipts'::regclass),
  'P2: delivery_receipts_outbox_table_check exists after the rewrite');

select throws_ok(
  $$insert into public.delivery_receipts (outbox_table, outbox_id, provider, external_id, status)
    values ('posts_outbox', gen_random_uuid(), 'p', 'e', 'ok')$$,
  '23514', NULL,
  'P2: CHECK now REJECTS posts_outbox');

select lives_ok(
  $$insert into public.delivery_receipts (outbox_table, outbox_id, provider, external_id, status)
    values ('wa_outbox', gen_random_uuid(), 'p', 'e', 'ok')$$,
  'P2: CHECK still ACCEPTS wa_outbox');

select lives_ok(
  $$insert into public.delivery_receipts (outbox_table, outbox_id, provider, external_id, status)
    values ('email_outbox', gen_random_uuid(), 'p', 'e2', 'ok')$$,
  'P2: CHECK still ACCEPTS email_outbox');

select ok(to_regclass('public.posts_outbox') is null,
          'P2: posts_outbox table NOT recreated');

-- ═══════════════════════════════════════════════════════════════════════════════
-- Retired legacy objects stay retired
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(to_regclass('public.agent_audit_log') is null,
          'agent_audit_log NOT recreated (Mastra + ai_runs replaced it)');

select * from finish();
rollback;
