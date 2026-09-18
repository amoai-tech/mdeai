-- SAN-1284 · Batch 0B regression suite — money-path + rental RPC ACLs aligned to production
--
-- The measured defect: a fresh replay granted anon EXECUTE on all eight of these where
-- production denies it. `authenticated` and `service_role` were already identical, so this
-- batch only ever REMOVES anon/PUBLIC access — it never needs to add a grant.
--
-- NULL-SAFETY: each block proves the function OID resolves first, so a renamed or missing
-- function fails loudly rather than making the privilege assertions vacuously pass.
--
-- Run with: supabase test db
begin;

select plan(42);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Money path — ticket payment / checkout
-- Required contract (matches production): PUBLIC denied, anon denied,
-- authenticated allowed, service_role allowed.
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(to_regprocedure('public.ticket_payment_refund(uuid)') is not null, 'R: ticket_payment_refund resolves');
select is(has_function_privilege('anon', to_regprocedure('public.ticket_payment_refund(uuid)'), 'EXECUTE'), false, 'R: ticket_payment_refund NOT anon');
select is(has_function_privilege('authenticated', to_regprocedure('public.ticket_payment_refund(uuid)'), 'EXECUTE'), true, 'R: ticket_payment_refund keeps authenticated');
select is(has_function_privilege('service_role', to_regprocedure('public.ticket_payment_refund(uuid)'), 'EXECUTE'), true, 'R: ticket_payment_refund keeps service_role');
select is((select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
             from pg_proc p where p.oid = to_regprocedure('public.ticket_payment_refund(uuid)')), false, 'R: ticket_payment_refund no PUBLIC');

select ok(to_regprocedure('public.ticket_payment_finalize(uuid,text)') is not null, 'R: ticket_payment_finalize resolves');
select is(has_function_privilege('anon', to_regprocedure('public.ticket_payment_finalize(uuid,text)'), 'EXECUTE'), false, 'R: ticket_payment_finalize NOT anon');
select is(has_function_privilege('authenticated', to_regprocedure('public.ticket_payment_finalize(uuid,text)'), 'EXECUTE'), true, 'R: ticket_payment_finalize keeps authenticated');
select is(has_function_privilege('service_role', to_regprocedure('public.ticket_payment_finalize(uuid,text)'), 'EXECUTE'), true, 'R: ticket_payment_finalize keeps service_role');
select is((select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
             from pg_proc p where p.oid = to_regprocedure('public.ticket_payment_finalize(uuid,text)')), false, 'R: ticket_payment_finalize no PUBLIC');

select ok(to_regprocedure('public.ticket_payment_finalize_response(events,event_orders,event_tickets)') is not null, 'R: ticket_payment_finalize_response resolves');
select is(has_function_privilege('anon', to_regprocedure('public.ticket_payment_finalize_response(events,event_orders,event_tickets)'), 'EXECUTE'), false, 'R: ticket_payment_finalize_response NOT anon');
select is(has_function_privilege('authenticated', to_regprocedure('public.ticket_payment_finalize_response(events,event_orders,event_tickets)'), 'EXECUTE'), true, 'R: ticket_payment_finalize_response keeps authenticated');
select is(has_function_privilege('service_role', to_regprocedure('public.ticket_payment_finalize_response(events,event_orders,event_tickets)'), 'EXECUTE'), true, 'R: ticket_payment_finalize_response keeps service_role');
select is((select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
             from pg_proc p where p.oid = to_regprocedure('public.ticket_payment_finalize_response(events,event_orders,event_tickets)')), false, 'R: ticket_payment_finalize_response no PUBLIC');

select ok(to_regprocedure('public.ticket_checkout_cancel(uuid)') is not null, 'R: ticket_checkout_cancel resolves');
select is(has_function_privilege('anon', to_regprocedure('public.ticket_checkout_cancel(uuid)'), 'EXECUTE'), false, 'R: ticket_checkout_cancel NOT anon');
select is(has_function_privilege('authenticated', to_regprocedure('public.ticket_checkout_cancel(uuid)'), 'EXECUTE'), true, 'R: ticket_checkout_cancel keeps authenticated');
select is(has_function_privilege('service_role', to_regprocedure('public.ticket_checkout_cancel(uuid)'), 'EXECUTE'), true, 'R: ticket_checkout_cancel keeps service_role');
select is((select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
             from pg_proc p where p.oid = to_regprocedure('public.ticket_checkout_cancel(uuid)')), false, 'R: ticket_checkout_cancel no PUBLIC');

-- ═══════════════════════════════════════════════════════════════════════════════
-- Rental atomic writes
-- ACL only. SAN-1286 still owns proving p_user_id = auth.uid(); this batch deliberately
-- does not touch the bodies.
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(to_regprocedure('public.p1_schedule_tour_atomic(uuid,text,uuid,text,text,text,text,jsonb,uuid,timestamp with time zone,text,jsonb)') is not null, 'R: p1_schedule_tour_atomic resolves');
select is(has_function_privilege('anon', to_regprocedure('public.p1_schedule_tour_atomic(uuid,text,uuid,text,text,text,text,jsonb,uuid,timestamp with time zone,text,jsonb)'), 'EXECUTE'), false, 'R: p1_schedule_tour_atomic NOT anon');
select is(has_function_privilege('authenticated', to_regprocedure('public.p1_schedule_tour_atomic(uuid,text,uuid,text,text,text,text,jsonb,uuid,timestamp with time zone,text,jsonb)'), 'EXECUTE'), true, 'R: p1_schedule_tour_atomic keeps authenticated');
select is(has_function_privilege('service_role', to_regprocedure('public.p1_schedule_tour_atomic(uuid,text,uuid,text,text,text,text,jsonb,uuid,timestamp with time zone,text,jsonb)'), 'EXECUTE'), true, 'R: p1_schedule_tour_atomic keeps service_role');
select is((select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
             from pg_proc p where p.oid = to_regprocedure('public.p1_schedule_tour_atomic(uuid,text,uuid,text,text,text,text,jsonb,uuid,timestamp with time zone,text,jsonb)')), false, 'R: p1_schedule_tour_atomic no PUBLIC');

select ok(to_regprocedure('public.p1_start_rental_application_atomic(uuid,text,uuid,text,text,jsonb,uuid,jsonb)') is not null, 'R: p1_start_rental_application_atomic resolves');
select is(has_function_privilege('anon', to_regprocedure('public.p1_start_rental_application_atomic(uuid,text,uuid,text,text,jsonb,uuid,jsonb)'), 'EXECUTE'), false, 'R: p1_start_rental_application_atomic NOT anon');
select is(has_function_privilege('authenticated', to_regprocedure('public.p1_start_rental_application_atomic(uuid,text,uuid,text,text,jsonb,uuid,jsonb)'), 'EXECUTE'), true, 'R: p1_start_rental_application_atomic keeps authenticated');
select is(has_function_privilege('service_role', to_regprocedure('public.p1_start_rental_application_atomic(uuid,text,uuid,text,text,jsonb,uuid,jsonb)'), 'EXECUTE'), true, 'R: p1_start_rental_application_atomic keeps service_role');
select is((select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
             from pg_proc p where p.oid = to_regprocedure('public.p1_start_rental_application_atomic(uuid,text,uuid,text,text,jsonb,uuid,jsonb)')), false, 'R: p1_start_rental_application_atomic no PUBLIC');

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS helper + staff authorization
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
