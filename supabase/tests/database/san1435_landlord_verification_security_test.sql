-- SAN-1435 — landlord verification column-privilege proof.
--
-- Proves an authenticated landlord can edit only safe columns and cannot grant
-- themselves trusted verification state, while admin/service still can and the
-- onboarding RPC keeps working.
--
-- Run with: supabase test db
begin;

select plan(20);

-- ── Column privileges ────────────────────────────────────────────────────────
select ok(
  has_column_privilege('authenticated', 'public.landlord_profiles', 'display_name', 'UPDATE'),
  'authenticated may update display_name');
select ok(
  has_column_privilege('authenticated', 'public.landlord_profiles', 'whatsapp_e164', 'UPDATE'),
  'authenticated may update whatsapp_e164');
select ok(
  not has_column_privilege('authenticated', 'public.landlord_profiles', 'verification_status', 'UPDATE'),
  'authenticated may NOT update verification_status');
select ok(
  not has_column_privilege('authenticated', 'public.landlord_profiles', 'verified_at', 'UPDATE'),
  'authenticated may NOT update verified_at');
select ok(
  not has_column_privilege('authenticated', 'public.landlord_profiles', 'user_id', 'UPDATE'),
  'authenticated may NOT update user_id');
select ok(
  not has_column_privilege('authenticated', 'public.landlord_profiles', 'verification_status', 'INSERT'),
  'authenticated may NOT insert verification_status');

-- ── Fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email)
values
  ('d1535000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1435-owner@example.com'),
  ('d1535000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1435-fresh@example.com'),
  ('d1535000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1435-onboard@example.com');

insert into public.landlord_profiles (id, user_id, display_name, verification_status)
values ('d1535000-0000-4000-8000-000000000011',
        'd1535000-0000-4000-8000-000000000001', 'Roberto', 'pending');

-- ── A landlord edits their own safe profile ──────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1535000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$update public.landlord_profiles set display_name = 'Roberto Actualizado'
     where user_id = 'd1535000-0000-4000-8000-000000000001'$$,
  'landlord can update display_name');
select is((select display_name from public.landlord_profiles
            where user_id = 'd1535000-0000-4000-8000-000000000001'),
  'Roberto Actualizado', 'display_name change persisted');

select lives_ok(
  $$update public.landlord_profiles set whatsapp_e164 = '+573001112233'
     where user_id = 'd1535000-0000-4000-8000-000000000001'$$,
  'landlord can update whatsapp_e164');

select throws_ok(
  $$update public.landlord_profiles set verification_status = 'approved'
     where user_id = 'd1535000-0000-4000-8000-000000000001'$$,
  '42501', null::text, 'landlord cannot self-approve verification_status');
select throws_ok(
  $$update public.landlord_profiles set verified_at = now()
     where user_id = 'd1535000-0000-4000-8000-000000000001'$$,
  '42501', null::text, 'landlord cannot set verified_at');
select throws_ok(
  $$update public.landlord_profiles set user_id = 'd1535000-0000-4000-8000-000000000003'
     where user_id = 'd1535000-0000-4000-8000-000000000001'$$,
  '42501', null::text, 'landlord cannot reassign user_id');
select throws_ok(
  $$update public.landlord_profiles set total_listings = 999
     where user_id = 'd1535000-0000-4000-8000-000000000001'$$,
  '42501', null::text, 'landlord cannot edit admin counters');

-- ── A fresh landlord cannot insert a self-approved profile ───────────────────
select set_config('request.jwt.claim.sub', 'd1535000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$insert into public.landlord_profiles (user_id, display_name, verification_status)
    values ('d1535000-0000-4000-8000-000000000003', 'Fresh', 'approved')$$,
  '42501', null::text, 'landlord cannot insert a self-approved profile');
select lives_ok(
  $$insert into public.landlord_profiles (user_id, display_name, kind)
    values ('d1535000-0000-4000-8000-000000000003', 'Fresh', 'agent')$$,
  'landlord can insert a safe profile');
select is((select verification_status from public.landlord_profiles
            where user_id = 'd1535000-0000-4000-8000-000000000003'),
  'pending', 'new profile defaults to pending');

-- ── The onboarding RPC still works under the column grants ───────────────────
select set_config('request.jwt.claim.sub', 'd1535000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$select public.create_broker_onboarding_draft('Onboarding User')$$,
  'broker onboarding RPC still inserts the profile');

reset role;

-- ── The trusted backend (service_role) can still set trusted verification ────
select ok(
  has_column_privilege('service_role', 'public.landlord_profiles', 'verification_status', 'UPDATE'),
  'service_role keeps UPDATE on the trusted verification column');

set local role service_role;

select lives_ok(
  $$update public.landlord_profiles
       set verification_status = 'approved', verified_at = now()
     where user_id = 'd1535000-0000-4000-8000-000000000001'$$,
  'service_role can set trusted landlord verification');
select is((select verification_status from public.landlord_profiles
            where user_id = 'd1535000-0000-4000-8000-000000000001'),
  'approved', 'service_role verification persisted');

reset role;

select * from finish();
rollback;
