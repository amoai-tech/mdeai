-- SAN-1284 · Batch 0B regression suite — money-path + rental RPC risk surface
--
-- The measured defect: a fresh replay granted anon EXECUTE on all eight of these where
-- production denies it. `acting_landlord_ids` was worse and granted PUBLIC as well.
--
-- THE CONTRACT THIS SUITE LOCKS IN
--   service_role only      : ticket_payment_refund, ticket_payment_finalize,
--                            ticket_payment_finalize_response, ticket_checkout_cancel,
--                            p1_schedule_tour_atomic, p1_start_rental_application_atomic
--   authenticated retained : acting_landlord_ids (RLS helper — SAN-1287 owns repointing),
--                            bump_staff_link_version (explicit grant + internal ownership check)
--
-- `authenticated` is asserted FALSE explicitly for the six service-only functions. That is the
-- point of this revision: the old ACL came from the historical default ACL stamped at CREATE
-- FUNCTION time, and `REVOKE ... FROM PUBLIC` could not remove it. Asserting the absence of the
-- role grant is what makes the least-privilege contract real rather than inherited.
--
-- NULL-SAFETY: each block proves the function OID resolves first, so a renamed or missing
-- function fails loudly rather than making the privilege assertions vacuously pass.
--
-- The final section goes past catalog inspection: it calls each function AS the real role
-- inside this transaction and asserts the actual refusal (SQLSTATE 42501). The suite therefore
-- fails if a role can still reach a body it should not, even if the ACL of a function reads
-- correctly for some other reason.
--
-- Run with: supabase test db
begin;

select plan(58);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Money path — ticket payment / checkout
-- Required contract: PUBLIC denied, anon denied, authenticated denied, service_role allowed.
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(to_regprocedure('public.ticket_payment_refund(uuid)') is not null, 'R: ticket_payment_refund resolves');
select is(has_function_privilege('anon', to_regprocedure('public.ticket_payment_refund(uuid)'), 'EXECUTE'), false, 'R: ticket_payment_refund NOT anon');
select is(has_function_privilege('authenticated', to_regprocedure('public.ticket_payment_refund(uuid)'), 'EXECUTE'), false, 'R: ticket_payment_refund NOT authenticated');
select is(has_function_privilege('service_role', to_regprocedure('public.ticket_payment_refund(uuid)'), 'EXECUTE'), true, 'R: ticket_payment_refund keeps service_role');
select is((select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
             from pg_proc p where p.oid = to_regprocedure('public.ticket_payment_refund(uuid)')), false, 'R: ticket_payment_refund no PUBLIC');

select ok(to_regprocedure('public.ticket_payment_finalize(uuid,text)') is not null, 'R: ticket_payment_finalize resolves');
select is(has_function_privilege('anon', to_regprocedure('public.ticket_payment_finalize(uuid,text)'), 'EXECUTE'), false, 'R: ticket_payment_finalize NOT anon');
select is(has_function_privilege('authenticated', to_regprocedure('public.ticket_payment_finalize(uuid,text)'), 'EXECUTE'), false, 'R: ticket_payment_finalize NOT authenticated');
select is(has_function_privilege('service_role', to_regprocedure('public.ticket_payment_finalize(uuid,text)'), 'EXECUTE'), true, 'R: ticket_payment_finalize keeps service_role');
select is((select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
             from pg_proc p where p.oid = to_regprocedure('public.ticket_payment_finalize(uuid,text)')), false, 'R: ticket_payment_finalize no PUBLIC');

select ok(to_regprocedure('public.ticket_payment_finalize_response(events,event_orders,event_tickets)') is not null, 'R: ticket_payment_finalize_response resolves');
select is(has_function_privilege('anon', to_regprocedure('public.ticket_payment_finalize_response(events,event_orders,event_tickets)'), 'EXECUTE'), false, 'R: ticket_payment_finalize_response NOT anon');
select is(has_function_privilege('authenticated', to_regprocedure('public.ticket_payment_finalize_response(events,event_orders,event_tickets)'), 'EXECUTE'), false, 'R: ticket_payment_finalize_response NOT authenticated');
select is(has_function_privilege('service_role', to_regprocedure('public.ticket_payment_finalize_response(events,event_orders,event_tickets)'), 'EXECUTE'), true, 'R: ticket_payment_finalize_response keeps service_role');
select is((select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
             from pg_proc p where p.oid = to_regprocedure('public.ticket_payment_finalize_response(events,event_orders,event_tickets)')), false, 'R: ticket_payment_finalize_response no PUBLIC');

select ok(to_regprocedure('public.ticket_checkout_cancel(uuid)') is not null, 'R: ticket_checkout_cancel resolves');
select is(has_function_privilege('anon', to_regprocedure('public.ticket_checkout_cancel(uuid)'), 'EXECUTE'), false, 'R: ticket_checkout_cancel NOT anon');
select is(has_function_privilege('authenticated', to_regprocedure('public.ticket_checkout_cancel(uuid)'), 'EXECUTE'), false, 'R: ticket_checkout_cancel NOT authenticated');
select is(has_function_privilege('service_role', to_regprocedure('public.ticket_checkout_cancel(uuid)'), 'EXECUTE'), true, 'R: ticket_checkout_cancel keeps service_role');
select is((select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
             from pg_proc p where p.oid = to_regprocedure('public.ticket_checkout_cancel(uuid)')), false, 'R: ticket_checkout_cancel no PUBLIC');

-- ═══════════════════════════════════════════════════════════════════════════════
-- Rental atomic writes — service_role only.
-- SAN-1286 keeps the RPC behind the trusted Edge/service boundary. `p_user_id` is derived
-- by chat-lead-capture from the validated request JWT; end-user roles cannot call this RPC.
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(to_regprocedure('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)') is not null, 'R: p1_schedule_tour_atomic resolves');
select is(has_function_privilege('anon', to_regprocedure('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)'), 'EXECUTE'), false, 'R: p1_schedule_tour_atomic NOT anon');
select is(has_function_privilege('authenticated', to_regprocedure('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)'), 'EXECUTE'), false, 'R: p1_schedule_tour_atomic NOT authenticated');
select is(has_function_privilege('service_role', to_regprocedure('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)'), 'EXECUTE'), true, 'R: p1_schedule_tour_atomic keeps service_role');
select is((select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
             from pg_proc p where p.oid = to_regprocedure('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)')), false, 'R: p1_schedule_tour_atomic no PUBLIC');

select ok(to_regprocedure('public.p1_start_rental_application_atomic(uuid,text,uuid,text,text,jsonb,uuid,jsonb)') is not null, 'R: p1_start_rental_application_atomic resolves');
select is(has_function_privilege('anon', to_regprocedure('public.p1_start_rental_application_atomic(uuid,text,uuid,text,text,jsonb,uuid,jsonb)'), 'EXECUTE'), false, 'R: p1_start_rental_application_atomic NOT anon');
select is(has_function_privilege('authenticated', to_regprocedure('public.p1_start_rental_application_atomic(uuid,text,uuid,text,text,jsonb,uuid,jsonb)'), 'EXECUTE'), false, 'R: p1_start_rental_application_atomic NOT authenticated');
select is(has_function_privilege('service_role', to_regprocedure('public.p1_start_rental_application_atomic(uuid,text,uuid,text,text,jsonb,uuid,jsonb)'), 'EXECUTE'), true, 'R: p1_start_rental_application_atomic keeps service_role');
select is((select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
             from pg_proc p where p.oid = to_regprocedure('public.p1_start_rental_application_atomic(uuid,text,uuid,text,text,jsonb,uuid,jsonb)')), false, 'R: p1_start_rental_application_atomic no PUBLIC');

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS helper + staff authorization — authenticated access is INTENTIONAL here
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(to_regprocedure('public.acting_landlord_ids()') is not null, 'R: acting_landlord_ids resolves');
select is(has_function_privilege('anon', to_regprocedure('public.acting_landlord_ids()'), 'EXECUTE'), false, 'R: acting_landlord_ids NOT anon');
select is(has_function_privilege('authenticated', to_regprocedure('public.acting_landlord_ids()'), 'EXECUTE'), true, 'R: acting_landlord_ids keeps authenticated (RLS still works)');
select is(has_function_privilege('service_role', to_regprocedure('public.acting_landlord_ids()'), 'EXECUTE'), true, 'R: acting_landlord_ids keeps service_role');
select is((select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
             from pg_proc p where p.oid = to_regprocedure('public.acting_landlord_ids()')), false, 'R: acting_landlord_ids no PUBLIC');

select ok(to_regprocedure('public.bump_staff_link_version(uuid)') is not null, 'R: bump_staff_link_version resolves');
select is(has_function_privilege('anon', to_regprocedure('public.bump_staff_link_version(uuid)'), 'EXECUTE'), false, 'R: bump_staff_link_version NOT anon');
select is(has_function_privilege('authenticated', to_regprocedure('public.bump_staff_link_version(uuid)'), 'EXECUTE'), true, 'R: bump_staff_link_version keeps authenticated');
select is(has_function_privilege('service_role', to_regprocedure('public.bump_staff_link_version(uuid)'), 'EXECUTE'), true, 'R: bump_staff_link_version keeps service_role');
select is((select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
             from pg_proc p where p.oid = to_regprocedure('public.bump_staff_link_version(uuid)')), false, 'R: bump_staff_link_version no PUBLIC');

-- ═══════════════════════════════════════════════════════════════════════════════
-- RUNTIME AUTHORIZATION BOUNDARY
-- Each call below runs as the real role, so it fails with insufficient_privilege (42501)
-- BEFORE the function body is entered. Probe arguments are intentional: the deny assertions
-- must not depend on the argument data. For the allow-side calls (the two keep-open
-- functions) the assertion matches the body's OWN error, which proves the permission gate
-- opened and the function's internal guard ran.
-- ═══════════════════════════════════════════════════════════════════════════════

-- anon must not reach ANY of the eight bodies.
set local role anon;
select throws_ok($$select public.ticket_payment_refund('00000000-0000-0000-0000-000000000000'::uuid)$$, '42501', null, 'X: anon DENIED ticket_payment_refund');
select throws_ok($$select public.ticket_payment_finalize('00000000-0000-0000-0000-000000000000'::uuid,'pi_probe')$$, '42501', null, 'X: anon DENIED ticket_payment_finalize');
select throws_ok($$select public.ticket_payment_finalize_response(null::public.events,null::public.event_orders,null::public.event_tickets)$$, '42501', null, 'X: anon DENIED ticket_payment_finalize_response');
select throws_ok($$select public.ticket_checkout_cancel('00000000-0000-0000-0000-000000000000'::uuid)$$, '42501', null, 'X: anon DENIED ticket_checkout_cancel');
select throws_ok($$select public.p1_schedule_tour_atomic('probe-listing',null::uuid,'probe-key-123',null::text,null::text,null::text,null::text,null::uuid,null::timestamptz,null::jsonb,null::jsonb)$$, '42501', null, 'X: anon DENIED p1_schedule_tour_atomic');
select throws_ok($$select public.p1_start_rental_application_atomic('00000000-0000-0000-0000-000000000000'::uuid,'probe-key-123',null::uuid,null::text,null::text,null::jsonb,null::uuid,null::jsonb)$$, '42501', null, 'X: anon DENIED p1_start_rental_application_atomic');
select throws_ok($$select public.acting_landlord_ids()$$, '42501', null, 'X: anon DENIED acting_landlord_ids');
select throws_ok($$select public.bump_staff_link_version('00000000-0000-0000-0000-000000000000'::uuid)$$, '42501', null, 'X: anon DENIED bump_staff_link_version');
reset role;

-- authenticated must not reach the six service-only bodies.
set local role authenticated;
select throws_ok($$select public.ticket_payment_refund('00000000-0000-0000-0000-000000000000'::uuid)$$, '42501', null, 'X: authenticated DENIED ticket_payment_refund');
select throws_ok($$select public.ticket_payment_finalize('00000000-0000-0000-0000-000000000000'::uuid,'pi_probe')$$, '42501', null, 'X: authenticated DENIED ticket_payment_finalize');
select throws_ok($$select public.ticket_payment_finalize_response(null::public.events,null::public.event_orders,null::public.event_tickets)$$, '42501', null, 'X: authenticated DENIED ticket_payment_finalize_response');
select throws_ok($$select public.ticket_checkout_cancel('00000000-0000-0000-0000-000000000000'::uuid)$$, '42501', null, 'X: authenticated DENIED ticket_checkout_cancel');
select throws_ok($$select public.p1_schedule_tour_atomic('probe-listing',null::uuid,'probe-key-123',null::text,null::text,null::text,null::text,null::uuid,null::timestamptz,null::jsonb,null::jsonb)$$, '42501', null, 'X: authenticated DENIED p1_schedule_tour_atomic');
select throws_ok($$select public.p1_start_rental_application_atomic('00000000-0000-0000-0000-000000000000'::uuid,'probe-key-123',null::uuid,null::text,null::text,null::jsonb,null::uuid,null::jsonb)$$, '42501', null, 'X: authenticated DENIED p1_start_rental_application_atomic');

-- ...but it MUST still reach the two intentional contracts.
select lives_ok($$select public.acting_landlord_ids()$$, 'X: authenticated ALLOWED acting_landlord_ids (RLS helper)');
select throws_ok($$select public.bump_staff_link_version('00000000-0000-0000-0000-000000000000'::uuid)$$, 'P0001', 'NOT_ORGANIZER', 'X: authenticated ALLOWED bump_staff_link_version, internal ownership guard rejects non-organizer');
reset role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Scope guards — this batch must not create or touch anything else
-- ═══════════════════════════════════════════════════════════════════════════════

-- SAN-1305 owns these; they are production-only today and must NOT be recreated here.
select is((select count(*)::int from pg_proc
            where pronamespace = 'public'::regnamespace
              and proname in ('hybrid_search_listings','hybrid_search_events','hybrid_search_restaurants')),
          0, 'S: hybrid_search_* NOT created (SAN-1305 owns them)');

-- The 6 production-only functions are classified separately and must NOT be recreated here.
select is((select count(*)::int from pg_proc
            where pronamespace = 'public'::regnamespace
              and proname in ('fn_record_conversion','fn_record_tool_call_start','fn_record_tool_call_end',
                              'fn_audit_agent_run','fn_audit_agent_approval',
                              'auto_create_landlord_inbox_from_message')),
          0, 'S: the 6 production-only functions NOT recreated (classify separately)');

select * from finish();
rollback;
