-- SB-002 · Option 1 regression test — recovered live-only objects
--
-- Guards the property this migration exists to create: a database rebuilt from
-- `supabase/migrations/**` now contains the application objects that previously lived
-- only in production, AND does not inherit production's known defects.
--
-- Run with: supabase test db
begin;

select plan(21);

-- ── the 8 recovered tables ────────────────────────────────────────────────────

select ok(to_regclass('public.outbox')                  is not null, 'table outbox exists');
select ok(to_regclass('public.event_stakeholders')      is not null, 'table event_stakeholders exists');
select ok(to_regclass('public.event_vendors')           is not null, 'table event_vendors exists');
select ok(to_regclass('public.event_promo_codes')       is not null, 'table event_promo_codes exists');
select ok(to_regclass('public.event_order_refunds')     is not null, 'table event_order_refunds exists');
select ok(to_regclass('public.suppression_list')        is not null, 'table suppression_list exists');
select ok(to_regclass('public.event_attendee_profiles') is not null, 'table event_attendee_profiles exists');
select ok(to_regclass('public.delivery_receipts')       is not null, 'table delivery_receipts exists');

-- ── RLS is on for every one of them (house rule: new table => RLS + policy) ───

select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relrowsecurity
      and c.relname in ('outbox','event_stakeholders','event_vendors','event_promo_codes',
                        'event_order_refunds','suppression_list','event_attendee_profiles',
                        'delivery_receipts')),
  8, 'all 8 recovered tables have RLS enabled');

select is(
  (select count(distinct tablename)::int from pg_policies
    where schemaname = 'public'
      and tablename in ('outbox','event_stakeholders','event_vendors','event_promo_codes',
                        'event_order_refunds','suppression_list','event_attendee_profiles',
                        'delivery_receipts')),
  8, 'every recovered table carries at least one policy');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and tablename in ('outbox','event_stakeholders','event_vendors','event_promo_codes',
                        'event_order_refunds','suppression_list','event_attendee_profiles',
                        'delivery_receipts')),
  19, 'the 19 production policies are reproduced');

-- ── the recovered functions ───────────────────────────────────────────────────

select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'outbox_enqueue','outbox_claim','outbox_mark_failed','outbox_mark_sent',
        'request_approval','decide_approval','fn_outbox_set_updated_at','fn_outbox_suppression_check',
        'fn_insert_conversation','fn_upsert_delivery_log','fn_update_conversation_intent',
        'event_attendees_paginated','event_dashboard_summary','fn_join_wait_list',
        'fn_notify_next_in_line','redeem_promo_code','ticket_payment_refund_v2',
        'approve_sponsor_application','get_landlord_public_profile','is_suppressed',
        'touch_updated_at','trigger_ai_embed'])),
  22, 'the 22 recoverable functions exist');

-- Spot-check exact signatures, not just names.
select ok(to_regprocedure('public.outbox_enqueue(text,text,text,jsonb,uuid)') is not null,
          'outbox_enqueue has its production signature');
select ok(to_regprocedure('public.ticket_payment_refund_v2(uuid,integer,text,text,uuid,text,uuid[])') is not null,
          'ticket_payment_refund_v2 has its production signature');

-- ── quarantined on purpose — these MUST stay absent ───────────────────────────

select ok(to_regprocedure('public.fn_audit_outbox()') is null,
          'dead fn_audit_outbox is NOT recreated (would preserve a live defect)');
select ok(to_regprocedure('public.fn_record_conversion(text,text,text,text,text,numeric,text,text,text,jsonb)') is null
          or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname='public' and p.proname='fn_record_conversion'),
          'dead fn_record_conversion is NOT recreated');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname = 'hybrid_search_events'),
          'fts-blocked hybrid_search_events stays deferred until fts_content is recovered');
select ok(not exists (select 1 from pg_trigger tg
                        join pg_class c on c.oid = tg.tgrelid
                        join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'public' and c.relname = 'outbox'
                         and tg.tgname = 'tg_audit_outbox'),
          'broken tg_audit_outbox trigger is NOT installed');

-- ── the behavioural payoff ────────────────────────────────────────────────────
-- In production EVERY insert into public.outbox raises, because tg_audit_outbox calls
-- the dead fn_audit_outbox(). A fresh replay must not inherit that.

select lives_ok(
  $$insert into public.outbox (channel, action, idempotency_key, payload)
    values ('email', 'sb002-probe', 'sb002-test-key', '{}'::jsonb)$$,
  'INSERT into public.outbox SUCCEEDS in a fresh replay (fails in production today)');

select lives_ok(
  $$select public.outbox_enqueue('email', 'sb002-probe', 'sb002-test-key-2', '{}'::jsonb)$$,
  'outbox_enqueue() runs end to end');

select lives_ok(
  $$select public.is_suppressed('email', 'nobody@example.com')$$,
  'is_suppressed() runs against the recovered suppression_list');

select * from finish();
rollback;
