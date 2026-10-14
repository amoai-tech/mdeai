-- SAN-1451 — an external source advertisement can never be marked verified.
-- Proves the guard (any role, insert and update) and that ordinary listings are unaffected.
-- Run with: supabase test db
begin;
select plan(10);

select has_function('public', 'reject_verified_external_advertisement', array[]::text[],
  'the guard function exists');
select ok(
  not has_function_privilege('anon', 'public.reject_verified_external_advertisement()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.reject_verified_external_advertisement()', 'EXECUTE'),
  'the guard function is not executable by anon or authenticated');
select ok(
  exists (select 1 from pg_trigger
           where tgrelid = 'public.apartments'::regclass
             and tgname = 'apartments_reject_verified_external' and not tgisinternal),
  'the guard trigger is installed on apartments');

-- A landlord to own the fixtures (same shape the neighbouring SAN-14xx tests use).
insert into auth.users (id, instance_id, aud, role, email)
values ('51451451-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'san1451@example.com');
insert into public.landlord_profiles (id, user_id, display_name)
values ('51451451-0000-4000-8000-0000000000a1', '51451451-0000-4000-8000-000000000001', 'SAN1451 owner');

-- Insert: external + verified is rejected, whichever marker identifies it.
select throws_ok($$
  insert into public.apartments (slug, title, neighborhood, landlord_id, verified, metadata)
  values ('san1451-ext-kind', 'x', 'x', '51451451-0000-4000-8000-0000000000a1', true,
          '{"inventory_kind":"external_candidate"}'::jsonb)$$,
  '23514', 'an external source advertisement cannot be marked verified',
  'insert: inventory_kind external_candidate + verified is rejected');
select throws_ok($$
  insert into public.apartments (slug, title, neighborhood, landlord_id, verified, metadata)
  values ('san1451-ext-action', 'x', 'x', '51451451-0000-4000-8000-0000000000a1', true,
          '{"allowed_action":"view_original_listing"}'::jsonb)$$,
  '23514', 'an external source advertisement cannot be marked verified',
  'insert: allowed_action view_original_listing + verified is rejected');

-- Update: an unverified external row cannot be upgraded.
insert into public.apartments (slug, title, neighborhood, landlord_id, verified, metadata)
values ('san1451-ext-update', 'x', 'x', '51451451-0000-4000-8000-0000000000a1', false,
        '{"inventory_kind":"external_candidate"}'::jsonb);
select throws_ok($$update public.apartments set verified = true where slug = 'san1451-ext-update'$$,
  '23514', 'an external source advertisement cannot be marked verified',
  'update: upgrading an external row to verified is rejected');
select is((select verified from public.apartments where slug = 'san1451-ext-update'), false,
  'the rejected upgrade left the row unverified');

-- Update: marking an ordinary row external while it is verified is also rejected.
insert into public.apartments (slug, title, neighborhood, landlord_id, verified, metadata)
values ('san1451-own', 'x', 'x', '51451451-0000-4000-8000-0000000000a1', true, '{}'::jsonb);
select throws_ok($$
  update public.apartments
     set metadata = '{"inventory_kind":"external_candidate"}'::jsonb
   where slug = 'san1451-own'$$,
  '23514', 'an external source advertisement cannot be marked verified',
  'update: relabelling a verified row as external is rejected');

-- Ordinary listings keep working; external rows can be unverified and edited.
select lives_ok($$update public.apartments set verified = true where slug = 'san1451-own'$$,
  'an ordinary listing can still be verified');
select lives_ok($$update public.apartments set verified = false where slug = 'san1451-ext-update'$$,
  'an external row can be set (or left) unverified');

select * from finish();
rollback;
