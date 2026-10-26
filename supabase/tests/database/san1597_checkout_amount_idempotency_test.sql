-- SAN-1597: one server-priced order; identical concurrent key/token cannot hold
-- a second seat. All fixture writes roll back after pgTAP.
begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email)
values ('a1597000-0000-4000-8000-0000000000a1',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'san1597-host@example.com');
insert into public.profiles (id, email, full_name)
values ('a1597000-0000-4000-8000-0000000000a1',
        'san1597-host@example.com','SAN1597 Host')
on conflict (id) do update set full_name=excluded.full_name;
insert into public.events
  (id, source, name, slug, status, organizer_id, created_by, event_start_time, currency)
values
  ('a1597000-0000-4000-8000-0000000000b1', 'host_wizard',
   'SAN1597 COP ticket test', 'san1597-cop-fixture', 'published',
   'a1597000-0000-4000-8000-0000000000a1',
   'a1597000-0000-4000-8000-0000000000a1',
   '2099-01-01T20:00:00Z'::timestamptz, 'cop');
insert into public.event_tickets
  (id, event_id, name, price_cents, qty_total, currency, is_active, min_per_order, max_per_order)
values
  ('a1597000-0000-4000-8000-0000000000c1',
   'a1597000-0000-4000-8000-0000000000b1',
   'GA', 4000000, 10, 'cop', true, 1, 10);

select is(
  (public.ticket_checkout_create_pending(
   'a1597000-0000-4000-8000-0000000000b1',
   'a1597000-0000-4000-8000-0000000000c1',
   1, 'buyer@example.com','Buyer','san1597-deterministic-access-token',
   jsonb_build_array(jsonb_build_object(
     'id',gen_random_uuid(),'email','buyer@example.com',
     'full_name','Buyer','qr_token','san1597-qr-1'
   ))
  )->>'price_cents')::bigint,
  4000000::bigint,'the RPC returns the server ticket price in minor units'
);
select is((select subtotal_cents from public.event_orders
  where event_id='a1597000-0000-4000-8000-0000000000b1'),
  4000000::bigint,'subtotal equals the COP amount in Stripe minor units');
select is((select total_cents from public.event_orders
  where event_id='a1597000-0000-4000-8000-0000000000b1'),
  4000000::bigint,'order total equals one GA ticket, without hidden fees');
select is(lower((select currency from public.event_orders
  where event_id='a1597000-0000-4000-8000-0000000000b1')),
  'cop','currency is persisted from the authoritative ticket tier');

select throws_ok(
  $$select public.ticket_checkout_create_pending(
    'a1597000-0000-4000-8000-0000000000b1',
    'a1597000-0000-4000-8000-0000000000c1',1,
    'buyer@example.com','Buyer','san1597-deterministic-access-token',
    jsonb_build_array(jsonb_build_object(
      'id',gen_random_uuid(),'email','buyer@example.com',
      'full_name','Buyer','qr_token','san1597-qr-2'
    ))
  )$$,
  '23505',null,'duplicate checkout token is rejected inside the reservation transaction'
);
select is((select count(*)::integer from public.event_orders
  where event_id='a1597000-0000-4000-8000-0000000000b1'),
  1,'a duplicate checkout does not create a second order');
select is((select qty_pending from public.event_tickets
  where id='a1597000-0000-4000-8000-0000000000c1'),
  1,'a duplicate checkout does not reserve extra capacity');

select * from finish();
rollback;