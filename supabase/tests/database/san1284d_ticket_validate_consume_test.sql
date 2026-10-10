-- SAN-1284 · Batch 0D regression suite — ticket_validate_consume is service_role only
--
-- The defect: any visitor holding a valid QR token could call this SECURITY DEFINER RPC directly
-- and mark the ticket used, bypassing every staff / event / signature check that the
-- `ticket-validate` Edge Function performs first.
--
-- THE CONTRACT THIS SUITE LOCKS IN
--   service_role only : ticket_validate_consume(text)
--   PUBLIC, anon, authenticated : denied
--
-- NULL-SAFETY: the first assertion proves the function OID resolves, so a renamed or missing
-- function fails loudly rather than making the privilege assertions vacuously pass.
--
-- The runtime section calls the function AS the real role and asserts the actual refusal
-- (SQLSTATE 42501), so the suite fails if a role can still reach the body even when the ACL reads
-- correctly for some other reason. The allow-side call proves service_role still reaches the body
-- (the Edge Function's path) using a token that matches no ticket, so it writes nothing.
--
-- Run with: supabase test db
begin;

select plan(8);

select ok(to_regprocedure('public.ticket_validate_consume(text)') is not null, 'R: ticket_validate_consume resolves');
select is(has_function_privilege('anon', to_regprocedure('public.ticket_validate_consume(text)'), 'EXECUTE'), false, 'R: ticket_validate_consume NOT anon');
select is(has_function_privilege('authenticated', to_regprocedure('public.ticket_validate_consume(text)'), 'EXECUTE'), false, 'R: ticket_validate_consume NOT authenticated');
select is(has_function_privilege('service_role', to_regprocedure('public.ticket_validate_consume(text)'), 'EXECUTE'), true, 'R: ticket_validate_consume keeps service_role');
select is((select exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
             from pg_proc p where p.oid = to_regprocedure('public.ticket_validate_consume(text)')), false, 'R: ticket_validate_consume no PUBLIC');

-- RUNTIME AUTHORIZATION BOUNDARY — the denial happens before the body is entered, so the probe
-- token does not matter for the deny assertions.
set local role anon;
select throws_ok($$select public.ticket_validate_consume('san1284d-probe-no-such-token')$$, '42501', null, 'X: anon DENIED ticket_validate_consume');
reset role;

set local role authenticated;
select throws_ok($$select public.ticket_validate_consume('san1284d-probe-no-such-token')$$, '42501', null, 'X: authenticated DENIED ticket_validate_consume');
reset role;

-- The Edge Function's path still works: service_role reaches the body, which finds no such ticket.
set local role service_role;
select is(public.ticket_validate_consume('san1284d-probe-no-such-token') ->> 'result', 'unknown_token', 'X: service_role still reaches ticket_validate_consume');
reset role;

select * from finish();
rollback;
