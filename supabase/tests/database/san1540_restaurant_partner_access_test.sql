-- SAN-1540 · Restaurant ↔ partner assignment, owner writer and assignment authority.
-- Every write is transaction-local and rolled back.
begin;

select plan(33);

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('a1540000-0000-4000-8000-000000000001','san1540-partner-a@example.com'),
  ('a1540000-0000-4000-8000-000000000002','san1540-partner-b@example.com'),
  ('a1540000-0000-4000-8000-000000000003','san1540-admin@example.com'),
  ('a1540000-0000-4000-8000-000000000004','san1540-outsider@example.com');


insert into public.partners (id, profile_id, type, settings) values
  ('a1540000-0000-4000-8000-000000000011','a1540000-0000-4000-8000-000000000001','venue',
   '{"businessName":"Restaurant A"}'::jsonb),
  ('a1540000-0000-4000-8000-000000000012','a1540000-0000-4000-8000-000000000002','venue',
   '{"businessName":"Restaurant B"}'::jsonb);

insert into public.partner_members (partner_id, profile_id, role) values
  ('a1540000-0000-4000-8000-000000000011','a1540000-0000-4000-8000-000000000001','owner'),
  ('a1540000-0000-4000-8000-000000000012','a1540000-0000-4000-8000-000000000002','owner');

insert into public.user_roles (user_id, role)
values ('a1540000-0000-4000-8000-000000000003','admin');

insert into public.partner_locations (id, partner_id, google_place_id) values
  ('a1540000-0000-4000-8000-000000000021','a1540000-0000-4000-8000-000000000011','place-a');

insert into public.restaurants (id, name, partner_id, google_place_id, description) values
  ('a1540000-0000-4000-8000-000000000031','Restaurant A','a1540000-0000-4000-8000-000000000011','place-a','A original'),
  ('a1540000-0000-4000-8000-000000000032','Restaurant B','a1540000-0000-4000-8000-000000000012','place-b','B original'),
  ('a1540000-0000-4000-8000-000000000033','Unassigned C',null,null,'C original');

-- ── Grants: only the intended roles may call each function ───────────────────
select ok(
  not has_function_privilege('anon', 'public.restaurant_owner_patch(uuid,jsonb,uuid)', 'EXECUTE'),
  'anon cannot call the owner listing writer');
select ok(
  not has_function_privilege('anon', 'public.restaurant_create_for_partner(uuid,text,text)', 'EXECUTE'),
  'anon cannot create a restaurant');
select ok(
  not has_function_privilege('anon', 'public.restaurant_assign_partner(uuid,uuid)', 'EXECUTE'),
  'anon cannot assign a restaurant');
select ok(
  has_function_privilege('authenticated', 'public.restaurant_assign_partner(uuid,uuid)', 'EXECUTE'),
  'authenticated may attempt assignment (the function itself requires admin)');

-- ── Partner A: allowed write ─────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub','a1540000-0000-4000-8000-000000000001',true);

select is(
  public.restaurant_owner_patch(
    'a1540000-0000-4000-8000-000000000031',
    '{"description":"A edited","website":"https://restaurant-a.example"}'::jsonb,
    'a1540000-0000-4000-8000-000000000011') ->> 'restaurantId',
  'a1540000-0000-4000-8000-000000000031',
  'partner A edits the restaurant assigned to partner A');
select is(
  (select description from public.restaurants where id='a1540000-0000-4000-8000-000000000031'),
  'A edited',
  'the submitted description is persisted');
select is(
  (select description from public.restaurants where id='a1540000-0000-4000-8000-000000000032'),
  'B original',
  'restaurant B is untouched');

-- Read-after-write returns the persisted row, not the request body.
select is(
  public.restaurant_owner_patch(
    'a1540000-0000-4000-8000-000000000031',
    '{"hours_of_operation":{"monday":{"open":"09:00","close":"18:00"}}}'::jsonb) -> 'listing' ->> 'description',
  'A edited',
  'a later patch keeps the earlier description');

-- ── Partner A: denied paths ──────────────────────────────────────────────────
select throws_ok(
  $$select public.restaurant_owner_patch('a1540000-0000-4000-8000-000000000032','{"description":"hijack"}'::jsonb)$$,
  '42501', 'restaurant_owner_patch: restaurant access denied',
  'partner A cannot edit restaurant B');

select throws_ok(
  $$select public.restaurant_owner_patch(
      'a1540000-0000-4000-8000-000000000031','{"description":"forged"}'::jsonb,
      'a1540000-0000-4000-8000-000000000012')$$,
  '42501', 'restaurant_owner_patch: partner selection does not match the assignment',
  'a forged partner selector cannot redirect the write');

select throws_ok(
  $$select public.restaurant_owner_patch(
      'a1540000-0000-4000-8000-000000000031','{"partner_id":"a1540000-0000-4000-8000-000000000012"}'::jsonb)$$,
  '22023', 'restaurant_owner_patch: unsupported listing field',
  'the assignment cannot be changed through a listing edit');

select throws_ok(
  $$select public.restaurant_owner_patch(
      'a1540000-0000-4000-8000-000000000031','{"is_active":false}'::jsonb)$$,
  '22023', 'restaurant_owner_patch: unsupported listing field',
  'activation stays an administrative field');

select throws_ok(
  $$select public.restaurant_owner_patch(
      'a1540000-0000-4000-8000-000000000031','{"google_place_id":"place-b"}'::jsonb)$$,
  '22023', 'restaurant_owner_patch: unsupported listing field',
  'the Google Place ID cannot be rewritten by a partner');

select throws_ok(
  $$select public.restaurant_owner_patch(
      'a1540000-0000-4000-8000-000000000031','{"name":"x"}'::jsonb)$$,
  '22023', 'restaurant_owner_patch: invalid restaurant name',
  'invalid values are rejected in SQL, not only in the form');

select throws_ok(
  $$select public.restaurant_owner_patch(
      'a1540000-0000-4000-8000-000000000031',
      '{"hours_of_operation":{"monday":{"open":"25:00","close":"18:00"}}}'::jsonb)$$,
  '22023', 'restaurant_owner_patch: invalid opening-hours value',
  'invalid opening hours are rejected');

select throws_ok(
  $$select public.restaurant_owner_patch(
      'a1540000-0000-4000-8000-000000000031','{"images":[{"url":"file:///etc/passwd"}]}'::jsonb)$$,
  '22023', 'restaurant_owner_patch: invalid image entry',
  'non-http image URLs are rejected');

select throws_ok(
  $$select public.restaurant_owner_patch(
    'a1540000-0000-4000-8000-000000000031','{"images":[{}]}'::jsonb)$$,
  '22023','restaurant_owner_patch: invalid image entry',
  'missing URL is rejected in SQL');

select throws_ok(
  $$select public.restaurant_owner_patch(
    'a1540000-0000-4000-8000-000000000031',
    '{"images":[{"url":"https://example.com/a.jpg","hijack":true}]}'::jsonb)$$,
  '22023','restaurant_owner_patch: invalid image entry',
  'unexpected image keys are rejected in SQL');

-- Direct table writes are still blocked by the existing RLS policies.
with attempted as (
  update public.restaurants set description='direct write'
  where id='a1540000-0000-4000-8000-000000000031'
  returning id
)
select is((select count(*)::int from attempted), 0,
  'direct authenticated UPDATE is denied by RLS');

-- ── Google Place ID spoofing grants nothing ─────────────────────────────────
-- Partner A may edit their own partner_locations row, including google_place_id.
update public.partner_locations set google_place_id='place-b'
where id='a1540000-0000-4000-8000-000000000021';
select is(
  (select google_place_id from public.partner_locations where id='a1540000-0000-4000-8000-000000000021'),
  'place-b',
  'partner A can indeed change their own Place ID (the documented risk)');
select throws_ok(
  $$select public.restaurant_owner_patch('a1540000-0000-4000-8000-000000000032','{"description":"spoofed"}'::jsonb)$$,
  '42501', 'restaurant_owner_patch: restaurant access denied',
  'matching B''s Place ID still does not grant B''s restaurant');
select is(
  (select description from public.restaurants where id='a1540000-0000-4000-8000-000000000032'),
  'B original',
  'the spoof attempt left restaurant B unchanged');

-- ── Partner A: create ───────────────────────────────────────────────────────
select is(
  public.restaurant_create_for_partner(
    'a1540000-0000-4000-8000-000000000011','A New Listing') ->> 'partnerId',
  'a1540000-0000-4000-8000-000000000011',
  'partner A creates a listing for their own partner');
select is(
  (select partner_id from public.restaurants where name='A New Listing'),
  'a1540000-0000-4000-8000-000000000011'::uuid,
  'the created restaurant is assigned to partner A');
select throws_ok(
  $$select public.restaurant_create_for_partner('a1540000-0000-4000-8000-000000000012','Forged Listing')$$,
  '42501', 'restaurant_create_for_partner: partner access denied',
  'partner A cannot create a listing under partner B');

-- ── Assignment: admin only ──────────────────────────────────────────────────
select throws_ok(
  $$select public.restaurant_assign_partner('a1540000-0000-4000-8000-000000000033','a1540000-0000-4000-8000-000000000011')$$,
  '42501', 'restaurant_assign_partner: admin access denied',
  'a partner cannot assign a restaurant');

select set_config('request.jwt.claim.sub','a1540000-0000-4000-8000-000000000003',true);
select is(
  public.restaurant_assign_partner(
    'a1540000-0000-4000-8000-000000000033','a1540000-0000-4000-8000-000000000012') ->> 'partnerId',
  'a1540000-0000-4000-8000-000000000012',
  'an admin assigns an unassigned restaurant to partner B');

select set_config('request.jwt.claim.sub','a1540000-0000-4000-8000-000000000002',true);
select is(
  public.restaurant_owner_patch(
    'a1540000-0000-4000-8000-000000000033','{"description":"B now owns C"}'::jsonb) ->> 'restaurantId',
  'a1540000-0000-4000-8000-000000000033',
  'after assignment partner B can edit the previously unassigned restaurant');

select set_config('request.jwt.claim.sub','a1540000-0000-4000-8000-000000000003',true);
select is(
  public.restaurant_owner_patch(
    'a1540000-0000-4000-8000-000000000032','{"description":"Admin correction"}'::jsonb) ->> 'restaurantId',
  'a1540000-0000-4000-8000-000000000032',
  'an admin can correct any assigned listing through the same writer');

-- ── Unauthenticated ─────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub','',true);
select throws_ok(
  $$select public.restaurant_owner_patch('a1540000-0000-4000-8000-000000000031','{"description":"anon"}'::jsonb)$$,
  '42501', 'restaurant_owner_patch: authentication required',
  'an unauthenticated caller cannot edit');

-- ── Visibility: an assigned inactive restaurant stays visible to its owner ──
reset role;
update public.app_runtime_config set value='launch', updated_at=now()
where key='application_phase';
update public.restaurants set is_active=false
where id='a1540000-0000-4000-8000-000000000031';

set local role authenticated;
select set_config('request.jwt.claim.sub','a1540000-0000-4000-8000-000000000001',true);
select is(
  (select count(*)::int from public.restaurants where id='a1540000-0000-4000-8000-000000000031'),
  1, 'launch: the assigned partner still sees an inactive restaurant');

select set_config('request.jwt.claim.sub','a1540000-0000-4000-8000-000000000002',true);
select is(
  (select count(*)::int from public.restaurants where id='a1540000-0000-4000-8000-000000000031'),
  0, 'launch: another partner does not see it');

select set_config('request.jwt.claim.sub','a1540000-0000-4000-8000-000000000003',true);
select is(
  (select count(*)::int from public.restaurants where id='a1540000-0000-4000-8000-000000000031'),
  1, 'launch: an admin still sees it');

reset role;
update public.app_runtime_config set value='development', updated_at=now()
where key='application_phase';

select * from finish();
rollback;
