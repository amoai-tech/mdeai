-- SAN-1623 · Contact Host — form retry uniqueness and private inbox visibility.
-- No fixtures survive: pgTAP runs inside BEGIN/ROLLBACK.
begin;

select plan(10);

insert into auth.users (id, email) values
  ('a1623000-0000-4000-8000-000000000001', 'san1623-host-a@example.test'),
  ('a1623000-0000-4000-8000-000000000002', 'san1623-host-b@example.test'),
  ('a1623000-0000-4000-8000-000000000003', 'san1623-admin@example.test'),
  ('a1623000-0000-4000-8000-000000000004', 'san1623-outsider@example.test');

insert into public.landlord_profiles (id, user_id, display_name) values
  ('b1623000-0000-4000-8000-000000000001', 'a1623000-0000-4000-8000-000000000001', 'Host A'),
  ('b1623000-0000-4000-8000-000000000002', 'a1623000-0000-4000-8000-000000000002', 'Host B');

insert into public.user_roles (user_id, role)
values ('a1623000-0000-4000-8000-000000000003', 'admin');

insert into public.landlord_inbox
  (id, landlord_id, channel, raw_message, form_request_id) values
  ('c1623000-0000-4000-8000-000000000001', 'b1623000-0000-4000-8000-000000000001', 'form', 'Host A first', 'd1623000-0000-4000-8000-000000000001'),
  ('c1623000-0000-4000-8000-000000000002', 'b1623000-0000-4000-8000-000000000001', 'chat', 'Host A legacy', null),
  ('c1623000-0000-4000-8000-000000000003', 'b1623000-0000-4000-8000-000000000002', 'form', 'Host B first', null),
  ('c1623000-0000-4000-8000-000000000004', null, 'form', 'Unassigned admin follow-up', null);

select throws_ok(
  $$ insert into public.landlord_inbox (landlord_id, channel, raw_message, form_request_id)
     values ('b1623000-0000-4000-8000-000000000001', 'form', 'Duplicate',
             'd1623000-0000-4000-8000-000000000001') $$,
  '23505', null, 'the same non-null request UUID cannot create a second inquiry'
);
select is(
  (select count(*)::int from public.landlord_inbox where form_request_id is null), 3,
  'legacy inquiries with null request UUID remain allowed'
);

set local role anon;
select is((select count(*)::int from public.landlord_inbox
           where id::text like 'c1623%'), 0,
          'anonymous caller cannot read private host inbox');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1623000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.landlord_inbox
           where id::text like 'c1623%'), 2,
          'assigned host A sees only its two inquiries');
select is((select count(*)::int from public.landlord_inbox
           where id='c1623000-0000-4000-8000-000000000003'), 0,
          'host A cannot read host B inquiry');
with attempted as (
  update public.landlord_inbox set status='viewed'
  where id='c1623000-0000-4000-8000-000000000003'
  returning id
)
select is((select count(*)::int from attempted), 0,
          'host A cannot modify host B inquiry');

select set_config('request.jwt.claim.sub', 'a1623000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.landlord_inbox
           where id::text like 'c1623%'), 1,
          'host B sees only its own inquiry');

select set_config('request.jwt.claim.sub', 'a1623000-0000-4000-8000-000000000004', true);
select is((select count(*)::int from public.landlord_inbox
           where id::text like 'c1623%'), 0,
          'unrelated authenticated user cannot read any inquiry');

select set_config('request.jwt.claim.sub', 'a1623000-0000-4000-8000-000000000003', true);
select is((select count(*)::int from public.landlord_inbox
           where id::text like 'c1623%'), 4,
          'authorized admin can see assigned and unassigned inquiries');
reset role;

set local role service_role;
select is((select count(*)::int from public.landlord_inbox
           where id::text like 'c1623%'), 4,
          'service role retains access to all inquiries for server writes');
reset role;

select * from finish();
rollback;
