-- SAN-1502 · Development activation: designated inventory becomes fully operable under
-- the MDE administrator, never touches test fixtures, and never silently asserts OR reverts
-- the owner-directed development verification flag.
begin;
select plan(11);

insert into auth.users (id,instance_id,aud,role,email) values
 ('f1509000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dev-owner-san1502@example.com'),
 ('f1509000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','outsider-san1502@example.com');
insert into public.user_roles(user_id,role) values ('f1509000-0000-4000-8000-000000000001','admin');
insert into public.landlord_profiles(id,user_id,display_name)
values ('f1509000-0000-4000-8000-000000000011','f1509000-0000-4000-8000-000000000001','MDE Dev Owner');

insert into public.apartments (id,title,neighborhood,slug,status,moderation_status,
 listing_workflow_status,verified,metadata,landlord_id)
values
 ('f1509000-0000-4000-8000-000000000021','Imported development candidate','Laureles',
  'candidate-san1502-qa','inactive','pending','draft',true,
  '{"source_original_url":"https://example.com/source/21"}'::jsonb,null),
 ('f1509000-0000-4000-8000-000000000022','MDE managed import','El Poblado',
  'mde-managed-san1502-qa','inactive','pending','draft',false,
  '{"inventory_kind":"mde_managed"}'::jsonb,null),
 ('f1509000-0000-4000-8000-000000000024','External staged candidate','Envigado',
  'external-san1502-qa','inactive','pending','draft',false,
  '{"inventory_kind":"external_candidate"}'::jsonb,null),
 ('f1509000-0000-4000-8000-000000000023','Explicit test fixture','Laureles',
  'san1502-fixture-qa','inactive','pending','draft',false,
  '{"is_test_fixture":"true","inventory_kind":"test_fixture"}'::jsonb,null);

select ok(public._san1502_activate_development_inventory('dev-owner-san1502@example.com') >= 3,
  'activation covers the candidate, managed and external development records');
select is((select count(*)::int from public.apartments where slug='candidate-san1502-qa'
  and status='active' and moderation_status='approved'
  and listing_workflow_status='published'), 1, 'imported candidate is activated and published');
select is((select count(*)::int from public.apartments where slug='candidate-san1502-qa'
  and landlord_id='f1509000-0000-4000-8000-000000000011'::uuid), 1,
  'imported candidate is owned by the MDE administrator profile');
select is((select verified from public.apartments where slug='candidate-san1502-qa'), true,
  'activation never silently reverts the owner-directed development verification flag');
select is((select metadata->>'mde_managed_development' from public.apartments
  where slug='candidate-san1502-qa'), 'true', 'operational readiness is recorded in metadata');
select is((select metadata->>'source_original_url' from public.apartments
  where slug='candidate-san1502-qa'), 'https://example.com/source/21',
  'source provenance is preserved for pre-launch cleanup');
select is((select status||'/'||moderation_status||'/'||listing_workflow_status
  from public.apartments where slug='san1502-fixture-qa'), 'inactive/pending/draft',
  'explicit test fixtures are never activated');
select is((select status||'/'||moderation_status||'/'||listing_workflow_status
  from public.apartments where slug='external-san1502-qa'), 'active/approved/published',
  'a staged external candidate is activated and published');
select is(public._san1502_activate_development_inventory('nobody-san1502@example.com'), 0,
  'an unknown administrator is a safe no-op');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"f1509000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
 $q$select public.admin_activate_development_inventory('dev-owner-san1502@example.com')$q$,
 '42501', 'administrator required', 'a non-administrator cannot activate development inventory');
reset role;
select set_config('request.jwt.claims','{}',true);

update public.rental_runtime_settings set phase='launch',changed_at=now() where singleton;
select throws_ok(
 $q$select public._san1502_activate_development_inventory('dev-owner-san1502@example.com')$q$,
 '42501', 'development activation is only allowed in the development phase',
 'activation is refused outside the development phase');

select * from finish();
rollback;
