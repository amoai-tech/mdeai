-- SAN-1502 · Development verification trigger contract.
--
-- Protects the Phase A development functionality already built: an authorized MDE
-- operator may create and retain a verified development listing, while an ordinary
-- authenticated writer can neither self-verify on insert (the BEFORE INSERT trigger)
-- nor self-verify by update (the verified column is not in the authenticated UPDATE
-- grant). Phase B (launch) keeps its previous behaviour exactly.
--
-- Run with: supabase test db
begin;

-- Fixtures: one Super Admin operator and one ordinary authenticated writer, each with
-- their own landlord profile so the apartments_insert_broker policy can authorise them
-- in both phases.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('a1502000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1502-dev-admin@example.com'),
  ('a1502000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1502-dev-user@example.com');

insert into public.user_roles (user_id, role)
values ('a1502000-0000-4000-8000-000000000001', 'super_admin');

insert into public.landlord_profiles (id, user_id, display_name, verification_status)
values
  ('a1502000-0000-4000-8000-000000000011', 'a1502000-0000-4000-8000-000000000001',
   'SAN1502 Operator', 'approved'),
  ('a1502000-0000-4000-8000-000000000012', 'a1502000-0000-4000-8000-000000000002',
   'SAN1502 Ordinary', 'approved');

select plan(15);

-- ── Phase A is the default; assert it rather than assume it ──────────────────────
select is(public.rental_development_active(), true, 'Phase A is active for the development assertions');

-- ── Phase A: the Super Admin creates and retains a verified listing ──────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1502000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$insert into public.apartments
       (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status,
        landlord_id, created_by, verified)
     values ('b1502000-0000-4000-8000-000000000001', 'SAN1502 admin verified', 'san1502-admin-verified',
             'Laureles', 'active', 'approved', 'published',
             'a1502000-0000-4000-8000-000000000011', 'a1502000-0000-4000-8000-000000000001', true)$q$,
  'Phase A: Super Admin can insert a verified development listing');
reset role;
select is(
  (select verified from public.apartments where id = 'b1502000-0000-4000-8000-000000000001'),
  true, 'Phase A: the Super Admin verified=true value is retained, not reset');

-- ── Phase A: an ordinary authenticated writer cannot self-verify ─────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1502000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $q$insert into public.apartments
       (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status,
        landlord_id, created_by, verified)
     values ('b1502000-0000-4000-8000-000000000002', 'SAN1502 user verified', 'san1502-user-verified',
             'Laureles', 'active', 'approved', 'published',
             'a1502000-0000-4000-8000-000000000012', 'a1502000-0000-4000-8000-000000000002', true)$q$,
  'Phase A: an ordinary authenticated writer may create a listing');
reset role;
select is(
  (select verified from public.apartments where id = 'b1502000-0000-4000-8000-000000000002'),
  false, 'Phase A: the BEFORE INSERT trigger forces an ordinary writer to verified=false');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1502000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $q$update public.apartments set verified = true
      where id = 'b1502000-0000-4000-8000-000000000002'$q$,
  '42501', null, 'Phase A: an ordinary writer cannot self-verify by update (verified is not in the UPDATE grant)');
reset role;

-- ── Phase A: no ownership, photo-rights or approval requirement blocks development
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1502000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$insert into public.apartments
       (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status,
        landlord_id, images, created_by, verified)
     values ('b1502000-0000-4000-8000-000000000003', 'SAN1502 ownerless development', 'san1502-ownerless',
             'Laureles', 'active', 'approved', 'published',
             null, '{}', 'a1502000-0000-4000-8000-000000000001', true)$q$,
  'Phase A: an ownerless, photo-less development listing inserts without an approval or photo-rights gate');
reset role;
select is(
  (select verified from public.apartments where id = 'b1502000-0000-4000-8000-000000000003'),
  true, 'Phase A: the ownerless development listing keeps verified=true as set');
select is(
  public.rental_can_request_viewing(
    (select a from public.apartments a where a.id = 'b1502000-0000-4000-8000-000000000003')),
  true, 'Phase A: the ownerless development listing is requestable');

-- ── Phase B: launch behaviour is unchanged ──────────────────────────────────────
reset role;
update public.rental_runtime_settings set phase = 'launch' where singleton;
select is(public.rental_development_active(), false, 'Phase B is active for the launch assertions');

-- Admin launch insert keeps the existing behaviour: an authorized operator returns NEW.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1502000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $q$insert into public.apartments
       (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status,
        landlord_id, created_by, verified)
     values ('b1502000-0000-4000-8000-000000000004', 'SAN1502 launch admin', 'san1502-launch-admin',
             'Laureles', 'active', 'approved', 'published',
             'a1502000-0000-4000-8000-000000000011', 'a1502000-0000-4000-8000-000000000001', true)$q$,
  'Phase B: an authorized operator insert is unchanged');
reset role;
select is(
  (select verified from public.apartments where id = 'b1502000-0000-4000-8000-000000000004'),
  true, 'Phase B: an authorized operator insert still retains verified=true (unchanged)');

-- Ordinary launch insert is forced to a draft/unverified row, exactly as before.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1502000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $q$insert into public.apartments
       (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status,
        landlord_id, created_by, verified)
     values ('b1502000-0000-4000-8000-000000000005', 'SAN1502 launch ordinary', 'san1502-launch-ordinary',
             'Laureles', 'active', 'approved', 'published',
             'a1502000-0000-4000-8000-000000000012', 'a1502000-0000-4000-8000-000000000002', true)$q$,
  'Phase B: an ordinary launch insert is unchanged');
reset role;
select is(
  (select status || '/' || moderation_status || '/' || listing_workflow_status || '/' || verified::text
     from public.apartments where id = 'b1502000-0000-4000-8000-000000000005'),
  'inactive/pending/draft/false',
  'Phase B: an ordinary launch insert is still forced to inactive/pending/draft/false');

-- The UPDATE grant guard is phase-independent.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1502000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $q$update public.apartments set verified = true
      where id = 'b1502000-0000-4000-8000-000000000005'$q$,
  '42501', null, 'Phase B: an ordinary writer still cannot self-verify by update');
reset role;

select * from finish();
rollback;
