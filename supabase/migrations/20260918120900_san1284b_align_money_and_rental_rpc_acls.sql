-- SAN-1284 · Batch 0B — align money-path and rental RPC ACLs to production
--
-- THE DEFECT
-- A fresh replay granted `anon` EXECUTE on all eight of these functions where production
-- denies it. Measured with has_function_privilege against both environments:
--
--   replay: pub=false anon_x=true  anon_eff=true   auth_eff=true  svc_eff=true
--   prod  : pub=false anon_x=false anon_eff=false  auth_eff=true  svc_eff=true
--
-- acting_landlord_ids() was worse: replay granted BOTH PUBLIC and anon.
--
-- WHY THIS IS ACL-ONLY
-- In every one of the eight cases the `authenticated` and `service_role` grants were
-- ALREADY identical to production. So this batch only ever REMOVES access; it never has to
-- add a grant, and it cannot accidentally widen anything.
--
-- NO FUNCTION BODY IS CHANGED. This is a privilege correction, not an authorization-logic
-- change. For the p1_* rental RPCs specifically, SAN-1286 still owns proving
-- `p_user_id = auth.uid()`; removing anon access here narrows the caller set but does not
-- substitute for that check.
--
-- SCOPE
-- Exactly the eight priority functions from the Batch 0B brief. Deliberately NOT included:
--
--   * The 11 other functions where replay is also more permissive — the 8
--     broadcast_*_changes() and 3 realtime_broadcast_*() trigger functions. They show the
--     identical defect (PUBLIC + anon) and are the next increment of this batch; mixing
--     trigger functions into a money-path migration would make neither reviewable.
--   * SAN-1305's hybrid_search_listings/events/restaurants. They are production-only today
--     and must NOT be recreated here.
--   * The 6 production-only functions (fn_record_conversion, fn_record_tool_call_start/end,
--     fn_audit_agent_run, fn_audit_agent_approval,
--     auto_create_landlord_inbox_from_message). Classified separately, not recreated here.
--
-- REVOKING FROM `public` IS SAFE FOR `authenticated`: that role holds its own explicit
-- grant, which production confirms (`pub=false` alongside `auth_eff=true`).
--
-- REVOKE is idempotent, so re-running this migration is a no-op rather than an error.

-- Money path — ticket payment and checkout
revoke execute on function public.ticket_payment_refund(uuid) from public, anon;
revoke execute on function public.ticket_payment_finalize(uuid, text) from public, anon;
revoke execute on function public.ticket_payment_finalize_response(events, event_orders, event_tickets) from public, anon;
revoke execute on function public.ticket_checkout_cancel(uuid) from public, anon;

-- Rental atomic writes — ACL only; SAN-1286 owns the identity-binding proof
revoke execute on function public.p1_schedule_tour_atomic(
  uuid, text, uuid, text, text, text, text, jsonb, uuid, timestamp with time zone, text, jsonb
) from public, anon;
revoke execute on function public.p1_start_rental_application_atomic(
  uuid, text, uuid, text, text, jsonb, uuid, jsonb
) from public, anon;

-- RLS helper — production keeps `authenticated`, so policies that call it still work for
-- logged-in users while anon can no longer invoke it directly.
revoke execute on function public.acting_landlord_ids() from public, anon;

-- Staff authorization
revoke execute on function public.bump_staff_link_version(uuid) from public, anon;
