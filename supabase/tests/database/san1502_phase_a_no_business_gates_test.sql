-- SAN-1502 · Phase A does not impose approval or freshness gates.
-- Genuine database writes are rolled back; RLS/auth, broker mapping and idempotency remain.
begin;
select plan(18);

select is(public.rental_development_active(), true, 'Phase A is explicit in server-owned DB state');
select is(public.rental_listing_is_public('active','pending','draft',null,'{}'::jsonb),
          false, 'anonymous public catalog never exposes draft apartments');
select is(public.rental_listing_is_public('active','approved','published',
  'f1506000-0000-4000-8000-000000000011'::uuid,
  '{"inventory_kind":"external_candidate"}'::jsonb),false,
  'anonymous public catalog never exposes external source candidates');
select is(public.rental_listing_is_public('active','approved','published',
  'f1506000-0000-4000-8000-000000000011'::uuid,
  '{"allowed_action":"view_original_listing"}'::jsonb),false,
  'source-link-only listings remain outside the anonymous catalog');
select is(public.rental_listing_is_public('active','approved','published',
  'f1506000-0000-4000-8000-000000000011'::uuid,
  '{"is_test_fixture":true}'::jsonb),false,'anonymous fixture boundary remains');
select is(has_function_privilege('anon','public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamptz,jsonb,jsonb)','execute'),
          false,'anon cannot invoke server-only atomic booking function');
select is(has_function_privilege('authenticated','public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamptz,jsonb,jsonb)','execute'),
          false,'authenticated users cannot invoke server-only atomic booking function');

insert into auth.users (id,instance_id,aud,role,email) values
 ('f1506000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin-phase-a@example.com'),
 ('f1506000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','renter-phase-a@example.com');
insert into public.user_roles(user_id,role) values ('f1506000-0000-4000-8000-000000000001','admin');
insert into public.landlord_profiles(id,user_id,display_name)
values ('f1506000-0000-4000-8000-000000000011','f1506000-0000-4000-8000-000000000001','Phase A operator');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"f1506000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('mde.san1502_phase_fixture',
  (public.admin_create_test_rental('Prelaunch full journey','Laureles','Calle 12',
   2400000,'COP',(now() at time zone 'America/Bogota')::date+1,
   'https://example.com/prelaunch.jpg')).id::text,true);
select lives_ok(
 $q$select public.admin_publish_test_rental(current_setting('mde.san1502_phase_fixture')::uuid)$q$,
 'admin can publish before real-world approval');
-- A normal development publisher can use the existing RPC without creating
-- false ownership/photo authorization or verified-availability assertions.
select set_config('mde.san1502_development_publish',
  (public.admin_create_test_rental('Development publish status','Laureles','Calle 14',
   2300000,'COP',(now() at time zone 'America/Bogota')::date+2,
   'https://example.com/phase-publish.jpg')).id::text,true);
select lives_ok(
 $q$select public.publish_verified_rental(current_setting('mde.san1502_development_publish')::uuid)$q$,
 'standard publisher permits Phase A operational publication');
reset role;
select set_config('request.jwt.claims','{}',true);

select is((select verified from public.apartments
 where id=current_setting('mde.san1502_development_publish')::uuid),false,
 'development publication leaves independently unverified inventory as unverified');

update public.apartments set price_monthly=2410000,available_from=null,
 images=array['https://example.com/new-photo.jpg']
 where id=current_setting('mde.san1502_phase_fixture')::uuid;
select is((select status || '/' || moderation_status || '/' || listing_workflow_status
 from public.apartments where id=current_setting('mde.san1502_phase_fixture')::uuid),
 'active/approved/published', 'edits do not trigger business-review demotion');
select is((select public.rental_can_request_viewing(a) from public.apartments a
 where a.id=current_setting('mde.san1502_phase_fixture')::uuid),
 true,'DB-computed requestability allows unknown move-in date in Phase A');

insert into public.rental_listing_images (listing_id,storage_path,rights_status,sort_order)
values(current_setting('mde.san1502_phase_fixture')::uuid,'phase-a/fixture.jpg','unverified',1);
select is((select status from public.apartments where id=current_setting('mde.san1502_phase_fixture')::uuid),
 'active','photo additions cannot force business-review demotion');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"f1506000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments
 where id=current_setting('mde.san1502_phase_fixture')::uuid),1,
 'signed-in renter can see fixture without a test grant');
select is(has_table_privilege('authenticated','public.rental_runtime_settings','select'),false,
 'signed-in user lacks SELECT on server-controlled phase table');
reset role;
select set_config('request.jwt.claims','{}',true);

set local role anon;
select is((select count(*)::int from public.apartments
 where id=current_setting('mde.san1502_phase_fixture')::uuid),0,
 'anonymous visitor cannot see fixture');
reset role;

-- Explicit launch switch restores the previous public eligibility gates.
update public.rental_runtime_settings set phase='launch',changed_at=now() where singleton;
select is(public.rental_development_active(),false,'only an explicit database change exits Phase A');
select is(public.rental_listing_is_public('active','pending','draft',null,'{}'::jsonb),
 false,'launch mode restores pending/draft public restrictions');

select * from finish();
rollback;
