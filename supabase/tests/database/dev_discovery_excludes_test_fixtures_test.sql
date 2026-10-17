-- SAN-1502 · development discovery excludes explicit test fixtures
-- Proves: ordinary signed-in users read ordinary development listings (including imported external
-- candidates and test_mode MDE-managed development inventory) but not explicit test fixtures,
-- private or internal records; the authorized tester and an administrator still read the fixture;
-- anonymous visitors see ordinary development inventory only; launch grants nothing extra.
--
-- The rule lives in ONE place: rental_listing_is_public() via anyone_can_view_active_apartments.
-- Run with: supabase test db
begin;

select plan(13);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f1523000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-fx@example.com'),
  ('f1523000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tester-fx@example.com'),
  ('f1523000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ordinary-fx@example.com');
insert into public.user_roles (user_id, role) values ('f1523000-0000-4000-8000-000000000001', 'admin');
insert into public.landlord_profiles (id, user_id, display_name)
values ('f1523000-0000-4000-8000-000000000011', 'f1523000-0000-4000-8000-000000000001', 'Admin FX');

-- the admin grants the tester access and provisions a published fixture (the real fixture path)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1523000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.admin_grant_rental_test_access('f1523000-0000-4000-8000-000000000002', 'renter');
select set_config('mde.fx_fixture',
  (public.admin_create_test_rental('FX fixture', 'Laureles', 'Calle 9', 2400000, 'COP',
     (now() at time zone 'America/Bogota')::date + 5, 'https://example.com/fx.jpg')).id::text, true);
select public.admin_publish_test_rental(current_setting('mde.fx_fixture')::uuid);
select public.admin_set_test_rights(current_setting('mde.fx_fixture')::uuid, 'publishing', 'approved');
select public.admin_set_test_rights(current_setting('mde.fx_fixture')::uuid, 'photo', 'authorized');
reset role;

-- ordinary development inventory: unapproved, unowned, no photo rights, no verification
insert into public.apartments (id, title, slug, neighborhood, description, bedrooms, status, moderation_status, listing_workflow_status, landlord_id, metadata)
values ('00000000-0000-4000-8000-00000053a001', 'FX ordinary dev listing', 'fx-ordinary', 'Laureles', 'x', 1, 'active', 'pending', 'draft', null, '{}'),
       ('00000000-0000-4000-8000-00000053a002', 'FX imported candidate',    'fx-candidate', 'Laureles', 'x', 1, 'active', 'pending', 'draft', null, '{"inventory_kind":"external_candidate"}'),
       ('00000000-0000-4000-8000-00000053a003', 'FX kind-marked fixture',   'fx-kindfix',   'Laureles', 'x', 1, 'active', 'pending', 'draft', null, '{"inventory_kind":"test_fixture"}'),
       ('00000000-0000-4000-8000-00000053a004', 'FX private record',        'fx-private',   'Laureles', 'x', 1, 'active', 'pending', 'draft', null, '{"visibility":"private"}'),
       ('00000000-0000-4000-8000-00000053a005', 'FX internal record',       'fx-internal',  'Laureles', 'x', 1, 'active', 'pending', 'draft', null, '{"visibility":"internal"}'),
       ('00000000-0000-4000-8000-00000053a006', 'FX test_mode dev listing', 'fx-testmode',  'Laureles', 'x', 1, 'active', 'pending', 'draft', null, '{"test_mode":"true","inventory_kind":"mde_managed"}');

select is((select phase from public.rental_runtime_settings where singleton), 'development', 'setup: the rental phase is development');

-- ── ordinary signed-in user ----------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1523000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments where id = '00000000-0000-4000-8000-00000053a001'), 1,
  'development: an ordinary signed-in user reads an ordinary development listing (no moderation, owner, rights or verification needed)');
select is((select count(*)::int from public.apartments where id = '00000000-0000-4000-8000-00000053a002'), 1,
  'development: and an imported external candidate');
select is((select count(*)::int from public.apartments where id = current_setting('mde.fx_fixture')::uuid), 0,
  'development: but not an explicit test fixture');
select is((select count(*)::int from public.apartments where id = '00000000-0000-4000-8000-00000053a003'), 0,
  'development: nor a record marked inventory_kind = test_fixture');
select is((select count(*)::int from public.apartments where id = '00000000-0000-4000-8000-00000053a004'), 0,
  'development: nor a private record');
select is((select count(*)::int from public.apartments where id = '00000000-0000-4000-8000-00000053a005'), 0,
  'development: nor an internal record');
select is((select count(*)::int from public.apartments where id = '00000000-0000-4000-8000-00000053a006'), 1,
  'development: test_mode MDE-managed development inventory is NOT excluded');
reset role;

-- ── the people who manage fixtures still read them -----------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1523000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments where id = current_setting('mde.fx_fixture')::uuid), 1,
  'development: the authorized tester still reads the fixture');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1523000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments where id = current_setting('mde.fx_fixture')::uuid), 1,
  'development: an administrator still reads the fixture');
reset role;

-- ── anonymous visitors: ordinary development listings are public through the canonical rule -----------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.apartments where id in ('00000000-0000-4000-8000-00000053a001', '00000000-0000-4000-8000-00000053a002', '00000000-0000-4000-8000-00000053a006')), 3,
  'development: an anonymous visitor reads ordinary and test_mode development listings');
select is((select count(*)::int from public.apartments where id::text in ('00000000-0000-4000-8000-00000053a003', '00000000-0000-4000-8000-00000053a004', '00000000-0000-4000-8000-00000053a005') or id = current_setting('mde.fx_fixture')::uuid), 0,
  'development: but never a test fixture, a kind-marked fixture, a private or an internal record');
reset role;

-- ── launch grants nothing extra ------------------------------------------------------------------------------
update public.rental_runtime_settings set phase = 'launch' where singleton;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1523000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.apartments where id = '00000000-0000-4000-8000-00000053a001'), 0,
  'launch: the same ordinary user no longer reads the unapproved development listing');
reset role;

select * from finish();
rollback;
