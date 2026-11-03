-- SAN-1285 / SAN-1562 · refunds are a trusted-server money mutation.
--
-- The bigint refund RPC introduced by 20261021043000 must not restore the
-- authenticated EXECUTE grant that SAN-1562 removed from the integer signature.
-- This test runs against the real roles and catalog ACLs, then exercises the
-- invalid-order and full-refund paths as service_role inside a rolled-back
-- transaction. No production data is touched.
begin;
select plan(21);

insert into auth.users (id, instance_id, aud, role, email)
values (
  'a1285000-0000-4000-8000-0000000000e1',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'san1285-refund@example.com'
);
insert into public.profiles (id, email, full_name)
values (
  'a1285000-0000-4000-8000-0000000000e1',
  'san1285-refund@example.com',
  'SAN1285 Refund Host'
)
on conflict (id) do update set full_name = excluded.full_name;

insert into public.events
  (id, source, name, slug, status, organizer_id, created_by, event_start_time, currency)
values (
  'a1285000-0000-4000-8000-0000000000b2',
  'host_wizard', 'SAN1285 Refund Event', 'san1285-refund-event', 'published',
  'a1285000-0000-4000-8000-0000000000e1'::uuid,
  'a1285000-0000-4000-8000-0000000000e1'::uuid,
  '2099-01-01T20:00:00Z'::timestamptz,
  'cop'
);

-- COP 40,000 stored as 4,000,000 Stripe minor units; two seats were sold.
insert into public.event_tickets
  (id, event_id, name, price_cents, qty_total, qty_sold, currency, is_active, min_per_order, max_per_order)
values (
  'a1285000-0000-4000-8000-0000000000c2',
  'a1285000-0000-4000-8000-0000000000b2',
  'General', 4000000, 10, 2, 'cop', true, 1, 10
);

insert into public.event_orders
  (id, event_id, ticket_id, quantity, buyer_email, buyer_name, total_cents,
   currency, status, short_id, access_token)
values (
  'a1285000-0000-4000-8000-0000000000d2',
  'a1285000-0000-4000-8000-0000000000b2',
  'a1285000-0000-4000-8000-0000000000c2',
  2, 'buyer@example.com', 'Refund Buyer', 8000000,
  'cop', 'paid', 'MDE-SAN1285-REFUND', 'san1285-refund-access-token'
);

insert into public.event_attendees
  (id, order_id, ticket_id, event_id, email, full_name, qr_token, status)
values (
  'a1285000-0000-4000-8000-0000000000f1',
  'a1285000-0000-4000-8000-0000000000d2',
  'a1285000-0000-4000-8000-0000000000c2',
  'a1285000-0000-4000-8000-0000000000b2',
  'buyer@example.com', 'Refund Buyer', 'san1285-refund-qr-token', 'active'
);

-- A second paid order exercises the legacy webhook refund RPC
-- (ticket_payment_refund(uuid)), which ticket-payment-webhook still calls.
insert into public.event_orders
  (id, event_id, ticket_id, quantity, buyer_email, buyer_name, total_cents,
   currency, status, short_id, access_token)
values (
  'a1285000-0000-4000-8000-0000000000d3',
  'a1285000-0000-4000-8000-0000000000b2',
  'a1285000-0000-4000-8000-0000000000c2',
  1, 'webhook-buyer@example.com', 'Webhook Buyer', 4000000,
  'cop', 'paid', 'MDE-SAN1285-WEBHOOK', 'san1285-webhook-access-token'
);

insert into public.event_attendees
  (id, order_id, ticket_id, event_id, email, full_name, qr_token, status)
values (
  'a1285000-0000-4000-8000-0000000000f2',
  'a1285000-0000-4000-8000-0000000000d3',
  'a1285000-0000-4000-8000-0000000000c2',
  'a1285000-0000-4000-8000-0000000000b2',
  'webhook-buyer@example.com', 'Webhook Buyer', 'san1285-webhook-qr-token', 'active'
);

-- ── catalog ACLs ─────────────────────────────────────────────────────────────

select ok(
  to_regprocedure('public.ticket_payment_refund_v2(uuid,bigint,text,text,uuid,text,uuid[])') is not null,
  'the canonical bigint refund signature exists'
);
select ok(
  to_regprocedure('public.ticket_payment_refund_v2(uuid,integer,text,text,uuid,text,uuid[])') is null,
  'the old integer refund signature is gone, so there is no stale overload'
);
select is(
  (select count(*)::int
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ticket_payment_refund_v2'),
  1, 'exactly one refund signature is installed'
);

select is(
  (select count(*)::int
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'ticket_payment_refund%'
     and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0, 'anonymous visitors cannot execute any refund overload'
);
select is(
  (select count(*)::int
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'ticket_payment_refund%'
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0, 'signed-in customers cannot execute any refund overload'
);
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where n.nspname = 'public'
     and p.proname like 'ticket_payment_refund%'
     and a.grantee = 0
     and a.privilege_type = 'EXECUTE'),
  0, 'PUBLIC cannot execute any refund overload'
);
select is(
  has_function_privilege(
    'service_role',
    to_regprocedure('public.ticket_payment_refund_v2(uuid,bigint,text,text,uuid,text,uuid[])'),
    'EXECUTE'
  ),
  true, 'the trusted payment server retains execute on the bigint refund signature'
);

-- ── runtime denials ──────────────────────────────────────────────────────────

set local role anon;
select throws_ok(
  $$select public.ticket_payment_refund_v2(
      'a1285000-0000-4000-8000-0000000000d2'::uuid, 8000000::bigint,
      'customer_request', 're_anon_denied', null, 'admin_api', null)$$,
  '42501', null, 'anonymous refund attempt is denied before any write'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select public.ticket_payment_refund_v2(
      'a1285000-0000-4000-8000-0000000000d2'::uuid, 8000000::bigint,
      'customer_request', 're_auth_denied', null, 'admin_api', null)$$,
  '42501', null, 'authenticated buyer refund attempt is denied before any write'
);
reset role;

-- ── trusted-server behaviour ─────────────────────────────────────────────────

set local role service_role;
select throws_ok(
  $$select public.ticket_payment_refund_v2(
      '00000000-0000-0000-0000-000000000000'::uuid, 100::bigint,
      'customer_request', 're_invalid_order', null, 'admin_api', null)$$,
  'P0001', 'ORDER_NOT_FOUND', 'trusted server reaches the function but an unknown order fails'
);
reset role;

select is(
  (select count(*)::int from public.event_order_refunds
    where order_id = '00000000-0000-0000-0000-000000000000'),
  0, 'the failed invalid-order call wrote no refund row'
);

set local role service_role;
select lives_ok(
  $$select public.ticket_payment_refund_v2(
      'a1285000-0000-4000-8000-0000000000d2'::uuid, 8000000::bigint,
      'customer_request', 're_valid_refund', null, 'admin_api', null)$$,
  'the trusted server can complete a full refund'
);
reset role;

select is(
  (select count(*)::int from public.event_order_refunds
    where order_id = 'a1285000-0000-4000-8000-0000000000d2'),
  1, 'the refund was recorded exactly once'
);
select is(
  (select amount_cents from public.event_order_refunds
    where order_id = 'a1285000-0000-4000-8000-0000000000d2'),
  8000000::bigint, 'the bigint refund amount is preserved exactly'
);
select is(
  (select status from public.event_orders
    where id = 'a1285000-0000-4000-8000-0000000000d2'),
  'refunded', 'the order moved to refunded'
);
select is(
  (select status from public.event_attendees
    where id = 'a1285000-0000-4000-8000-0000000000f1'),
  'refunded', 'the attendee was refunded with the order'
);

set local role service_role;
select throws_ok(
  $$select public.ticket_payment_refund_v2(
      'a1285000-0000-4000-8000-0000000000d2'::uuid, 8000000::bigint,
      'customer_request', 're_duplicate_refund', null, 'admin_api', null)$$,
  'P0001', 'ORDER_NOT_REFUNDABLE: refunded', 'a second refund on the same order is rejected'
);
reset role;

select is(
  (select count(*)::int from public.event_order_refunds
    where order_id = 'a1285000-0000-4000-8000-0000000000d2'),
  1, 'the rejected duplicate did not create a second refund row'
);

-- The Stripe webhook still calls the legacy ticket_payment_refund(uuid) RPC
-- with its service client. That authorized refund workflow must keep working.
set local role service_role;
select lives_ok(
  $$select public.ticket_payment_refund('a1285000-0000-4000-8000-0000000000d3'::uuid)$$,
  'the existing webhook refund RPC still runs for service_role'
);
reset role;

select is(
  (select status from public.event_orders
    where id = 'a1285000-0000-4000-8000-0000000000d3'),
  'refunded', 'the webhook-refunded order moved to refunded'
);
select is(
  (select status from public.event_attendees
    where id = 'a1285000-0000-4000-8000-0000000000f2'),
  'refunded', 'the webhook-refunded attendee moved to refunded'
);

select * from finish();
rollback;
