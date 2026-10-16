-- SAN-1502 · development: search vectors follow apartment visibility for signed-in users
-- Proves: in development a signed-in user reads the vectors of an apartment they can read (even when it is
-- not publicly eligible); vectors of an apartment they cannot read (another owner's draft, inactive rows)
-- stay hidden; the owner still reads their own; anonymous visitors read none; no write access is gained;
-- in launch the same user is back to the public rules.
-- Run with: supabase test db
begin;

select plan(10);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f1520000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-dev@example.com'),
  ('f1520000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'renter-dev@example.com');
insert into public.landlord_profiles (id, user_id, display_name)
values ('f1520000-0000-4000-8000-0000000000a1', 'f1520000-0000-4000-8000-000000000011', 'Owner Dev');

-- c1: active but NOT publicly eligible (unapproved, no owner): readable by a signed-in user in development
-- c2: inactive, no owner: not readable by other users
-- c3: another owner's inactive draft: not readable by other users, readable by its owner
insert into public.apartments (id, title, neighborhood, description, bedrooms, status, moderation_status, listing_workflow_status, landlord_id, metadata)
values ('00000000-0000-4000-8000-00000052c001', 'DEV active unapproved', 'Laureles', 'x', 1, 'active',   'pending', 'draft', null, '{}'),
       ('00000000-0000-4000-8000-00000052c002', 'DEV inactive',         'Laureles', 'x', 1, 'inactive', 'pending', 'draft', null, '{}'),
       ('00000000-0000-4000-8000-00000052c003', 'DEV owner draft',      'Laureles', 'x', 1, 'inactive', 'pending', 'draft', 'f1520000-0000-4000-8000-0000000000a1', '{}');
insert into public.listing_embeddings (listing_id, embedding, model, content_hash)
select id, array_fill(0.01::float8, array[768])::extensions.vector, 'gemini-embedding-001', 'x'
  from public.apartments where id::text like '00000000-0000-4000-8000-00000052c%';

select is((select phase from public.rental_runtime_settings where singleton), 'development', 'setup: the rental phase is development');

-- ── development, signed-in renter ----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1520000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.listing_embeddings where listing_id = '00000000-0000-4000-8000-00000052c001'), 1,
  'development: a signed-in user reads the vector of an apartment they can read, even if it is not publicly eligible');
select is((select count(*)::int from public.listing_embeddings where listing_id in ('00000000-0000-4000-8000-00000052c002', '00000000-0000-4000-8000-00000052c003')), 0,
  'development: and not the vectors of apartments they cannot read (inactive, another owner''s draft)');
update public.listing_embeddings set content_hash = 'hijack' where listing_id = '00000000-0000-4000-8000-00000052c001';
reset role;
select is((select content_hash from public.listing_embeddings where listing_id = '00000000-0000-4000-8000-00000052c001'), 'x',
  'development: read access gives no write access to vectors');

-- ── development, the owner ------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1520000-0000-4000-8000-000000000011","role":"authenticated"}', true);
select is((select count(*)::int from public.listing_embeddings where listing_id = '00000000-0000-4000-8000-00000052c003'), 1,
  'development: the owner reads the vector of their own draft');
reset role;

-- ── anonymous visitors get nothing extra ---------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true); -- a real anonymous request carries no user id
select is((select count(*)::int from public.listing_embeddings where listing_id::text like '00000000-0000-4000-8000-00000052c%'), 0,
  'development: an anonymous visitor reads none of these vectors');
reset role;

-- ── the same rule covers rental_signals ----------------------------------------------------------------------
insert into public.rental_signals (apartment_id)
values ('00000000-0000-4000-8000-00000052c001'), ('00000000-0000-4000-8000-00000052c002');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1520000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.rental_signals where apartment_id = '00000000-0000-4000-8000-00000052c001'), 1,
  'development: a signed-in user reads the signals of an apartment they can read');
select is((select count(*)::int from public.rental_signals where apartment_id = '00000000-0000-4000-8000-00000052c002'), 0,
  'development: and not the signals of one they cannot read');
reset role;

-- ── launch: back to the public rules -------------------------------------------------------------------------
update public.rental_runtime_settings set phase = 'launch' where singleton;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1520000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.listing_embeddings where listing_id = '00000000-0000-4000-8000-00000052c001'), 0,
  'launch: the same user no longer reads that vector');
select is((select count(*)::int from public.rental_signals where apartment_id = '00000000-0000-4000-8000-00000052c001'), 0,
  'launch: nor those signals');
reset role;

select * from finish();
rollback;
