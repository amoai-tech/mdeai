-- SAN-1502 · Phase A does not impose approval or freshness gates.
-- Genuine database writes are rolled back; RLS/auth, broker mapping and idempotency remain.
begin;
select plan(31);

select is(public.rental_development_active(), true, 'Phase A is explicit in server-owned DB state');
select is(public.rental_listing_is_public('active','pending','draft',null,'{}'::jsonb),
          true, 'Phase A exposes active draft-status inventory without moderation review');
select is(public.rental_listing_is_public('inactive','pending','draft',null,'{}'::jsonb),
          true, 'Phase A permits pending non-private inventory without status approval');
select is(public.rental_listing_is_public('active','approved','published',
  'f1506000-0000-4000-8000-000000000011'::uuid,
  '{"inventory_kind":"external_candidate"}'::jsonb),true,
  'Phase A permits source-linked development inventory');
select is(public.rental_listing_is_public('active','approved','published',
  'f1506000-0000-4000-8000-000000000011'::uuid,
  '{"allowed_action":"view_original_listing"}'::jsonb),true,
  'Phase A permits discovery while preserving source-only provenance');
select is(public.rental_listing_is_public('active','approved','published',
  'f1506000-0000-4000-8000-000000000011'::uuid,
  '{"is_test_fixture":true}'::jsonb),false,'anonymous fixture boundary remains');
select is(public.rental_listing_is_public('active','approved','published',
  'f1506000-0000-4000-8000-000000000011'::uuid,
  '{"visibility":"private"}'::jsonb),false,
  'Phase A keeps explicitly private/internal listings out of public discovery');
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
select set_config('mde.san1502_unpriced_fixture',
 (public.admin_create_test_rental('Unpriced QA fixture','Laureles','Calle 18',
  2400000,'COP',(now() at time zone 'America/Bogota')::date+1,
  'https://example.com/qa.jpg')).id::text,true);
update public.apartments set price_monthly=null,available_from=null,
 address=null,images=array[]::text[]
where id=current_setting('mde.san1502_unpriced_fixture')::uuid;
select lives_ok(
 $q$select public.admin_publish_test_rental(current_setting('mde.san1502_unpriced_fixture')::uuid)$q$,
 'admin test publisher can publish without price, date, address or photo in development');
select is((select verified from public.apartments
 where id=current_setting('mde.san1502_unpriced_fixture')::uuid),false,
 'unpriced development fixture is never falsely verified');
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
-- A normal pending development apartment with no move-in date is requestable;
-- an explicit fixture is not made requestable merely because Phase A is active.
insert into public.apartments (id,title,neighborhood,slug,status,
 moderation_status,listing_workflow_status,metadata,verified,created_by)
values ('f1506000-0000-4000-8000-000000000096','QA requestable development',
 'Laureles','san1502-requestable-qa','inactive','pending','draft','{}'::jsonb,false,
 'f1506000-0000-4000-8000-000000000001');
select is((select public.rental_can_request_viewing(a) from public.apartments a
 where a.id='f1506000-0000-4000-8000-000000000096'::uuid),
 true,'DB-computed requestability allows a normal pending apartment without a move-in date');
-- PostgreSQL resolves composite-row function notation as a virtual field.
-- PostgREST includes this field when .select('* ,rental_can_request_viewing')
-- requests it. No physical or immutable GENERATED column is needed.
select is((select a.rental_can_request_viewing from public.apartments a
 where a.id=current_setting('mde.san1502_phase_fixture')::uuid),
 false, 'PostgREST computed viewing field resolves through row notation without making fixtures requestable');

select is((select count(*)::integer from information_schema.columns
 where table_schema='public' and table_name='apartments'
   and column_name='rental_can_request_viewing'),
 0, 'viewing eligibility remains a virtual computed field, not a physical column');

insert into public.rental_listing_images (listing_id,storage_path,rights_status,sort_order)
values(current_setting('mde.san1502_phase_fixture')::uuid,'phase-a/fixture.jpg','unverified',1);
select is((select status from public.apartments where id=current_setting('mde.san1502_phase_fixture')::uuid),
 'active','photo additions cannot force business-review demotion');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"f1506000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments
 where id=current_setting('mde.san1502_phase_fixture')::uuid),0,
 'signed-in renter without a test grant does not see an explicit test fixture (20261016233000)');
select is(has_table_privilege('authenticated','public.rental_runtime_settings','select'),false,
 'signed-in user lacks SELECT on server-controlled phase table');
reset role;
select set_config('request.jwt.claims','{}',true);

set local role anon;
select is((select count(*)::int from public.apartments
 where id=current_setting('mde.san1502_phase_fixture')::uuid),0,
 'anonymous visitor cannot see fixture');
reset role;

-- Direct RLS proof: active development source is visible without publication paperwork.
insert into public.apartments (id,title,neighborhood,slug,status,
 moderation_status,listing_workflow_status,metadata,verified)
values ('f1506000-0000-4000-8000-000000000097',
 'QA source apartment','Laureles','san1502-source-qa',
 'active','pending','draft',
 '{"inventory_kind":"external_candidate"}'::jsonb,false);
set local role anon;
select is((select count(*)::integer from public.apartments where slug='san1502-source-qa'),1,
 'anonymous catalog can browse active source candidate in development');
reset role;

-- P0 (2026-10-16 review): explicit private/internal records must never be requestable
-- in Phase A, and the authenticated development policy must not expose a private record
-- to an unrelated signed-in user. SAN-1502 later established that a normal
-- inactive/pending development apartment IS requestable; only privacy and explicit
-- test fixtures remain protected.
insert into public.apartments (id,title,neighborhood,slug,status,
 moderation_status,listing_workflow_status,metadata,verified,created_by)
values
 ('f1506000-0000-4000-8000-000000000098','QA inactive apartment','Laureles',
  'san1502-inactive-qa','inactive','pending','draft','{}'::jsonb,false,
  'f1506000-0000-4000-8000-000000000001'),
 ('f1506000-0000-4000-8000-000000000099','QA private apartment','Laureles',
  'san1502-private-qa','active','pending','draft','{"visibility":"private"}'::jsonb,false,
  'f1506000-0000-4000-8000-000000000001');

select is((select public.rental_can_request_viewing(a) from public.apartments a
 where a.id='f1506000-0000-4000-8000-000000000098'::uuid), true,
 'a normal inactive/pending development apartment is requestable in Phase A');
select is((select public.rental_can_request_viewing(a) from public.apartments a
 where a.id='f1506000-0000-4000-8000-000000000099'::uuid), false,
 'private/internal apartments are never requestable in Phase A');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"f1506000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments
 where id='f1506000-0000-4000-8000-000000000099'::uuid), 0,
 'an unrelated signed-in renter cannot select a private development apartment');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"f1506000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments
 where id='f1506000-0000-4000-8000-000000000099'::uuid), 1,
 'the creating administrator can still select their private development apartment');
reset role;
select set_config('request.jwt.claims','{}',true);

-- SAN-1523 replaced the old WHEN-gated enqueue trigger: the queue now has NO gate at all (neither approval
-- nor phase), so every semantic edit of any apartment is queued in development and in launch.
select doesnt_match(pg_get_triggerdef((select oid from pg_trigger
 where tgname='trg_enqueue_embed_apartment' and tgrelid='public.apartments'::regclass)),
 'WHEN|rental_development_active|moderation|workflow|is_active|approved|published',
 'embedding queue has no approval or phase gate on the trigger');

-- Explicit launch switch restores the previous public eligibility gates.
update public.rental_runtime_settings set phase='launch',changed_at=now() where singleton;
select is(public.rental_development_active(),false,'only an explicit database change exits Phase A');
select is(public.rental_listing_is_public('active','pending','draft',null,'{}'::jsonb),
 false,'launch mode restores pending/draft public restrictions');
select is(public.rental_listing_is_public('active','approved','published',
  'f1506000-0000-4000-8000-000000000011'::uuid,
  '{"visibility":"private"}'::jsonb),false,
  'launch mode still keeps private/internal listings out of public discovery');

select * from finish();
rollback;
