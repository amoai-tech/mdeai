-- SAN-1502 · Search fingerprints follow the listing's own visibility.
-- Development: ordinary active or inactive listings are searchable by meaning even without
-- approval, publication or ownership; private and explicit fixtures stay isolated.
-- Launch: the strict rule returns.
-- Run with: supabase test db
begin;

select plan(15);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f1507000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ordinary-denr@example.com');

-- Four listings, none of them approved or published, none with a landlord.
insert into public.apartments (
  id, title, slug, description, neighborhood, city, address,
  status, moderation_status, listing_workflow_status,
  landlord_id, verified, price_monthly, currency, available_from, images, metadata
) values
  ('f1507000-0000-4000-8000-00000000a001', 'Dev ordinary', 'denr-ordinary', 'Ordinary active development listing.',
   'Laureles', 'Medellín', 'Calle 1', 'active', 'pending', 'draft', null, false, 2000000, 'COP', current_date,
   array['https://example.com/a.jpg'], '{}'::jsonb),
  ('f1507000-0000-4000-8000-00000000a002', 'Dev private', 'denr-private', 'Marked private.',
   'Laureles', 'Medellín', 'Calle 2', 'active', 'pending', 'draft', null, false, 2000000, 'COP', current_date,
   array['https://example.com/b.jpg'], '{"visibility":"private"}'::jsonb),
  ('f1507000-0000-4000-8000-00000000a003', 'Dev inactive', 'denr-inactive', 'Not active.',
   'Laureles', 'Medellín', 'Calle 3', 'inactive', 'pending', 'draft', null, false, 2000000, 'COP', current_date,
   array['https://example.com/c.jpg'], '{}'::jsonb),
  ('f1507000-0000-4000-8000-00000000a004', 'Dev fixture', 'denr-fixture', 'Test fixture.',
   'Laureles', 'Medellín', 'Calle 4', 'active', 'pending', 'draft', null, false, 2000000, 'COP', current_date,
   array['https://example.com/d.jpg'], '{"is_test_fixture":true}'::jsonb);

insert into public.listing_embeddings (listing_id, embedding, content_hash)
select id, array_fill(0.0, array[768])::vector, md5(id::text)
  from public.apartments where id::text like 'f1507000-0000-4000-8000-00000000a00%';
insert into public.rental_signals (apartment_id)
select id from public.apartments where id::text like 'f1507000-0000-4000-8000-00000000a00%';

select is(public.rental_development_active(), true, 'precondition: the database is in the development phase');

-- Development, signed out.
set local role anon;
select is((select count(*)::int from public.listing_embeddings
            where listing_id::text like 'f1507000-0000-4000-8000-00000000a00%'), 2,
  'D1: anon reads active and inactive ordinary development fingerprints');
select is((select count(*)::int from public.listing_embeddings
            where listing_id='f1507000-0000-4000-8000-00000000a003'), 1,
  'D2: an inactive ordinary development listing is also searchable by meaning');
select is((select count(*)::int from public.listing_embeddings
            where listing_id in ('f1507000-0000-4000-8000-00000000a002','f1507000-0000-4000-8000-00000000a004')), 0,
  'D2b: explicit private and fixture data remain isolated');
select is((select count(*)::int from public.rental_signals
            where apartment_id::text like 'f1507000-0000-4000-8000-00000000a00%'), 2,
  'D3: anon reads score rows for active and inactive development listings only');
reset role;

-- Development, signed in as an ordinary user.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1507000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.listing_embeddings
            where listing_id::text like 'f1507000-0000-4000-8000-00000000a00%'), 2,
  'D4: an ordinary signed-in user sees both development fingerprints');
select is((select count(*)::int from public.rental_signals
            where apartment_id::text like 'f1507000-0000-4000-8000-00000000a00%'), 2,
  'D5: an ordinary signed-in user sees both development score rows');
reset role;

-- The helper agrees with the policies for each case.
select is(public.rental_enrichment_is_readable('f1507000-0000-4000-8000-00000000a001'), true,
  'D6: ordinary development listing is readable');
select is(public.rental_enrichment_is_readable('f1507000-0000-4000-8000-00000000a002'), false,
  'D7: a private listing is never readable by the public');
select is(public.rental_enrichment_is_readable('f1507000-0000-4000-8000-00000000a003'), true,
  'D8: inactive ordinary development listings remain readable');
select is(public.rental_enrichment_is_readable('f1507000-0000-4000-8000-00000000a004'), false,
  'D9: a test fixture is not readable by the public');

select is(public.rental_enrichment_is_readable(null), false, 'D10: a null id is not readable');

-- Launch: the strict rule returns; the ordinary pending listing disappears.
update public.rental_runtime_settings set phase = 'launch', changed_at = now() where singleton;
select is(public.rental_enrichment_is_readable('f1507000-0000-4000-8000-00000000a001'), false,
  'L1: after launch, an unapproved unpublished listing without a landlord is not readable');

set local role anon;
select is((select count(*)::int from public.listing_embeddings
            where listing_id::text like 'f1507000-0000-4000-8000-00000000a00%'), 0,
  'L2: after launch, anon reads none of these fingerprints');
reset role;

-- A launch-ready listing (approved, published, owned by a landlord) is readable again.
insert into public.landlord_profiles (id, user_id, display_name)
values ('f1507000-0000-4000-8000-000000000011', 'f1507000-0000-4000-8000-000000000001', 'Enrich launch landlord');
update public.apartments
   set moderation_status = 'approved', listing_workflow_status = 'published',
       landlord_id = 'f1507000-0000-4000-8000-000000000011'
 where id = 'f1507000-0000-4000-8000-00000000a001';
select is(public.rental_enrichment_is_readable('f1507000-0000-4000-8000-00000000a001'), true,
  'L3: after launch, an approved published listing with a landlord is readable');

select * from finish();
rollback;
