-- SAN-814: actual partner_profile_patch RPC behavior with authenticated, foreign and anon roles.
-- Fixtures and all writes are transaction-local, rolled back at the end.
begin;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
('a8140000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','san814-owner@example.com',
 extensions.crypt('san814-fixture', extensions.gen_salt('bf')), now(),now(),now()),
('a8140000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','san814-outsider@example.com',
 extensions.crypt('san814-fixture', extensions.gen_salt('bf')), now(),now(),now());

insert into public.profiles (id, email) values
('a8140000-0000-4000-8000-000000000001','san814-owner@example.com'),
('a8140000-0000-4000-8000-000000000002','san814-outsider@example.com')
on conflict (id) do nothing;

insert into public.partners (id, profile_id, type, settings) values
('a8140000-0000-4000-8000-000000000011','a8140000-0000-4000-8000-000000000001','venue',
 '{"businessName":"Café A","website":"https://old.example","description":"Old text"}'::jsonb),
('a8140000-0000-4000-8000-000000000012','a8140000-0000-4000-8000-000000000001','broker',
 '{"businessName":"Broker A"}'::jsonb),
('a8140000-0000-4000-8000-000000000013','a8140000-0000-4000-8000-000000000002','venue',
 '{"businessName":"Venue B"}'::jsonb);

insert into public.partner_members (partner_id, profile_id, role) values
('a8140000-0000-4000-8000-000000000011','a8140000-0000-4000-8000-000000000001','owner'),
('a8140000-0000-4000-8000-000000000012','a8140000-0000-4000-8000-000000000001','owner'),
('a8140000-0000-4000-8000-000000000013','a8140000-0000-4000-8000-000000000002','owner');

select ok(
  not has_function_privilege('anon', 'public.partner_profile_patch(jsonb,uuid)', 'EXECUTE'),
  'anonymous role cannot call profile patch');

set local role authenticated;
set local search_path = public, extensions, pg_temp;
select set_config('request.jwt.claim.sub','a8140000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$select public.partner_profile_patch('{"description":"New"}'::jsonb)$$,
  'P0003', 'partner_profile_patch: multiple partner memberships require a selection',
  'multiple memberships require an explicit partner');

select is(
  public.partner_profile_patch('{"description":"New"}'::jsonb,
    'a8140000-0000-4000-8000-000000000011') ->> 'partnerId',
  'a8140000-0000-4000-8000-000000000011',
  'owner updates selected café');

select is(
  (select settings->>'website' from public.partners where id='a8140000-0000-4000-8000-000000000011'),
  'https://old.example',
  'changing description preserves website');

select is(
  public.partner_profile_patch('{"website":"https://new.example"}'::jsonb,
    'a8140000-0000-4000-8000-000000000011') -> 'settings' ->> 'description',
  'New',
  'changing website preserves earlier description');

select is(
  public.partner_profile_patch('{"businessName":"Broker updated"}'::jsonb,
    'a8140000-0000-4000-8000-000000000012') ->> 'partnerId',
  'a8140000-0000-4000-8000-000000000012',
  'owner can explicitly update second authorized partner');

select throws_ok(
  $$select public.partner_profile_patch('{"status":"active"}'::jsonb,
    'a8140000-0000-4000-8000-000000000011')$$,
  '22023', 'partner_profile_patch: unsupported profile field',
  'RPC rejects privileged fields');

select throws_ok(
  $$select public.partner_profile_patch('{"businessName":42}'::jsonb,
    'a8140000-0000-4000-8000-000000000011')$$,
  '22023', 'partner_profile_patch: invalid profile value',
  'RPC rejects invalid types independently of Zod');

select set_config('request.jwt.claim.sub','a8140000-0000-4000-8000-000000000002',true);

select throws_ok(
  $$select public.partner_profile_patch('{"description":"Unauthorized"}'::jsonb,
    'a8140000-0000-4000-8000-000000000011')$$,
  '42501', 'partner_profile_patch: partner access denied',
  'another partner member cannot edit café A');

select is(
  public.partner_profile_patch('{"description":"Authorized B"}'::jsonb,
    'a8140000-0000-4000-8000-000000000013') ->> 'partnerId',
  'a8140000-0000-4000-8000-000000000013',
  'partner B can update their own record');

reset role;
select is(
  (select settings->>'description' from public.partners where id='a8140000-0000-4000-8000-000000000011'),
  'New', 'outsider attempt did not change partner A');

select * from finish();
rollback;
