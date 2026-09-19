-- SAN-1284 · Batch 0B — lock the money path and rental writes to service_role
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
-- ─────────────────────────────────────────────────────────────────────────────────
-- WHY `REVOKE ... FROM public` ALONE DID NOT DO WHAT IT LOOKED LIKE IT DID
-- ─────────────────────────────────────────────────────────────────────────────────
-- It is tempting to read `20260406120003_p1_atomic_grants.sql` — and the ticket RPC block in
-- `20260503011925_event_phase1.sql` — as "revokes PUBLIC, grants service_role, therefore only
-- service_role can execute". That reading is wrong, and it is the reason this migration has to
-- name `authenticated` explicitly instead of assuming it was already excluded.
--
-- Those migrations ran while the old Supabase default ACL for functions created by `postgres`
-- in `public` was still in force (it was only removed in Batch 0A,
-- `20260918104434_san1284a_function_execute_default_privileges.sql`):
--
--     {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- So every CREATE FUNCTION stamped an EXPLICIT `anon` and `authenticated` grant into that
-- function's own ACL. `REVOKE ... FROM PUBLIC` removes only the PUBLIC pseudo-grant
-- (grantee 0); it does not touch a role-specific grant. `CREATE OR REPLACE FUNCTION` preserves
-- an existing ACL as well, so the later p1_* body fixes never reset it either.
--
-- Reproduced directly in a scratch database — CREATE FUNCTION under that default ACL, then the
-- exact `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO service_role` pair that
-- p1_atomic_grants ran:
--
--     authenticated=true anon=true service_role=true
--     proacl={postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- That explicit `authenticated` grant is still present on all eight functions today, which is
-- why the replay measurement showed auth_eff=true and why a PUBLIC-only revoke left them
-- executable by any logged-in user.
--
-- ─────────────────────────────────────────────────────────────────────────────────
-- INTENDED CONTRACT (this revision) — least privilege, made explicit
-- ─────────────────────────────────────────────────────────────────────────────────
-- No end-user role needs any of the six money/rental functions. Audited callers:
--
--   ticket_payment_finalize / _finalize_response / _refund -> supabase/functions/ticket-payment-webhook
--   ticket_checkout_cancel                                -> supabase/functions/ticket-checkout
--   p1_schedule_tour_atomic                               -> no caller
--   p1_start_rental_application_atomic                    -> no caller
--
-- Both Edge Functions call getServiceClient(), and there is no browser/client `.rpc()` caller
-- for any of the six. The service_role-only intent recorded in the two original migrations was
-- therefore correct all along; the surviving `authenticated` grant was inherited, never chosen.
--
-- So this batch asserts the contract explicitly rather than depending on inherited state:
--
--   PUBLIC        denied
--   anon          denied
--   authenticated denied
--   service_role  allowed   (restated, so the contract is readable in this file)
--
-- The two functions where `authenticated` IS the intentional contract are deliberately NOT
-- narrowed here:
--
--   * acting_landlord_ids() — RLS helper called by authenticated policies. Revoking it would
--     break row visibility for logged-in users. SAN-1287 owns repointing those policies.
--   * bump_staff_link_version(uuid) — explicitly granted to authenticated in
--     20260503011925_event_phase1.sql and guarded internally by an organizer ownership check,
--     so its authenticated access is a deliberate product decision, not inheritance.
--
-- Both keep-authenticated functions get their `authenticated` grant RESTATED below, so neither
-- contract depends on what the old default ACL happened to stamp at CREATE FUNCTION time.
--
-- NO FUNCTION BODY IS CHANGED. This is a privilege correction, not an authorization-logic
-- change. For the p1_* rental RPCs specifically, SAN-1286 still owns proving
-- `p_user_id = auth.uid()`; narrowing the caller set here does not substitute for that check.
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
--   * ticket_payment_refund_v2 — a separate function that production genuinely grants to
--     authenticated; SB-002 asserts that, so it is out of scope for this batch.
--
-- REVOKE and GRANT are both idempotent, so re-running this migration is a no-op.

-- Money path — ticket payment and checkout. service_role only.
revoke execute on function public.ticket_payment_refund(uuid) from public, anon, authenticated;
revoke execute on function public.ticket_payment_finalize(uuid, text) from public, anon, authenticated;
revoke execute on function public.ticket_payment_finalize_response(events, event_orders, event_tickets) from public, anon, authenticated;
revoke execute on function public.ticket_checkout_cancel(uuid) from public, anon, authenticated;

grant execute on function public.ticket_payment_refund(uuid) to service_role;
grant execute on function public.ticket_payment_finalize(uuid, text) to service_role;
grant execute on function public.ticket_payment_finalize_response(events, event_orders, event_tickets) to service_role;
grant execute on function public.ticket_checkout_cancel(uuid) to service_role;

-- Rental atomic writes — service_role only until SAN-1286 lands the identity-binding proof and
-- an authenticated contract is tested. ACL only; no body change.
revoke execute on function public.p1_schedule_tour_atomic(
  uuid, text, uuid, text, text, text, text, jsonb, uuid, timestamp with time zone, text, jsonb
) from public, anon, authenticated;
revoke execute on function public.p1_start_rental_application_atomic(
  uuid, text, uuid, text, text, jsonb, uuid, jsonb
) from public, anon, authenticated;

grant execute on function public.p1_schedule_tour_atomic(
  uuid, text, uuid, text, text, text, text, jsonb, uuid, timestamp with time zone, text, jsonb
) to service_role;
grant execute on function public.p1_start_rental_application_atomic(
  uuid, text, uuid, text, text, jsonb, uuid, jsonb
) to service_role;

-- RLS helper — `authenticated` is the intended contract, so only PUBLIC + anon are removed.
-- Policies that call it keep working for logged-in users.
--
-- The `authenticated` grant is restated explicitly rather than left inherited. Batch 0A made
-- function EXECUTE opt-in, so a future DROP/CREATE (as opposed to CREATE OR REPLACE) would come
-- back with NO end-user grant, and the 13 authenticated policies that call this helper would
-- fail at query time. Restating it makes the RLS contract survivable.
revoke execute on function public.acting_landlord_ids() from public, anon;
grant execute on function public.acting_landlord_ids() to authenticated;

-- Staff authorization — `authenticated` is the deliberate contract here (explicit grant in
-- event_phase1 plus an internal organizer ownership check), so only PUBLIC + anon are removed.
-- Restated explicitly for the same DROP/CREATE-durability reason as above.
revoke execute on function public.bump_staff_link_version(uuid) from public, anon;
grant execute on function public.bump_staff_link_version(uuid) to authenticated;
