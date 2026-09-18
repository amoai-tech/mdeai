-- SAN-1313 · Migration A regression suite — the 8 dead agent_jobs functions are gone
--
-- Proves both directions: the 8 are dropped, AND nothing collateral was removed.
-- Most importantly it pins the deliberate boundary: `conversation_status` must SURVIVE
-- this migration because live cron job 16 (`chat-archive-abandoned`) still casts to it.
--
-- Run with: supabase test db
begin;

select plan(12);

-- ═══════════════════════════════════════════════════════════════════════════════
-- The 6 dead queue RPCs
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(to_regprocedure('public.claim_agent_job(text,text[])') is null,
          'A: claim_agent_job DROPPED');

select ok(to_regprocedure('public.complete_agent_job(uuid,jsonb)') is null,
          'A: complete_agent_job DROPPED');

select ok(to_regprocedure('public.fail_agent_job(uuid,text)') is null,
          'A: fail_agent_job DROPPED');

select ok(to_regprocedure('public.cleanup_expired_agent_jobs()') is null,
          'A: cleanup_expired_agent_jobs DROPPED');

select ok(to_regprocedure('public.release_stale_agent_job_locks(interval)') is null,
          'A: release_stale_agent_job_locks DROPPED');

select ok(to_regprocedure('public.update_agent_job_progress(uuid,integer,text)') is null,
          'A: update_agent_job_progress DROPPED');

-- ═══════════════════════════════════════════════════════════════════════════════
-- The 2 orphan Realtime trigger functions
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(to_regprocedure('public.broadcast_agent_jobs_changes()') is null,
          'A: broadcast_agent_jobs_changes DROPPED (had 0 triggers)');

select ok(to_regprocedure('public.realtime_broadcast_agent_jobs()') is null,
          'A: realtime_broadcast_agent_jobs DROPPED (had 0 triggers)');

-- ═══════════════════════════════════════════════════════════════════════════════
-- No leftovers, and nothing recreated
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like '%agent_job%'),
  0, 'A: no function matching %agent_job% remains in public');

select ok(to_regclass('public.agent_jobs') is null,
          'A: agent_jobs table NOT recreated (the queue stays retired)');

-- ═══════════════════════════════════════════════════════════════════════════════
-- Boundary + no collateral damage
-- ═══════════════════════════════════════════════════════════════════════════════

-- Deliberately preserved: live cron job 16 casts to this type.
select ok(to_regtype('public.conversation_status') is not null,
          'A: conversation_status type PRESERVED (live cron job 16 still casts to it)');

-- Sanity that Migration A touched only the agent_jobs surface: a PR #58 recovery intact.
select ok(to_regprocedure('public.outbox_enqueue(text,text,text,jsonb,uuid)') is not null,
          'A: no collateral damage — PR #58 outbox_enqueue still present');

select * from finish();
rollback;
