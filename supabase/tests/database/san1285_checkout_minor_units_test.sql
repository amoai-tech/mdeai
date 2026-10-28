-- SAN-1285 · money arithmetic in Stripe minor units after the ×100 pricing fix.
--
-- Proves the widened bigint columns and RPC arithmetic handle normal high-price
-- tickets (COP 3,000,000 × 10) and near-int32 prices (COP 21,474,836 × 2)
-- without an integer-overflow checkout failure. Runs in a rolled-back transaction.

begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email)
values (
  'a1285000-0000-4000-8000-0000000000a1',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'san1285-money@example.com'
);
insert into public.profiles (id, email, full_name)
values (
  'a1285000-0000-4000-8000-0000000000a1',
  'san1285-money@example.com',
  'SAN1285 Money Host'
)
on conflict (id) do update set full_name = excluded.full_name;

insert into public.events
  (id, source, name, slug, status, organizer_id, created_by, event_start_time, currency)
values (
  'a1285000-0000-4000-8000-0000000000b1',
  'host_wizard', 'SAN1285 Money Event', 'san1285-money-event', 'published',
  'a1285000-0000-4000-8000-0000000000a1'::uuid,
  'a1285000-0000-4000-8000-0000000000a1'::uuid,
  '2099-01-01T20:00:00Z'::timestamptz,
  'cop'
);

-- COP 3,000,000 stored as 300,000,000 Stripe minor units.
insert into public.event_tickets
  (id, event_id, name, price_cents, qty_total, currency, is_active, min_per_order, max_per_order)
values (
  'a1285000-0000-4000-8000-0000000000c1',
  'a1285000-0000-4000-8000-0000000000b1',
  'VIP', 300000000, 20, 'cop', true, 1, 10
);

select is(
  (public.compute_ticket_total(
    'a1285000-0000-4000-8000-0000000000c1', 10
  )->>'subtotal_cents')::bigint,
  3000000000::bigint,
  'compute_ticket_total keeps a 3,000,000,000 minor-unit subtotal'
);
select is(
  (public.compute_ticket_total(
    'a1285000-0000-4000-8000-0000000000c1', 10
  )->>'total_cents')::bigint,
  3000000000::bigint,
  'compute_ticket_total keeps a 3,000,000,000 minor-unit total'
);
select is(
  (public.ticket_checkout_create_pending(
    'a1285000-0000-4000-8000-0000000000b1',
    'a1285000-0000-4000-8000-0000000000c1',
    10,
    'buyer@example.com',
    'Money Buyer',
    replace(gen_random_uuid()::text, '-', ''),
    (
      select jsonb_agg(jsonb_build_object(
        'id', gen_random_uuid(),
        'email', 'buyer@example.com',
        'full_name', 'Buyer ' || n,
        'qr_token', 'token-' || n
      ))
      from generate_series(1, 10) as n
    )
  )->>'price_cents')::bigint,
  300000000::bigint,
  'checkout returns the persisted minor-unit unit price'
);
select is(
  (select total_cents from public.event_orders
    where event_id = 'a1285000-0000-4000-8000-0000000000b1'
    order by created_at desc limit 1),
  3000000000::bigint,
  'pending order total is the bigint minor-unit amount'
);
select is(
  (select quantity from public.event_orders
    where event_id = 'a1285000-0000-4000-8000-0000000000b1'
    order by created_at desc limit 1),
  10,
  'pending order keeps the requested quantity'
);

-- COP 21,474,836 × 2 = 4,294,967,200 minor units, above int32.
insert into public.event_tickets
  (id, event_id, name, price_cents, qty_total, currency, is_active, min_per_order, max_per_order)
values (
  'a1285000-0000-4000-8000-0000000000c2',
  'a1285000-0000-4000-8000-0000000000b1',
  'Backstage', 2147483600, 5, 'cop', true, 1, 10
);
select is(
  (public.compute_ticket_total(
    'a1285000-0000-4000-8000-0000000000c2', 2
  )->>'total_cents')::bigint,
  4294967200::bigint,
  'a near-int32 price times two no longer overflows'
);
select is(
  (select pg_typeof(total_cents)::text from public.event_orders limit 1),
  'bigint',
  'event_orders money columns are bigint'
);
select is(
  (select pg_typeof(price_cents)::text from public.event_tickets limit 1),
  'bigint',
  'event_tickets.price_cents is bigint'
);

select * from finish();
rollback;
