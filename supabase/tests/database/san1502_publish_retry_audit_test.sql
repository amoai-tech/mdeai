-- SAN-1502: publication retries must not rewrite original publisher audit state.
-- Reproduces existing production API path /api/host/rentals/listings/publish.
begin;
select plan(9);

insert into auth.users (id,instance_id,aud,role,email) values
 ('e9999000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','san1502-publisher@example.test'),
 ('e9999000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','san1502-stranger@example.test');
insert into public.landlord_profiles (id,user_id,display_name)
values ('e9999000-0000-4000-8000-000000000011','e9999000-0000-4000-8000-000000000001','SAN1502 Publisher');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e9999000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($q$
 insert into public.apartments
 (id,title,slug,neighborhood,description,bedrooms,status,listing_workflow_status,landlord_id)
 values ('e9999000-0000-4000-8000-000000000021','SAN1502 retry proof','san1502-retry-proof','Laureles','development',1,'inactive','draft','e9999000-0000-4000-8000-000000000011')
$q$, 'authorized broker can create a development draft');
reset role;

select is((select published_by from public.apartments where id='e9999000-0000-4000-8000-000000000021'),null::uuid,'draft has no publisher');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e9999000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($q$select public.publish_self_attested_rental('e9999000-0000-4000-8000-000000000021',true,true)$q$, 'broker publishes development draft without business approval');
reset role;

select is((select published_by from public.apartments where id='e9999000-0000-4000-8000-000000000021'),'e9999000-0000-4000-8000-000000000001'::uuid,'publisher is authenticated actor');

create temp table san1502_snapshot as select ctid::text row_location, row(published_at,published_by,workflow_changed_at,workflow_changed_by,updated_at,metadata)::text audit_fields
from public.apartments where id='e9999000-0000-4000-8000-000000000021';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e9999000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($q$select public.publish_self_attested_rental('e9999000-0000-4000-8000-000000000021',true,true)$q$, 'legitimate retry is accepted');
reset role;

select is((select ctid::text from public.apartments where id='e9999000-0000-4000-8000-000000000021'),
          (select row_location from san1502_snapshot),'retry is a no-op, not a second UPDATE');
select is((select row(published_at,published_by,workflow_changed_at,workflow_changed_by,updated_at,metadata)::text from public.apartments where id='e9999000-0000-4000-8000-000000000021'),
          (select audit_fields from san1502_snapshot),'retry preserves complete audit history');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e9999000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($q$select public.publish_self_attested_rental('e9999000-0000-4000-8000-000000000021',true,true)$q$, '42501', 'not authorized to publish this listing', 'foreign broker cannot exploit no-op replay');
reset role;

select is((select count(*)::integer from public.apartments where id='e9999000-0000-4000-8000-000000000021'),1,'retry did not duplicate apartment');
select * from finish();
rollback;
