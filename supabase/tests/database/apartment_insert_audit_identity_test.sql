-- SAN-1502 · audit identity on apartment insert is server-set
-- Proves: in development an ordinary user can still create an active, published apartment (no approval gate),
-- but cannot forge who published it or when; draft inserts carry no publication fields; administrators keep
-- explicit control; launch still starts new apartments as inactive drafts and also records the real actor.
-- Run with: supabase test db
begin;

select plan(13);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f1524000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'broker-audit@example.com'),
  ('f1524000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'victim-audit@example.com'),
  ('f1524000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-audit@example.com');
insert into public.user_roles (user_id, role) values ('f1524000-0000-4000-8000-000000000003', 'admin');
insert into public.landlord_profiles (id, user_id, display_name) values
  ('f1524000-0000-4000-8000-0000000000b1', 'f1524000-0000-4000-8000-000000000001', 'Broker Audit'),
  ('f1524000-0000-4000-8000-0000000000b3', 'f1524000-0000-4000-8000-000000000003', 'Admin Audit');

select is((select phase from public.rental_runtime_settings where singleton), 'development', 'setup: the rental phase is development');

-- ── development: an ordinary broker creates an active, published apartment and tries to forge the audit fields ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1524000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($q$
  insert into public.apartments (id, title, slug, neighborhood, description, bedrooms, status, moderation_status, listing_workflow_status,
                                 landlord_id, verified, published_by, published_at, workflow_changed_by, workflow_changed_at)
  values ('00000000-0000-4000-8000-00000054a001', 'AUD forged', 'aud-forged', 'Laureles', 'x', 1, 'active', 'approved', 'published',
          'f1524000-0000-4000-8000-0000000000b1', true,
          'f1524000-0000-4000-8000-000000000002', timestamptz '2000-01-01', 'f1524000-0000-4000-8000-000000000002', timestamptz '2000-01-01')$q$,
  'development: an ordinary user can still create an active, published apartment (no approval gate)');
select lives_ok($q$
  insert into public.apartments (id, title, slug, neighborhood, description, bedrooms, status, listing_workflow_status,
                                 landlord_id, published_by, published_at)
  values ('00000000-0000-4000-8000-00000054a002', 'AUD draft', 'aud-draft', 'Laureles', 'x', 1, 'inactive', 'draft',
          'f1524000-0000-4000-8000-0000000000b1', 'f1524000-0000-4000-8000-000000000002', timestamptz '2000-01-01')$q$,
  'development: a draft insert with a forged publisher is accepted but corrected');
reset role;

select is((select status from public.apartments where id = '00000000-0000-4000-8000-00000054a001'), 'active',
  'development publication still works: the row stays active');
select is((select verified from public.apartments where id = '00000000-0000-4000-8000-00000054a001'), false,
  'and verified is still forced to false for an ordinary user');
select is((select published_by from public.apartments where id = '00000000-0000-4000-8000-00000054a001'), 'f1524000-0000-4000-8000-000000000001'::uuid,
  'the publisher is the real actor, not the forged victim');
select is((select workflow_changed_by from public.apartments where id = '00000000-0000-4000-8000-00000054a001'), 'f1524000-0000-4000-8000-000000000001'::uuid,
  'the workflow actor is the real actor, not the forged victim');
select cmp_ok((select now() - published_at from public.apartments where id = '00000000-0000-4000-8000-00000054a001'), '<', interval '1 minute',
  'the publication time is now, not the forged 2000-01-01');
select cmp_ok((select now() - workflow_changed_at from public.apartments where id = '00000000-0000-4000-8000-00000054a001'), '<', interval '1 minute',
  'the workflow change time is now, not the forged 2000-01-01');
select is((select published_by from public.apartments where id = '00000000-0000-4000-8000-00000054a002'), null,
  'a draft carries no publisher even if one was supplied');

-- ── an administrator keeps explicit control ------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1524000-0000-4000-8000-000000000003","role":"authenticated"}', true);
insert into public.apartments (id, title, slug, neighborhood, description, bedrooms, status, listing_workflow_status, landlord_id, published_by)
values ('00000000-0000-4000-8000-00000054a003', 'AUD admin', 'aud-admin', 'Laureles', 'x', 1, 'active', 'published',
        'f1524000-0000-4000-8000-0000000000b3', 'f1524000-0000-4000-8000-000000000002');
reset role;
select is((select published_by from public.apartments where id = '00000000-0000-4000-8000-00000054a003'), 'f1524000-0000-4000-8000-000000000002'::uuid,
  'an administrator may still set explicit audit values');

-- ── launch: new apartments are inactive drafts and still record the real actor ------------------------------------
update public.rental_runtime_settings set phase = 'launch' where singleton;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1524000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.apartments (id, title, slug, neighborhood, description, bedrooms, status, listing_workflow_status, landlord_id, workflow_changed_by)
values ('00000000-0000-4000-8000-00000054a004', 'AUD launch', 'aud-launch', 'Laureles', 'x', 1, 'active', 'published',
        'f1524000-0000-4000-8000-0000000000b1', 'f1524000-0000-4000-8000-000000000002');
reset role;
select is((select status || '/' || listing_workflow_status from public.apartments where id = '00000000-0000-4000-8000-00000054a004'), 'inactive/draft',
  'launch: a new apartment still starts as an inactive draft');
select is((select workflow_changed_by from public.apartments where id = '00000000-0000-4000-8000-00000054a004'), 'f1524000-0000-4000-8000-000000000001'::uuid,
  'launch: and the workflow actor is the real actor, not a forged one');

select * from finish();
rollback;
