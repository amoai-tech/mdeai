-- SAN-1441: owner CRUD on partner_members must work without recursive RLS;
-- outsider/staff may not edit another owner's membership.
-- Isolated transaction: no QA users or partner data persist.
begin;
select plan(10);

insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
('b1441000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','san1441-a@example.com',extensions.crypt('san1441',extensions.gen_salt('bf')),now(),now(),now()),
('b1441000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','san1441-b@example.com',extensions.crypt('san1441',extensions.gen_salt('bf')),now(),now(),now()),
('b1441000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','san1441-staff@example.com',extensions.crypt('san1441',extensions.gen_salt('bf')),now(),now(),now());

insert into public.profiles (id,email) values
('b1441000-0000-4000-8000-000000000001','san1441-a@example.com'),
('b1441000-0000-4000-8000-000000000002','san1441-b@example.com'),
('b1441000-0000-4000-8000-000000000003','san1441-staff@example.com')
on conflict(id) do nothing;

insert into public.partners (id,profile_id,type,settings) values
('b1441000-0000-4000-8000-000000000011','b1441000-0000-4000-8000-000000000001','venue','{"businessName":"SAN1441 Ana"}'::jsonb),
('b1441000-0000-4000-8000-000000000012','b1441000-0000-4000-8000-000000000002','venue','{"businessName":"SAN1441 Carlos"}'::jsonb);

insert into public.partner_members(partner_id,profile_id,role) values
('b1441000-0000-4000-8000-000000000011','b1441000-0000-4000-8000-000000000001','owner'),
('b1441000-0000-4000-8000-000000000011','b1441000-0000-4000-8000-000000000003','staff'),
('b1441000-0000-4000-8000-000000000012','b1441000-0000-4000-8000-000000000002','owner');

select ok(not has_function_privilege('anon','public.partner_owner_ids_for_user()','EXECUTE'),
  'anon cannot call privileged owner membership helper');
select ok(has_function_privilege('authenticated','public.partner_owner_ids_for_user()','EXECUTE'),
  'authenticated may call strictly owner-scoped helper');

set local role authenticated;
set local search_path=public,extensions,pg_temp;
select set_config('request.jwt.claim.sub','b1441000-0000-4000-8000-000000000001',true);

select results_eq(
  'select public.partner_owner_ids_for_user()',
  $$values ('b1441000-0000-4000-8000-000000000011'::uuid)$$,
  'Ana owner helper returns only own partner');

select results_eq(
  $$update public.partner_members set role='billing'
      where partner_id='b1441000-0000-4000-8000-000000000011'
        and profile_id='b1441000-0000-4000-8000-000000000003'
      returning role$$,
  $$values ('billing'::text)$$,
  'Ana can change staff role on own partner without recursion');

select set_config('request.jwt.claim.sub','b1441000-0000-4000-8000-000000000002',true);
select is_empty(
  $$update public.partner_members set role='staff'
      where partner_id='b1441000-0000-4000-8000-000000000011'
        and profile_id='b1441000-0000-4000-8000-000000000001'
      returning partner_id$$,
  'Carlos cannot change Ana owner role');
select is_empty(
  $$delete from public.partner_members where partner_id='b1441000-0000-4000-8000-000000000011'
      and profile_id='b1441000-0000-4000-8000-000000000003'
      returning partner_id$$,
  'Carlos cannot delete Ana team membership');

select set_config('request.jwt.claim.sub','b1441000-0000-4000-8000-000000000003',true);
select results_eq(
  'select public.partner_owner_ids_for_user()',
  $$select null::uuid where false$$,
  'staff has no owner membership IDs');
select is_empty(
  $$update public.partner_members set role='owner'
      where partner_id='b1441000-0000-4000-8000-000000000011'
        and profile_id='b1441000-0000-4000-8000-000000000003'
      returning role$$,
  'staff cannot elevate their own role');

select set_config('request.jwt.claim.sub','b1441000-0000-4000-8000-000000000001',true);
select results_eq(
  $$delete from public.partner_members where partner_id='b1441000-0000-4000-8000-000000000011'
      and profile_id='b1441000-0000-4000-8000-000000000003'
      returning profile_id$$,
  $$values ('b1441000-0000-4000-8000-000000000003'::uuid)$$,
  'owner can remove staff member without recursion');
reset role;

select is(
  (select role from public.partner_members where partner_id='b1441000-0000-4000-8000-000000000012'
     and profile_id='b1441000-0000-4000-8000-000000000002'),
  'owner'::text,
  'Carlos own unrelated partner stays untouched');
select * from finish();
rollback;
