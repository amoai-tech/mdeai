-- SAN-1502: non-private pending rentals remain discoverable through RLS and
-- hybrid search in development, without exposing explicit private/test fixtures.
begin;
select plan(10);

select is(public.rental_development_active(), true,
  'Phase A uses explicit server-controlled setting');
select is(public.rental_listing_is_public('pending','pending','draft',null,'{}'::jsonb),
  true, 'Phase A permits an unpublished pending apartment');
select is(public.rental_listing_is_public('inactive','pending','draft',null,'{}'::jsonb),
  true, 'Phase A permits a non-private inactive apartment');
select is(public.rental_listing_is_public('inactive','pending','draft',null,'{"visibility":"private"}'::jsonb),
  false, 'private listing remains protected');
select is(public.rental_listing_is_public('inactive','pending','draft',null,'{"is_test_fixture":true}'::jsonb),
  false, 'test fixtures remain isolated from public search');

insert into public.apartments (id,title,neighborhood,city,description,status,metadata)
values
 ('00000000-0000-4000-8000-000015020101','Zzphasepending studio','Laureles','Medellín',
  'Development pending search test','inactive','{}'::jsonb),
 ('00000000-0000-4000-8000-000015020102','Zzphaseprivate studio','Laureles','Medellín',
  'Explicitly private search test','inactive','{"visibility":"private"}'::jsonb),
 ('00000000-0000-4000-8000-000015020103','Zzphasefixture studio','Laureles','Medellín',
  'Explicit test fixture','inactive','{"is_test_fixture":true}'::jsonb);

set local role anon;
select is((select count(*)::integer from public.apartments
 where id='00000000-0000-4000-8000-000015020101'),1,
 'anon RLS allows ordinary pending development listing');
select ok(exists(select 1 from public.hybrid_search_listings(
 'zzphasepending',array_fill(0.01,array[768])::vector,10)
 where id='00000000-0000-4000-8000-000015020101'),
 'anon hybrid keyword path finds pending listing');
select ok(not exists(select 1 from public.hybrid_search_listings(
 'zzphaseprivate',array_fill(0.01,array[768])::vector,10)
 where id='00000000-0000-4000-8000-000015020102'),
 'anon hybrid search cannot reveal private listing');
select ok(not exists(select 1 from public.hybrid_search_listings(
 'zzphasefixture',array_fill(0.01,array[768])::vector,10)
 where id='00000000-0000-4000-8000-000015020103'),
 'anon hybrid search cannot reveal test fixture');
reset role;

update public.rental_runtime_settings set phase='launch',changed_at=now()
 where singleton;
select is(public.rental_listing_is_public('inactive','pending','draft',null,'{}'::jsonb),
 false,'launch phase restores active/approved/published requirements');

select * from finish();
rollback;
