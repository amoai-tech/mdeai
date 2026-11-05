-- SAN-1488 · Real SQL role authorization + draft default regression.
-- All fixtures are isolated by rollback; no production records are updated.
begin;
select plan(25);

select ok(not has_table_privilege('anon','public.restaurants','TRUNCATE'),
  'anonymous SQL role cannot truncate restaurant catalog (SAN-1287)');
select ok(not has_table_privilege('authenticated','public.restaurants','TRUNCATE'),
  'authenticated SQL role cannot truncate restaurant catalog (SAN-1287)');
select ok(not has_table_privilege('anon','public.restaurants','TRIGGER'),
  'anonymous users cannot attach new restaurant triggers');
select ok(not has_table_privilege('authenticated','public.restaurants','TRIGGER'),
  'authenticated users cannot attach new restaurant triggers');
select ok(not has_table_privilege('anon','public.restaurants','REFERENCES'),
  'anonymous users cannot add foreign key dependencies on restaurant catalog');
select ok(not has_table_privilege('authenticated','public.restaurants','REFERENCES'),
  'authenticated users cannot add foreign key dependencies on restaurant catalog');
select ok(not has_table_privilege('anon','public.restaurants','MAINTAIN'),
  'anonymous clients lack table maintenance privilege');
select ok(not has_table_privilege('authenticated','public.restaurants','MAINTAIN'),
  'authenticated clients lack table maintenance privilege');

select ok(not has_table_privilege('anon','public.restaurants','INSERT'),
  'anonymous clients cannot insert into restaurant catalog');
select ok(not has_table_privilege('anon','public.restaurants','UPDATE'),
  'anonymous clients cannot update restaurant catalog');
select ok(not has_table_privilege('anon','public.restaurants','DELETE'),
  'anonymous clients cannot delete restaurant catalog');
select ok(has_table_privilege('anon','public.restaurants','SELECT'),
  'anonymous visitors can still browse restaurants');
select ok(has_table_privilege('authenticated','public.restaurants','SELECT'),
  'signed-in visitors can still browse restaurants');
select ok(has_table_privilege('authenticated','public.restaurants','INSERT'),
  'moderator/admin insertion retains its SQL privilege before RLS');
select ok(has_table_privilege('authenticated','public.restaurants','UPDATE'),
  'moderator/admin editing retains its SQL privilege before RLS');
select ok(has_table_privilege('service_role','public.restaurants','INSERT'),
  'trusted service retains catalog insert permission');
select ok(has_table_privilege('service_role','public.restaurants','TRIGGER'),
  'trusted service maintains its original SQL privileges');

select is((select column_default from information_schema.columns
  where table_schema='public' and table_name='restaurants' and column_name='is_active'),
  'false', 'new restaurant rows default to inactive without changing old rows');

insert into auth.users (id,email)
values ('a1488000-0000-4000-8000-000000000001','san1488-moderator@example.invalid');
insert into public.user_roles(user_id, role)
values ('a1488000-0000-4000-8000-000000000001','moderator');

insert into public.restaurants(id, name, source)
values ('a1488000-0000-4000-8000-000000000002','SAN1488 Draft Restaurant [TEST]','manual');
select is((select is_active from public.restaurants
  where id='a1488000-0000-4000-8000-000000000002'),false,
  'new restaurant default is inactive, no data migration modified existing records');

set local role anon;
select throws_ok(
  $$insert into public.restaurants(id, name)
    values ('a1488000-0000-4000-8000-000000000003','Unauthorized [TEST]')$$,
  '42501','permission denied for table restaurants',
  'actual anonymous INSERT is rejected at SQL grant boundary');
select is((select count(*)::integer from public.restaurants
  where id='a1488000-0000-4000-8000-000000000002'),1,
  'development-phase RLS allows inactive draft visibility (no business gate)');
reset role;

select set_config('request.jwt.claim.sub','a1488000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a1488000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select lives_ok(
  $$insert into public.restaurants(id, name, is_active)
    values ('a1488000-0000-4000-8000-000000000004','Moderator Published [TEST]',true)$$,
  'real moderator can publish new restaurant on creation without business approval');
select lives_ok(
  $$update public.restaurants set is_active=true
    where id='a1488000-0000-4000-8000-000000000002'$$,
  'real moderator can activate drafted restaurant');
reset role;

select ok((select is_active from public.restaurants
  where id='a1488000-0000-4000-8000-000000000002'),
  'draft activation persists inside same transaction');
select is((select count(*)::integer from public.restaurants
  where id in ('a1488000-0000-4000-8000-000000000003','a1488000-0000-4000-8000-000000000004')),1,
  'unauthorized restaurant did not persist; moderator published row did');

select * from finish();
rollback;
