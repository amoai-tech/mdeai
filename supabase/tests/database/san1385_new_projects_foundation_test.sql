-- =============================================================================
-- SAN-1385 · New Projects data foundation — RLS, idempotency, integrity, least privilege
-- Run with: supabase test db
-- =============================================================================

begin;

select plan(64);

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

insert into public.development_project_sources (id, project_id, source_url, source_type, http_status, checked_at, observed_facts)
values
  ('c1385000-0000-4000-8000-000000000001', 'a1385000-0000-4000-8000-000000000001',
   'https://example.com/nexus', 'developer', 200, now(), '{"price_from_cop": 750000000}'::jsonb),
  ('c1385000-0000-4000-8000-000000000002', 'a1385000-0000-4000-8000-000000000002',
   'https://example.com/draft', 'developer', 200, now(), '{}'::jsonb);

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

-- ── A · catalog + least-privilege contract (24) ──────────────────────────────
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
select is(has_table_privilege('anon', 'public.development_projects', 'TRUNCATE'), false, 'A13 anon has no TRUNCATE');
select is(has_table_privilege('authenticated', 'public.development_projects', 'TRUNCATE'), false, 'A14 authenticated has no TRUNCATE');
select is(has_table_privilege('anon', 'public.development_projects', 'INSERT'), false, 'A15 anon cannot INSERT');
select is(has_table_privilege('authenticated', 'public.development_projects', 'SELECT'), true, 'A16 authenticated can SELECT projects');
select is(has_table_privilege('authenticated', 'public.developer_lead_registrations', 'UPDATE'), false, 'A17 authenticated cannot directly UPDATE registrations');
select is(has_table_privilege('authenticated', 'public.developer_lead_registrations', 'SELECT'), true, 'A18 authenticated can SELECT registrations');
select is(has_table_privilege('authenticated', 'public.commission_claims', 'UPDATE'), false, 'A19 authenticated cannot directly UPDATE claims');
select is(has_table_privilege('anon', 'public.commission_claims', 'SELECT'), false, 'A20 anon cannot read claims');
select is(has_table_privilege('authenticated', 'public.developer_lead_registration_stage_events', 'SELECT'), true, 'A21 authenticated can read own stage history');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public'
  and table_name = 'development_project_sources' and column_name = 'observed_facts'), 'A22 provenance records observed_facts');
select ok(to_regprocedure('public.advance_developer_registration_stage(uuid,text,jsonb)') is not null, 'A23 stage RPC exists');
select ok(to_regprocedure('public.sales_stage_at_least(text,text)') is not null, 'A24 stage-order helper exists');

-- ── B · anon sees published only (4) ─────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from public.development_projects where id = 'a1385000-0000-4000-8000-000000000001'), 1, 'B1 anon reads published project');
select is((select count(*)::int from public.development_projects where id = 'a1385000-0000-4000-8000-000000000002'), 0, 'B2 anon cannot read draft project');
select is((select count(*)::int from public.development_project_sources where project_id = 'a1385000-0000-4000-8000-000000000001'), 1, 'B3 anon reads published provenance');
select throws_ok(
  $$insert into public.development_projects (source_key, slug, name, publish_state, verified_at)
    values ('san1385-anon', 'san1385-anon', 'Anon', 'draft', now())$$,
  '42501', null, 'B4 anon cannot insert');

-- ── C/D · buyer + partner isolation and no direct write (9) ──────────────────
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
  '{"budget_min": 900000000}'::jsonb, 'buyer-b@example.com', null, 'Buyer B') ->> 'registration_id') is not null,
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
select throws_ok(
  $$update public.developer_lead_registrations set sales_stage = 'reserved'
    where project_id = 'a1385000-0000-4000-8000-000000000003'$$,
  '42501', null, 'C4 partner A cannot directly update partner B registration');
select throws_ok(
  $$update public.developer_lead_registrations set sales_stage = 'reserved'
    where project_id = 'a1385000-0000-4000-8000-000000000001'$$,
  '42501', null, 'C5 authenticated cannot directly update any registration');

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

-- ── F · frozen terms + retry-safe decision (6) ───────────────────────────────
select is((select (dr.agreement_id is null and dr.agreement_snapshot = '{}'::jsonb)::text
  from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
  where l.user_id = 'e1385000-0000-4000-8000-000000000001'), 'true',
  'F0 pending registration carries no frozen terms');

select set_config('request.jwt.claim.sub', 'e1385000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.decide_developer_registration(
      (select id from public.developer_lead_registrations where project_id = 'a1385000-0000-4000-8000-000000000003'), 'accepted')$$,
  'P0001', null, 'F1 partner A cannot accept partner B registration');

select is((public.decide_developer_registration(
  (select dr.id from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'),
  'accepted', null, 'DEV-REF-1') ->> 'status'), 'accepted', 'F2 partner A accepts its registration');

select is((select (dr.agreement_id is not null and dr.agreement_snapshot ->> 'commission_value' = '3.0000')::text
  from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
  where l.user_id = 'e1385000-0000-4000-8000-000000000001'), 'true',
  'F3 acceptance freezes the exact active agreement snapshot');

select is((public.decide_developer_registration(
  (select dr.id from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'),
  'accepted') ->> 'idempotent_replay')::boolean, true, 'F4 repeated accept is an idempotent replay');

select throws_ok(
  $$select public.decide_developer_registration(
      (select dr.id from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
         where l.user_id = 'e1385000-0000-4000-8000-000000000001'), 'rejected')$$,
  'P0001', null, 'F5 reject after accept is an invalid transition');

-- ── booking (3) ──────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', 'e1385000-0000-4000-8000-000000000001', true);
select ok((public.book_new_project_consultation(
  'a1385000-0000-4000-8000-000000000001',
  (select dr.id from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'),
  current_date + 3, '14:00'::time, 'san1385-book-a-0001', '15:00'::time, 'site visit') ->> 'booking_id') is not null,
  'F6 buyer A consultation commits');
select is((public.book_new_project_consultation(
  'a1385000-0000-4000-8000-000000000001',
  (select dr.id from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'),
  current_date + 3, '14:00'::time, 'san1385-book-a-0001', '15:00'::time, 'site visit') ->> 'idempotent_replay')::boolean,
  true, 'F7 consultation replay is idempotent');
select is((select count(*)::int from public.bookings
  where user_id = 'e1385000-0000-4000-8000-000000000001' and booking_type = 'new_project_consultation'), 1,
  'F8 one consultation booking for the logical request');

-- Freeze the commercial terms before they are used: mutate the live agreement.
reset role;
update public.partner_commission_agreements
  set commission_value = 5.0, commission_trigger = 'reserved'
  where id = 'd1385000-0000-4000-8000-000000000001';

-- ── commission: authorization, trigger enforcement, atomicity (7) ────────────
select set_config('request.jwt.claim.sub', 'e1385000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.post_new_project_commission(
      (select dr.id from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
         where l.user_id = 'e1385000-0000-4000-8000-000000000001'), 100000000, 'san1385-claim-0001')$$,
  'P0001', null, 'F9 buyer cannot post a commission');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.post_new_project_commission(
      (select dr.id from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
         where l.user_id = 'e1385000-0000-4000-8000-000000000001'), 100000000, 'san1385-claim-0001')$$,
  'P0001', null, 'F10 commission trigger not reached (no stage) is rejected');

-- Advance to "interested"; the FROZEN trigger is 'deed', so posting still fails.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1385000-0000-4000-8000-000000000003', true);
select public.advance_developer_registration_stage(
  (select dr.id from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'), 'contacted');
select public.advance_developer_registration_stage(
  (select dr.id from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'), 'appointment_completed');
select public.advance_developer_registration_stage(
  (select dr.id from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'), 'interested');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.post_new_project_commission(
      (select dr.id from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
         where l.user_id = 'e1385000-0000-4000-8000-000000000001'), 100000000, 'san1385-claim-0001')$$,
  'P0001', null, 'F11 frozen deed trigger blocks posting at interested');

-- Advance to deed and post.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1385000-0000-4000-8000-000000000003', true);
select public.advance_developer_registration_stage(
  (select dr.id from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'), 'reserved');
select public.advance_developer_registration_stage(
  (select dr.id from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'), 'promesa');
select public.advance_developer_registration_stage(
  (select dr.id from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'), 'financing_closing');
select public.advance_developer_registration_stage(
  (select dr.id from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'), 'deed_closed_won');
reset role;
select set_config('request.jwt.claim.sub', '', true);

select is((public.post_new_project_commission(
  (select dr.id from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'),
  100000000, 'san1385-claim-0001', '{"trigger": "deed"}'::jsonb) ->> 'claim_state'), 'earned',
  'F12 service role posts one commission');
select is((select commission_cents::int from public.commission_claims
  where idempotency_key = 'san1385-claim-0001'), 3000000, 'F13 frozen 3% is used, not the mutated 5%');
select is((public.post_new_project_commission(
  (select dr.id from public.developer_lead_registrations dr join public.leads l on l.id = dr.lead_id
     where l.user_id = 'e1385000-0000-4000-8000-000000000001'),
  100000000, 'san1385-claim-0001', '{"trigger": "deed"}'::jsonb) ->> 'idempotent_replay')::boolean,
  true, 'F14 commission replay is idempotent');
select is((select count(*)::int from public.revenue_ledger rl
  join public.commission_claims cc on cc.id = rl.source_id
  where rl.source_kind = 'commission' and cc.idempotency_key = 'san1385-claim-0001'), 1,
  'F15 exactly one ledger entry for the commission');

-- ── sale-stage audit (3) ─────────────────────────────────────────────────────
select is((select count(*)::int from public.developer_lead_registration_stage_events se
  join public.developer_lead_registrations dr on dr.id = se.registration_id
  join public.leads l on l.id = dr.lead_id
  where l.user_id = 'e1385000-0000-4000-8000-000000000001'), 7, 'F16 seven stage events were recorded');
select is((select se.to_stage from public.developer_lead_registration_stage_events se
  join public.developer_lead_registrations dr on dr.id = se.registration_id
  join public.leads l on l.id = dr.lead_id
  where l.user_id = 'e1385000-0000-4000-8000-000000000001'
  order by se.created_at desc limit 1), 'deed_closed_won', 'F17 latest stage event is deed_closed_won');
select is((select se.actor_id from public.developer_lead_registration_stage_events se
  join public.developer_lead_registrations dr on dr.id = se.registration_id
  join public.leads l on l.id = dr.lead_id
  where l.user_id = 'e1385000-0000-4000-8000-000000000001'
  order by se.created_at desc limit 1), 'e1385000-0000-4000-8000-000000000003',
  'F18 stage events record the acting partner member');

-- ── G · integrity + regression safety (4) ────────────────────────────────────
select throws_ok(
  $$insert into public.bookings (user_id, booking_type, resource_id, resource_title, status, start_date, partner_id)
    values ('e1385000-0000-4000-8000-000000000001', 'new_project_consultation',
            'a1385000-0000-4000-8000-000000000001', 'Mismatched', 'pending', current_date,
            'f1385000-0000-4000-8000-000000000002')$$,
  'P0001', null, 'G1 mismatched consultation project/partner pair is rejected');
select throws_ok(
  $$update public.developer_lead_registrations set project_id = 'a1385000-0000-4000-8000-000000000003'
    where project_id = 'a1385000-0000-4000-8000-000000000001'$$,
  '23514', null, 'G2 accepted attribution project cannot be reassigned');
select throws_ok(
  $$insert into public.leads (source, listing_kind, listing_id)
    values ('test', 'event', 'a1385000-0000-4000-8000-000000000001')$$,
  '23514', null, 'G3 unknown listing kind fails closed');
select throws_ok(
  $$insert into public.development_projects (partner_id, ownership_status, source_key, slug, name, publish_state, verified_at)
    values ('f1385000-0000-4000-8000-000000000001', 'unclaimed', 'san1385-invariant', 'san1385-invariant', 'Invariant', 'draft', now())$$,
  '23514', null, 'G4 unclaimed project cannot carry a partner_id');

select * from finish();
rollback;
