-- =============================================================================
-- SAN-1385 · New Projects data foundation — RLS, idempotency, integrity
-- =============================================================================
-- Run with: supabase test db
-- =============================================================================

begin;

select plan(43);

-- ── fixtures (owner/superuser; RLS not yet switched) ─────────────────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('e1385000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1385-buyer-a@example.com',
   extensions.crypt('san1385-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('e1385000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1385-buyer-b@example.com',
   extensions.crypt('san1385-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('e1385000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1385-member-a@example.com',
   extensions.crypt('san1385-fixture', extensions.gen_salt('bf')), now(), now(), now()),
  ('e1385000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1385-member-b@example.com',
   extensions.crypt('san1385-fixture', extensions.gen_salt('bf')), now(), now(), now());

insert into public.profiles (id, email, full_name) values
  ('e1385000-0000-4000-8000-000000000001', 'san1385-buyer-a@example.com', 'SAN1385 Buyer A'),
  ('e1385000-0000-4000-8000-000000000002', 'san1385-buyer-b@example.com', 'SAN1385 Buyer B'),
  ('e1385000-0000-4000-8000-000000000003', 'san1385-member-a@example.com', 'SAN1385 Member A'),
  ('e1385000-0000-4000-8000-000000000004', 'san1385-member-b@example.com', 'SAN1385 Member B')
on conflict (id) do nothing;

insert into public.partners (id, profile_id, type, status) values
  ('f1385000-0000-4000-8000-000000000001', 'e1385000-0000-4000-8000-000000000003', 'developer', 'active'),
  ('f1385000-0000-4000-8000-000000000002', 'e1385000-0000-4000-8000-000000000004', 'developer', 'active');

insert into public.partner_members (partner_id, profile_id, role) values
  ('f1385000-0000-4000-8000-000000000001', 'e1385000-0000-4000-8000-000000000003', 'owner'),
  ('f1385000-0000-4000-8000-000000000002', 'e1385000-0000-4000-8000-000000000004', 'owner');

insert into public.development_projects
  (id, partner_id, ownership_status, source_owner, source_key, slug, name, city, neighborhood,
   publish_state, price_from_cents, currency, verified_at, source_kind, source_url)
values
  ('a1385000-0000-4000-8000-000000000001', 'f1385000-0000-4000-8000-000000000001',
   'claimed', 'G+ Proyectos', 'san1385-nexus', 'san1385-nexus', 'SAN1385 Nexus', 'Medellín', 'Laureles',
   'published', 75000000000, 'COP', now(), 'developer', 'https://example.com/nexus'),
  ('a1385000-0000-4000-8000-000000000002', 'f1385000-0000-4000-8000-000000000001',
   'claimed', 'Arco', 'san1385-draft', 'san1385-draft', 'SAN1385 Draft', 'Medellín', 'Laureles',
   'draft', 50000000000, 'COP', now(), 'developer', 'https://example.com/draft'),
  ('a1385000-0000-4000-8000-000000000003', 'f1385000-0000-4000-8000-000000000002',
   'claimed', 'Amarilo', 'san1385-arrayan', 'san1385-arrayan', 'SAN1385 Arrayán', 'Medellín', 'El Poblado',
   'published', 90000000000, 'COP', now(), 'developer', 'https://example.com/arrayan');

insert into public.development_unit_types (id, project_id, source_key, name, bedrooms, price_from_cents)
values ('b1385000-0000-4000-8000-000000000001', 'a1385000-0000-4000-8000-000000000001',
        'nexus-2br', '2BR', 2, 78000000000);

insert into public.development_project_sources (id, project_id, source_url, source_type, http_status, checked_at)
values
  ('c1385000-0000-4000-8000-000000000001', 'a1385000-0000-4000-8000-000000000001',
   'https://example.com/nexus', 'developer', 200, now()),
  ('c1385000-0000-4000-8000-000000000002', 'a1385000-0000-4000-8000-000000000002',
   'https://example.com/draft', 'developer', 200, now());

insert into public.partner_commission_agreements
  (id, partner_id, project_id, version, status, commission_type, commission_value, currency,
   calculation_basis, commission_trigger, protection_days)
values
  ('d1385000-0000-4000-8000-000000000001', 'f1385000-0000-4000-8000-000000000001',
   'a1385000-0000-4000-8000-000000000001', 1, 'active', 'percentage', 3.0, 'COP',
   'sale_price', 'deed', 180),
  ('d1385000-0000-4000-8000-000000000002', 'f1385000-0000-4000-8000-000000000002',
   'a1385000-0000-4000-8000-000000000003', 1, 'active', 'percentage', 2.5, 'COP',
   'sale_price', 'deed', 180);

-- ── A · catalog contract (12) ────────────────────────────────────────────────
select ok(exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'partner_type' and e.enumlabel = 'developer'), 'A1 partner_type has developer');
select ok(exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'booking_type' and e.enumlabel = 'new_project_consultation'), 'A2 booking_type has new_project_consultation');
select ok((select position('commission' in pg_get_constraintdef(oid)) > 0 from pg_constraint
  where conname = 'revenue_ledger_source_kind_check'), 'A3 revenue_ledger allows commission');
select ok(exists (select 1 from pg_constraint where conname = 'leads_listing_kind_check'), 'A4 leads listing_kind is constrained');
select ok((select is_nullable = 'YES' from information_schema.columns
  where table_schema = 'public' and table_name = 'development_projects' and column_name = 'partner_id'), 'A5 development_projects.partner_id is nullable');
select ok(to_regprocedure('public.lead_listing_owner_aligned(uuid,text,uuid,uuid)') is not null, 'A6 alignment function exists');
select ok(to_regprocedure('public.register_new_project_buyer(uuid,text,jsonb,text,text,text)') is not null, 'A7 register RPC exists');
select ok(to_regprocedure('public.post_new_project_commission(uuid,bigint,text,jsonb)') is not null, 'A8 commission RPC exists');
select is(has_function_privilege('anon', 'public.register_new_project_buyer(uuid,text,jsonb,text,text,text)', 'EXECUTE'), false, 'A9 anon cannot execute register RPC');
select is(has_function_privilege('authenticated', 'public.register_new_project_buyer(uuid,text,jsonb,text,text,text)', 'EXECUTE'), true, 'A10 authenticated can execute register RPC');
select is(has_function_privilege('anon', 'public.post_new_project_commission(uuid,bigint,text,jsonb)', 'EXECUTE'), false, 'A11 anon cannot execute commission RPC');
select ok(exists (select 1 from pg_indexes where indexname = 'idx_bookings_idempotency_user_new_project')
  and exists (select 1 from pg_indexes where indexname = 'idx_bookings_idempotency_user'), 'A12 both booking idempotency indexes exist');

-- ── B · anon sees published only (3) ─────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from public.development_projects where id = 'a1385000-0000-4000-8000-000000000001'), 1, 'B1 anon reads published project');
select is((select count(*)::int from public.development_projects where id = 'a1385000-0000-4000-8000-000000000002'), 0, 'B2 anon cannot read draft project');
select is((select count(*)::int from public.development_project_sources where project_id = 'a1385000-0000-4000-8000-000000000001'), 1, 'B3 anon reads published provenance');
select throws_ok(
  $$insert into public.development_projects (source_key, slug, name, publish_state, verified_at)
    values ('san1385-anon', 'san1385-anon', 'Anon', 'draft', now())$$,
  '42501', null, 'B4 anon cannot insert even with platform table grants (RLS denies)');

-- ── C/D · buyer + partner isolation (8) ──────────────────────────────────────
reset role;
set local role authenticated;

select set_config('request.jwt.claim.sub', 'e1385000-0000-4000-8000-000000000001', true);
select ok((public.register_new_project_buyer(
  'a1385000-0000-4000-8000-000000000001', 'san1385-reg-a-0001',
  '{"budget_min": 750000000, "purpose": "investment"}'::jsonb,
  'buyer-a@example.com', '+57 300 000 0001', 'Buyer A') ->> 'registration_id') is not null,
  'C0 buyer A registration commits');

select set_config('request.jwt.claim.sub', 'e1385000-0000-4000-8000-000000000002', true);
select ok((public.register_new_project_buyer(
  'a1385000-0000-4000-8000-000000000003', 'san1385-reg-b-0001',
  '{"budget_min": 900000000}'::jsonb,
  'buyer-b@example.com', null, 'Buyer B') ->> 'registration_id') is not null,
  'C0b buyer B registration commits');

select set_config('request.jwt.claim.sub', 'e1385000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.developer_lead_registrations
  where project_id = 'a1385000-0000-4000-8000-000000000001'), 1, 'D1 buyer A sees own registration');
select is((select count(*)::int from public.developer_lead_registrations
  where project_id = 'a1385000-0000-4000-8000-000000000003'), 0, 'D2 buyer A cannot see buyer B registration');

select set_config('request.jwt.claim.sub', 'e1385000-0000-4000-8000-000000000003', true);
select is((select count(*)::int from public.developer_lead_registrations
  where project_id = 'a1385000-0000-4000-8000-000000000001'), 1, 'C1 partner A sees own registration');
select is((select count(*)::int from public.developer_lead_registrations
  where project_id = 'a1385000-0000-4000-8000-000000000003'), 0, 'C2 partner A cannot see partner B registration');
select set_config('request.jwt.claim.sub', 'e1385000-0000-4000-8000-000000000004', true);
select is((select count(*)::int from public.developer_lead_registrations
  where project_id = 'a1385000-0000-4000-8000-000000000003'), 1, 'C3 partner B sees own registration');

select set_config('request.jwt.claim.sub', 'e1385000-0000-4000-8000-000000000003', true);
with u as (
  update public.developer_lead_registrations set developer_reference = 'forged'
  where project_id = 'a1385000-0000-4000-8000-000000000003'
  returning 1
)
select set_config('san1385.c4_updated', count(*)::text, true) from u;
select is(current_setting('san1385.c4_updated')::int, 0, 'C4 partner A update on partner B registration is denied');

-- ── E · registration idempotency (4) ─────────────────────────────────────────
select set_config('request.jwt.claim.sub', 'e1385000-0000-4000-8000-000000000001', true);
select is((public.register_new_project_buyer(
  'a1385000-0000-4000-8000-000000000001', 'san1385-reg-a-0001') ->> 'idempotent_replay')::boolean,
  true, 'E1 registration replay is idempotent');
select is((select count(*)::int from public.leads
  where user_id = 'e1385000-0000-4000-8000-000000000001' and idempotency_key = 'san1385-reg-a-0001'), 1, 'E2 one lead for the logical registration');
select is((select count(*)::int from public.developer_lead_registrations dr
  join public.leads l on l.id = dr.lead_id
  where l.user_id = 'e1385000-0000-4000-8000-000000000001' and l.idempotency_key = 'san1385-reg-a-0001'), 1, 'E3 one registration for the logical registration');
select throws_ok(
  $$select public.register_new_project_buyer('a1385000-0000-4000-8000-000000000003', 'san1385-reg-a-0001')$$,
  'P0001', null, 'E4 idempotency key reused for a different project is rejected');

-- ── F · attribution + booking (6) ────────────────────────────────────────────
select set_config('request.jwt.claim.sub', 'e1385000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.decide_developer_registration(
      (select id from public.developer_lead_registrations where project_id = 'a1385000-0000-4000-8000-000000000003'),
      'accepted')$$,
  'P0001', null, 'F1 partner A cannot accept partner B registration');

select is((public.decide_developer_registration(
  (select dr.id from public.developer_lead_registrations dr
     join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'),
  'accepted', null, 'DEV-REF-1') ->> 'status'), 'accepted', 'F2 partner A accepts its registration');

select throws_ok(
  $$select public.decide_developer_registration(
      (select dr.id from public.developer_lead_registrations dr
         join public.leads l on l.id = dr.lead_id
         where l.user_id = 'e1385000-0000-4000-8000-000000000001'),
      'accepted')$$,
  'P0001', null, 'F3 re-deciding a non-pending registration is rejected');

select set_config('request.jwt.claim.sub', 'e1385000-0000-4000-8000-000000000001', true);
select ok((public.book_new_project_consultation(
  'a1385000-0000-4000-8000-000000000001',
  (select dr.id from public.developer_lead_registrations dr
     join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'),
  current_date + 3, '14:00'::time, 'san1385-book-a-0001', '15:00'::time, 'site visit') ->> 'booking_id') is not null,
  'F4 buyer A consultation commits');
select is((public.book_new_project_consultation(
  'a1385000-0000-4000-8000-000000000001',
  (select dr.id from public.developer_lead_registrations dr
     join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'),
  current_date + 3, '14:00'::time, 'san1385-book-a-0001', '15:00'::time, 'site visit') ->> 'idempotent_replay')::boolean,
  true, 'F5 consultation replay is idempotent');
select is((select count(*)::int from public.bookings
  where user_id = 'e1385000-0000-4000-8000-000000000001'
    and booking_type = 'new_project_consultation'), 1, 'F6 one consultation booking for the logical request');

-- ── F · commission (6) ───────────────────────────────────────────────────────
select throws_ok(
  $$select public.post_new_project_commission(
      (select dr.id from public.developer_lead_registrations dr
         join public.leads l on l.id = dr.lead_id
         where l.user_id = 'e1385000-0000-4000-8000-000000000001'),
      100000000, 'san1385-claim-0001')$$,
  'P0001', null, 'F7 buyer cannot post a commission');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select is((public.post_new_project_commission(
  (select dr.id from public.developer_lead_registrations dr
     join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'),
  100000000, 'san1385-claim-0001', '{"trigger": "deed"}'::jsonb) ->> 'claim_state'), 'earned',
  'F8 service role posts one commission');
select is((select commission_cents::int from public.commission_claims
  where idempotency_key = 'san1385-claim-0001'), 3000000, 'F9 commission is 3% of the sale price');
select is((public.post_new_project_commission(
  (select dr.id from public.developer_lead_registrations dr
     join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'),
  100000000, 'san1385-claim-0001', '{"trigger": "deed"}'::jsonb) ->> 'idempotent_replay')::boolean,
  true, 'F10 commission replay is idempotent');
select is((select count(*)::int from public.revenue_ledger rl
  join public.commission_claims cc on cc.id = rl.source_id
  where rl.source_kind = 'commission' and cc.idempotency_key = 'san1385-claim-0001'), 1,
  'F11 exactly one ledger entry for the commission');
select is((select count(*)::int from public.developer_lead_registrations dr
  join public.leads l on l.id = dr.lead_id
  where l.user_id = 'e1385000-0000-4000-8000-000000000001'), 1, 'F12 one registration per logical request');

-- ── G · integrity + regression safety (3) ────────────────────────────────────
select throws_ok(
  $$insert into public.bookings (user_id, booking_type, resource_id, resource_title, status, start_date, partner_id)
    values ('e1385000-0000-4000-8000-000000000001', 'new_project_consultation',
            'a1385000-0000-4000-8000-000000000001', 'Mismatched', 'pending', current_date,
            'f1385000-0000-4000-8000-000000000002')$$,
  'P0001', null, 'G1 mismatched consultation project/partner pair is rejected');
select throws_ok(
  $$update public.developer_lead_registrations
    set project_id = 'a1385000-0000-4000-8000-000000000003'
    where project_id = 'a1385000-0000-4000-8000-000000000001'$$,
  '23514', null, 'G2 accepted attribution project cannot be reassigned');
select throws_ok(
  $$insert into public.leads (source, listing_kind, listing_id)
    values ('test', 'event', 'a1385000-0000-4000-8000-000000000001')$$,
  '23514', null, 'G3 unknown listing kind fails closed');

select * from finish();
rollback;
