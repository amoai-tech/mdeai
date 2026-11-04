-- SAN-1242: tests rolled back at end, no production data modification.\n-- SAN-1285 / SAN-1562 · refunds are a trusted-server money mutation.
--
-- The bigint refund RPC introduced by 20261021043000 must not restore the
-- authenticated EXECUTE grant that SAN-1562 removed from the integer signature.
-- This test runs against the real roles and catalog ACLs, then exercises the
-- invalid-order and full-refund paths as service_role inside a rolled-back
-- transaction. No production data is touched.
begin;
select plan(22);

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
  'General', 4000000, 10, 3, 'cop', true, 1, 10
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


-- Second attendee to represent the first order's two sold admissions.
insert into public.event_attendees
 (id, order_id, ticket_id, event_id, email, full_name, qr_token, status)
values (
 'a1285000-0000-4000-8000-0000000000f3',
 'a1285000-0000-4000-8000-0000000000d2',
 'a1285000-0000-4000-8000-0000000000c2',
 'a1285000-0000-4000-8000-0000000000b2',
 'buyer@example.com', 'Second Ticket', 'san1242-refund-qr-token-two', 'active'
);
-- Direct privilege matrix; the money RPC remains service-only.
select ok(has_function_privilege('service_role',
  to_regprocedure('public.ticket_payment_refund_v2(uuid,bigint,text,text,uuid,text,uuid[])'),
  'EXECUTE'), 'trusted webhook role can execute refund RPC');
select is(has_function_privilege('authenticated',
  to_regprocedure('public.ticket_payment_refund_v2(uuid,bigint,text,text,uuid,text,uuid[])'),
  'EXECUTE'), false, 'buyer cannot call refund RPC');

set local role service_role;
select lives_ok($$select public.ticket_payment_refund_v2(
  'a1285000-0000-4000-8000-0000000000d2', 2000000,
  'customer_request', 're_SAN1242PART', null, 'stripe_dashboard', null)$$,
  'partial amount-only Stripe refund recorded without revoking tickets');
reset role;
select is((select status from public.event_orders
  where id='a1285000-0000-4000-8000-0000000000d2'), 'partial_refund',
  'order status reflects partial refund');
select is((select count(*)::int from public.event_attendees
  where order_id='a1285000-0000-4000-8000-0000000000d2' and status='active'),
  2, 'both ticket admissions remain valid after amount-only partial refund');
select is((select qty_sold from public.event_tickets
  where id='a1285000-0000-4000-8000-0000000000c2'), 3,
  'sold inventory not reduced by an amount-only partial refund');
select is((select count(*)::int from public.event_order_refunds
  where stripe_refund_id='re_SAN1242PART'), 1, 'partial refund ledger row created');

set local role service_role;
select lives_ok($$select public.ticket_payment_refund_v2(
  'a1285000-0000-4000-8000-0000000000d2', 2000000,
  'customer_request', 're_SAN1242PART', null, 'stripe_dashboard', null)$$,
  'replayed Stripe refund ID returns same result');
reset role;
select is((select count(*)::int from public.event_order_refunds
  where stripe_refund_id='re_SAN1242PART'), 1, 'replay creates no duplicate row');

set local role service_role;
select throws_ok($$select public.ticket_payment_refund_v2(
  'a1285000-0000-4000-8000-0000000000d3', 2000000,
  'customer_request', 're_SAN1242PART', null, 'stripe_dashboard', null)$$,
  'P0001', 'STRIPE_REFUND_ID_CONFLICT', 'same provider refund cannot be linked to another order');
select throws_ok($$select public.ticket_payment_refund_v2(
  'a1285000-0000-4000-8000-0000000000d2', 1000000,
  'customer_request', 're_SAN1242FOREIGN', null, 'stripe_dashboard',
  array['a1285000-0000-4000-8000-0000000000f2'::uuid])$$,
  'P0001', 'REFUND_ATTENDEE_NOT_ACTIVE_OR_FOREIGN',
  'cannot refund another order attendee');
select throws_ok($$select public.ticket_payment_refund_v2(
  'a1285000-0000-4000-8000-0000000000d2', 7000000,
  'customer_request', 're_SAN1242OVER', null, 'stripe_dashboard', null)$$,
  'P0001', 'REFUND_EXCEEDS_ORDER_TOTAL', 'cannot exceed original paid amount');
select lives_ok($$select public.ticket_payment_refund_v2(
  'a1285000-0000-4000-8000-0000000000d2', 6000000,
  'customer_request', 're_SAN1242FINAL', null, 'stripe_dashboard',
  array['a1285000-0000-4000-8000-0000000000f1'::uuid])$$,
  'full monetary refund revokes ALL active tickets even with a subset selected');
reset role;

select is((select status from public.event_orders
  where id='a1285000-0000-4000-8000-0000000000d2'), 'refunded',
  'full cumulative amount becomes fully refunded');
select is((select count(*)::int from public.event_attendees
  where order_id='a1285000-0000-4000-8000-0000000000d2' and status='refunded'),
  2, 'only the two first-order attendees revoked on final refund');
select is((select qty_sold from public.event_tickets
  where id='a1285000-0000-4000-8000-0000000000c2'), 1,
  'other paid order inventory remains sold');
select is((select count(*)::int from public.event_order_refunds
  where order_id='a1285000-0000-4000-8000-0000000000d2'), 2,
  'both separate Stripe refunds recorded');
select is((select sum(amount_cents)::bigint from public.event_order_refunds
  where order_id='a1285000-0000-4000-8000-0000000000d2'),
  8000000::bigint, 'completed monetary refunds add to paid original');

set local role service_role;
select throws_ok($$select public.ticket_payment_refund_v2(
  'a1285000-0000-4000-8000-0000000000d2', 10000,
  'customer_request', 're_SAN1242AFTER', null, 'stripe_dashboard', null)$$,
  'P0001', 'ORDER_NOT_REFUNDABLE: refunded',
  'a further novel refund cannot modify a fully-refunded order');
select lives_ok($$select public.ticket_payment_refund_v2(
  'a1285000-0000-4000-8000-0000000000d3', 2000000,
  'customer_request', 're_SAN1242ATTENDEE', null, 'stripe_dashboard',
  array['a1285000-0000-4000-8000-0000000000f2'::uuid])$$,
  'explicitly selected ticket can be revoked with a partial money refund');
reset role;

select is((select qty_sold from public.event_tickets
  where id='a1285000-0000-4000-8000-0000000000c2'), 0,
  'only actually revoked admission subtracts sold inventory');
select is((select status from public.event_attendees
  where id='a1285000-0000-4000-8000-0000000000f2'), 'refunded',
  'explicitly selected attendee is revoked');
select * from finish();
rollback;
