-- SAN-1622: revocation is atomic and respects signed-in organizer/admin authority.
-- pgTAP wraps each test in a transaction and the fixture also rolls back.
begin;
set local search_path = public, extensions;
select plan(10);

insert into auth.users(id,email,aud,role)
values
('b1622000-0000-4000-8000-000000000001','san1622-organizer@example.invalid','authenticated','authenticated'),
('b1622000-0000-4000-8000-000000000002','san1622-admin@example.invalid','authenticated','authenticated'),
('b1622000-0000-4000-8000-000000000003','san1622-outsider@example.invalid','authenticated','authenticated');

insert into public.user_roles(user_id,role)
values ('b1622000-0000-4000-8000-000000000002','super_admin');

insert into public.events(id,name,organizer_id,event_start_time,event_end_time,status,is_active,staff_link_version)
values
('b1622000-0000-4000-8000-000000000011','SAN-1622 organizer fixture','b1622000-0000-4000-8000-000000000001',now()+interval '1 day',now()+interval '2 days','draft',true,0),
('b1622000-0000-4000-8000-000000000012','SAN-1622 ownerless fixture',null,now()+interval '1 day',now()+interval '2 days','draft',true,0);

select is(has_function_privilege('anon','public.bump_staff_link_version(uuid)','EXECUTE'),false,
  'anonymous users cannot invoke staff link revocation RPC');
select is(has_function_privilege('authenticated','public.bump_staff_link_version(uuid)','EXECUTE'),true,
  'authenticated users have access to RPC with per-actor authorization');

set local role authenticated;
select set_config('request.jwt.claim.sub','b1622000-0000-4000-8000-000000000001',true);
select is(public.bump_staff_link_version('b1622000-0000-4000-8000-000000000011'),1,
  'event organizer revokes their own staff link');
select throws_ok($$select public.bump_staff_link_version('b1622000-0000-4000-8000-000000000012')$$,
  '42501', 'NOT_ORGANIZER', 'organizer cannot revoke an unrelated event');

select set_config('request.jwt.claim.sub','b1622000-0000-4000-8000-000000000002',true);
select is((select public.is_admin()),true,'trusted database role recognizes Super Admin');
select is(public.bump_staff_link_version('b1622000-0000-4000-8000-000000000011'),2,
  'Super Admin can revoke another organizers link');
select is(public.bump_staff_link_version('b1622000-0000-4000-8000-000000000012'),1,
  'Super Admin can revoke an ownerless development events link');

select set_config('request.jwt.claim.sub','b1622000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.bump_staff_link_version('b1622000-0000-4000-8000-000000000011')$$,
  '42501', 'NOT_ORGANIZER', 'unrelated signed-in user is rejected');
reset role;
select is((select staff_link_version from public.events where id='b1622000-0000-4000-8000-000000000011'),2,
  'failed unrelated revocation does not increment version');
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.bump_staff_link_version('b1622000-0000-4000-8000-000000000011')$$,
  '42501', 'UNAUTHORIZED', 'missing signed-in identity is denied');

reset role;
select * from finish();
rollback;
