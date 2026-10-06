-- SAN-1105 · Broker isolation — two-user proof + apartment-orphan guard.
--
-- WHAT THIS LOCKS IN
--   1. `showings` INSERT authorizes through the owning-broker chain
--      auth.uid() → landlord_profiles.user_id → landlord_profiles.id → apartments.landlord_id,
--      and through nothing else. No `leads.user_id`, no `assigned_agent_id`, no `is_admin()`.
--   2. Broker A reads only A data and Broker B reads only B data, both directions.
--   3. A signed-in user with no landlord profile owns nothing: acting_landlord_ids() is empty.
--   4. Anonymous cannot read private leads or showings.
--   5. `apartments_landlord_id_fkey` is ON DELETE RESTRICT, so deleting an owner with listings
--      fails loudly instead of silently orphaning them.
--
-- PRIMARY VS DEFENCE-IN-DEPTH
--   SAN-1206 (2026-09-29) revoked INSERT/UPDATE/DELETE on public.showings from authenticated. The
--   primary control for a direct signed-in INSERT is therefore the *table privilege* (42501), not
--   the RLS policy. Section F proves both: the privilege refusal as the production behaviour, and
--   — under a transaction-scoped probe grant that is rolled back — that the corrected policy
--   admits the owning broker and rejects a non-owner. Without the probe the policy alignment would
--   be unobservable.
--
-- FIXTURES follow the established san1349 pattern: a real auth.users → landlord_profiles chain,
-- auth.uid() simulated with request.jwt.claim.sub, all transaction-owned and rolled back.
--
-- Run with: supabase test db

begin;

select plan(26);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIXTURES
-- ═══════════════════════════════════════════════════════════════════════════════

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('a1105000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1105-broker-a@example.com',
   extensions.crypt('san1105-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('a1105000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1105-broker-b@example.com',
   extensions.crypt('san1105-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('a1105000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1105-owner-c@example.com',
   extensions.crypt('san1105-fixture', extensions.gen_salt('bf')), now(), now(), now());

insert into public.landlord_profiles (id, user_id, display_name, verification_status)
values
  ('a1105000-0000-4000-8000-000000000011', 'a1105000-0000-4000-8000-000000000001',
   'SAN1105 Broker A', 'approved'),
  ('a1105000-0000-4000-8000-000000000012', 'a1105000-0000-4000-8000-000000000002',
   'SAN1105 Broker B', 'approved'),
  -- Profile C owns no apartment, so it is the deletable control for the orphan guard.
  ('a1105000-0000-4000-8000-000000000013', 'a1105000-0000-4000-8000-000000000005',
   'SAN1105 Owner C', 'approved');

insert into public.profiles (id, email, full_name)
values ('a1105000-0000-4000-8000-000000000003', 'san1105-renter@example.com', 'SAN1105 Renter');

-- A's apartment is deliberately 'active' so Broker B can read it through the public catalog
-- policy; the INSERT denial in section F is then attributable to ownership, not row visibility.
insert into public.apartments
  (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status,
   landlord_id, available_to)
values
  ('b1105000-0000-4000-8000-000000000001', 'SAN1105 A active', 'san1105-a-active',
   'Laureles', 'active', 'pending', 'draft',
   'a1105000-0000-4000-8000-000000000011', '2099-12-31'),
  ('b1105000-0000-4000-8000-000000000002', 'SAN1105 B inactive', 'san1105-b-inactive',
   'Laureles', 'inactive', 'pending', 'draft',
   'a1105000-0000-4000-8000-000000000012', '2099-12-31');

insert into public.leads
  (id, user_id, source, email, name, apartment_id, preferred_showing_at, intent, status,
   pipeline_stage, metadata, idempotency_key)
values
  ('c1105000-0000-4000-8000-000000000001', 'a1105000-0000-4000-8000-000000000003', 'form',
   'san1105-renter@example.com', 'SAN1105 Renter', 'b1105000-0000-4000-8000-000000000001',
   '2099-11-01 14:00:00+00', 'rental', 'new', 'showing_scheduled', '{}'::jsonb,
   'san1105-fixture-lead-a'),
  ('c1105000-0000-4000-8000-000000000002', 'a1105000-0000-4000-8000-000000000003', 'form',
   'san1105-renter@example.com', 'SAN1105 Renter', 'b1105000-0000-4000-8000-000000000002',
   '2099-11-02 14:00:00+00', 'rental', 'new', 'showing_scheduled', '{}'::jsonb,
   'san1105-fixture-lead-b');

insert into public.showings (id, lead_id, apartment_id, scheduled_at, status, metadata)
values
  ('d1105000-0000-4000-8000-000000000001', 'c1105000-0000-4000-8000-000000000001',
   'b1105000-0000-4000-8000-000000000001', '2099-11-01 14:00:00+00', 'scheduled', '{}'::jsonb),
  ('d1105000-0000-4000-8000-000000000002', 'c1105000-0000-4000-8000-000000000002',
   'b1105000-0000-4000-8000-000000000002', '2099-11-02 14:00:00+00', 'scheduled', '{}'::jsonb);

-- ═══════════════════════════════════════════════════════════════════════════════
-- A · CONTRACT — one ownership model, and the orphan boundary is explicit.
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(
  exists (select 1 from pg_policies
           where schemaname = 'public' and tablename = 'showings'
             and policyname = 'showings_insert_broker' and cmd = 'INSERT'),
  'A1: showings_insert_broker exists for INSERT');

select ok(
  (select position('apartments' in with_check) > 0
      and position('acting_landlord_ids' in with_check) > 0
   from pg_policies
   where schemaname = 'public' and tablename = 'showings'
     and policyname = 'showings_insert_broker'),
  'A2: the INSERT policy authorizes through apartments + acting_landlord_ids()');

select ok(
  (select position('leads' in with_check) = 0
   from pg_policies
   where schemaname = 'public' and tablename = 'showings'
     and policyname = 'showings_insert_broker'),
  'A3: the INSERT policy no longer authorizes through the lead-owner model');

select ok(
  not exists (select 1 from pg_policies
               where schemaname = 'public' and tablename = 'showings'
                 and policyname = 'showings_insert_authenticated'),
  'A4: the old lead-owner INSERT policy is gone');

select ok(
  (select position('ON DELETE RESTRICT' in pg_get_constraintdef(oid)) > 0
   from pg_constraint
   where conrelid = 'public.apartments'::regclass
     and conname = 'apartments_landlord_id_fkey'),
  'A5: apartments_landlord_id_fkey is ON DELETE RESTRICT');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($q$ select public.acting_landlord_ids() $q$, '42501', NULL,
  'A6: anon cannot execute acting_landlord_ids()');
reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- B · BROKER A — reads own rows, and none of B's.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1105000-0000-4000-8000-000000000001', true);

select is((select count(*)::int from public.apartments
            where id = 'b1105000-0000-4000-8000-000000000001'), 1,
  'B1: Broker A reads its own apartment');
select is((select count(*)::int from public.leads
            where id = 'c1105000-0000-4000-8000-000000000001'), 1,
  'B2: Broker A reads the lead on its own apartment');
select is((select count(*)::int from public.showings
            where id = 'd1105000-0000-4000-8000-000000000001'), 1,
  'B3: Broker A reads the showing on its own apartment');
select is((select count(*)::int from public.leads
            where id = 'c1105000-0000-4000-8000-000000000002'), 0,
  'B4: Broker A sees zero of Broker B private leads');
select is((select count(*)::int from public.showings
            where id = 'd1105000-0000-4000-8000-000000000002'), 0,
  'B5: Broker A sees zero of Broker B private showings');
reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- C · BROKER B — the reverse direction is not assumed from section B.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1105000-0000-4000-8000-000000000002', true);

select is((select count(*)::int from public.leads
            where id = 'c1105000-0000-4000-8000-000000000002'), 1,
  'C1: Broker B reads the lead on its own apartment');
select is((select count(*)::int from public.showings
            where id = 'd1105000-0000-4000-8000-000000000002'), 1,
  'C2: Broker B reads the showing on its own apartment');
select is((select count(*)::int from public.leads
            where id = 'c1105000-0000-4000-8000-000000000001'), 0,
  'C3: Broker B sees zero of Broker A private leads');
select is((select count(*)::int from public.showings
            where id = 'd1105000-0000-4000-8000-000000000001'), 0,
  'C4: Broker B sees zero of Broker A private showings');
select throws_ok($q$
  update public.showings set status = 'completed'
  where id = 'd1105000-0000-4000-8000-000000000001'
$q$, '42501', NULL, 'C5: Broker B cannot update Broker A private showing');
reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- D · NO-PROFILE AUTHENTICATED — signed in but owns nothing.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1105000-0000-4000-8000-000000000004', true);

select is((select count(*)::int from public.acting_landlord_ids()), 0,
  'D1: acting_landlord_ids() is empty for a signed-in user with no landlord profile');
select is((select count(*)::int from public.leads
            where id = 'c1105000-0000-4000-8000-000000000001'), 0,
  'D2: the no-profile user sees zero private leads');
select is((select count(*)::int from public.showings
            where id = 'd1105000-0000-4000-8000-000000000001'), 0,
  'D3: the no-profile user sees zero private showings');
reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- E · ANONYMOUS
-- ═══════════════════════════════════════════════════════════════════════════════

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok($q$
  select count(*) from public.showings
  where id = 'd1105000-0000-4000-8000-000000000001'
$q$, '42501', NULL, 'E1: anon cannot read private showings');
select is((select count(*)::int from public.leads
            where id = 'c1105000-0000-4000-8000-000000000001'), 0,
  'E2: anon sees zero private leads');
reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- F · INSERT POLICY — production refusal, then the corrected policy under a probe grant.
--     The probe grant is transaction-scoped and rolled back; it never reaches production.
-- ═══════════════════════════════════════════════════════════════════════════════

grant insert on public.showings to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1105000-0000-4000-8000-000000000001', true);
select lives_ok($q$
  insert into public.showings (id, lead_id, apartment_id, scheduled_at, status, metadata)
  values ('d1105000-0000-4000-8000-000000000003',
          'c1105000-0000-4000-8000-000000000001',
          'b1105000-0000-4000-8000-000000000001',
          '2099-11-03 14:00:00+00', 'scheduled', '{}'::jsonb)
$q$, 'F1: the owning broker may create a showing for its own apartment');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1105000-0000-4000-8000-000000000002', true);
select throws_ok($q$
  insert into public.showings (id, lead_id, apartment_id, scheduled_at, status, metadata)
  values ('d1105000-0000-4000-8000-000000000004',
          'c1105000-0000-4000-8000-000000000001',
          'b1105000-0000-4000-8000-000000000001',
          '2099-11-04 14:00:00+00', 'scheduled', '{}'::jsonb)
$q$, '42501', NULL, 'F2: a non-owner cannot create a showing for another broker apartment');
reset role;

revoke insert on public.showings from authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- G · ORPHAN GUARD — deleting an owner with listings is refused; an owner with none
--     remains deletable, so the guard is a real boundary and not a blanket block.
-- ═══════════════════════════════════════════════════════════════════════════════

select throws_ok($q$
  delete from public.landlord_profiles
  where id = 'a1105000-0000-4000-8000-000000000011'
$q$, '23503', NULL, 'G1: deleting an owner that still has apartments is refused');

select lives_ok($q$
  delete from public.landlord_profiles
  where id = 'a1105000-0000-4000-8000-000000000013'
$q$, 'G2: deleting an owner with no apartments succeeds');

-- ═══════════════════════════════════════════════════════════════════════════════
-- H · SERVICE_ROLE — server/edge keeps the read path it legitimately needs.
-- ═══════════════════════════════════════════════════════════════════════════════

set local role service_role;
select is((select count(*)::int from public.showings
            where id = 'd1105000-0000-4000-8000-000000000001'), 1,
  'H1: service_role retains access to the showing');
reset role;

select * from finish();
rollback;
