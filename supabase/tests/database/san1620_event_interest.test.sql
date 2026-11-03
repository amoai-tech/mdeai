begin;
select plan(12);

-- Fixtures: one event, two users (A follows, B does not).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test')
on conflict (id) do nothing;

insert into public.events (id, name, status, event_start_time, city)
values ('33333333-3333-3333-3333-333333333333', 'Follow Test Event', 'published', now() + interval '7 days', 'Medellín')
on conflict (id) do nothing;

-- A follows. Duplicate follow must not create a second row.
insert into public.event_interest_subscriptions (event_id, user_id)
values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111');

select throws_ok(
  $$ insert into public.event_interest_subscriptions (event_id, user_id)
     values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111') $$,
  '23505', null, 'a repeat follow cannot create a second row');

-- RLS: A sees only A's row, B sees nothing.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select results_eq('select count(*)::int from public.event_interest_subscriptions', array[1], 'owner sees their own follow');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select results_eq('select count(*)::int from public.event_interest_subscriptions', array[0], 'another user cannot read the follower list');
reset role;

-- Anonymous cannot read the table at all.
set local role anon;
select throws_ok('select count(*) from public.event_interest_subscriptions', '42501', null, 'anonymous has no access');
reset role;

-- S5: one notification per follower when a tier becomes available, and none on a retry.
insert into public.event_tickets (id, event_id, name, price_cents, currency, qty_total, qty_sold, qty_pending, is_active)
values ('44444444-4444-4444-4444-444444444444','33333333-3333-3333-3333-333333333333','General', 4000000, 'COP', 100, 0, 0, true);

select results_eq(
  $$ select count(*)::int from public.notifications
      where user_id = '11111111-1111-1111-1111-111111111111' and type = 'event_ticket_available' $$,
  array[1], 'a newly available tier notifies the follower exactly once');

update public.event_tickets set name = 'General admission'
 where id = '44444444-4444-4444-4444-444444444444';

select results_eq(
  $$ select count(*)::int from public.notifications
      where user_id = '11111111-1111-1111-1111-111111111111' and type = 'event_ticket_available' $$,
  array[1], 'editing an already available tier stays silent');

select results_eq(
  $$ select count(*)::int from public.notifications
      where user_id = '22222222-2222-2222-2222-222222222222' $$,
  array[0], 'a non-follower is never notified');

-- Two different tiers, including reopening one, must not duplicate an alert.
insert into public.event_tickets (id, event_id, name, price_cents, currency, qty_total, qty_sold, qty_pending, is_active)
values ('55555555-5555-5555-5555-555555555555','33333333-3333-3333-3333-333333333333','VIP', 7000000, 'COP', 10, 0, 0, true);
select results_eq(
  $ select count(*)::int from public.notifications
      where user_id = '11111111-1111-1111-1111-111111111111' and type = 'event_ticket_available' $,
  array[1], 'a second tier does not spam an already-notified follower');

update public.event_tickets set is_active = false
 where id = '44444444-4444-4444-4444-444444444444';
update public.event_tickets set is_active = true
 where id = '44444444-4444-4444-4444-444444444444';
select results_eq(
  $ select count(*)::int from public.notifications
      where user_id = '11111111-1111-1111-1111-111111111111' and type = 'event_ticket_available' $,
  array[1], 'reopening an old tier remains silent for this follow');

-- ACL contract: the trigger is internally executable, not an end-user RPC.
select ok(has_function_privilege('service_role', 'public.notify_event_interest_on_tier_available()', 'EXECUTE'),
  'internal notifier retains service_role EXECUTE');
select ok(not has_function_privilege('anon', 'public.notify_event_interest_on_tier_available()', 'EXECUTE'),
  'anon cannot directly invoke the internal notifier');
select ok(not has_function_privilege('authenticated', 'public.notify_event_interest_on_tier_available()', 'EXECUTE'),
  'authenticated cannot directly invoke the internal notifier');

select * from finish();
rollback;
