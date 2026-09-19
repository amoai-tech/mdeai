-- SAN-1284 · Batch 0C — remove direct EXECUTE from trigger/internal functions
--
-- THE DEFECT
-- Thirty app-owned functions in `public` return the `trigger` pseudo-type and are bound to
-- real triggers, yet every one of them is directly executable by PostgreSQL `PUBLIC`, `anon`,
-- and `authenticated`. Batch 0A stopped NEW functions from inheriting EXECUTE; Batch 0B took
-- the money path and the dormant rental writes to service_role. This batch is the deferred
-- trigger/internal increment named in 0B's scope note, widened from the 8 `broadcast_*_changes()`
-- plus 3 `realtime_broadcast_*()` to the full trigger-returning set.
--
-- WHY THIS IS SAFE (all four verified on merged main, 2026-09-19)
--
-- 1. THEY ARE NOT REACHABLE VIA THE DATA API. PostgREST cannot expose a function whose return
--    type is `trigger`. Measured against the live local PostgREST OpenAPI document:
--    289 RPC paths exposed, and ZERO of these 30 functions appear. The exposure is real at the
--    catalog/advisory level (Security Advisor lints 0028/0029 count them) but not callable over
--    `/rest/v1/rpc/*`.
--
-- 2. REVOKING EXECUTE DOES NOT STOP THE TRIGGERS FIRING. PostgreSQL checks a trigger function's
--    EXECUTE privilege when the trigger is CREATED, not when it fires. Proven directly: a table
--    with a BEFORE UPDATE trigger using a function whose EXECUTE had just been revoked from
--    `public, anon, authenticated` still updated, and the trigger still fired cleanly:
--
--      revoke execute on function public.__trig_fn() from public, anon, authenticated;
--      set local role authenticated;
--      update public.__trig_probe set v=2 where id=1;
--      -- RESULT: update_succeeded=true trigger_fired=true
--
--    This is the exact scenario the task's stop condition warns about ("a trigger stops firing
--    after ACL changes") — it does not happen.
--
-- 3. NOTHING ELSE CALLS THEM. A scan of every `public` function body for these names finds no
--    internal (non-trigger) caller, and `src/**` plus `supabase/functions/**` contain no
--    reference to any of them.
--
-- 4. NO RLS POLICY DEPENDS ON THEM. No `pg_policies` qual/with_check expression references any
--    of these names, so no row-visibility path is affected.
--
-- NO FUNCTION BODY IS CHANGED. This is a privilege correction only.
--
-- SCOPE
-- Every app-owned (`pg_depend`/`pg_extension`-excluded) function in `public` returning `trigger`
-- that is still executable by an end-user role. That includes trigger-bound helpers
-- (`set_updated_at`, `update_updated_at`, `compute_lead_score`, `handle_new_user`,
-- `enqueue_embedding_job`, the outbox and broadcast helpers, `fn_apply_approval_decision`,
-- `guard_booking_partner_decision`, …) and several `trigger`-returning functions with no
-- currently attached trigger (`broadcast_messages_changes`, `realtime_broadcast_messages`,
-- `trigger_ai_embed`, …). Orphans are included deliberately: they are not callable via the API
-- either, and leaving stray PUBLIC EXECUTE on a `SECURITY DEFINER` `trigger` function is the
-- same latent hazard.
--
-- DELIBERATELY NOT INCLUDED — non-trigger functions. `decide_approval`, `request_approval` and
-- the remaining Approval/HITL RPC surface need real callers and belong to SAN-1285;
-- `ticket_payment_refund_v2` is intentionally authenticated (SB-002). This batch only touches
-- functions that are provably trigger-only.
--
-- REVOKE is idempotent, so re-running this migration is a no-op.

-- ── Timestamp / bookkeeping helpers (INVOKER, high trigger fan-out) ──────────────
revoke execute on function public.update_updated_at() from public, anon, authenticated;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.trigger_set_timestamps() from public, anon, authenticated;
revoke execute on function public.update_collection_count() from public, anon, authenticated;
revoke execute on function public.generate_confirmation_code() from public, anon, authenticated;
revoke execute on function public.events_sync_legacy_is_active() from public, anon, authenticated;

-- ── Embedding / lead-scoring / conversation triggers ────────────────────────────
revoke execute on function public.enqueue_embedding_job() from public, anon, authenticated;
revoke execute on function public.touch_embedding_updated_at() from public, anon, authenticated;
revoke execute on function public.trigger_ai_embed() from public, anon, authenticated;
revoke execute on function public.compute_lead_score() from public, anon, authenticated;
revoke execute on function public.update_conversation_on_message() from public, anon, authenticated;
revoke execute on function public.update_conversation_stats() from public, anon, authenticated;

-- ── Approval / booking guards (trigger-bound) ───────────────────────────────────
revoke execute on function public.fn_apply_approval_decision() from public, anon, authenticated;
revoke execute on function public.guard_booking_partner_decision() from public, anon, authenticated;
revoke execute on function public.fn_outbox_set_updated_at() from public, anon, authenticated;
revoke execute on function public.fn_outbox_suppression_check() from public, anon, authenticated;

-- ── Auth / realtime broadcast triggers ──────────────────────────────────────────
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.broadcast_event_attendees_changes() from public, anon, authenticated;
revoke execute on function public.broadcast_event_dashboard_changes() from public, anon, authenticated;
revoke execute on function public.broadcast_messages_changes() from public, anon, authenticated;
revoke execute on function public.broadcast_proactive_suggestions_changes() from public, anon, authenticated;
revoke execute on function public.broadcast_suggestions_changes() from public, anon, authenticated;
revoke execute on function public.broadcast_trip_items_changes() from public, anon, authenticated;
revoke execute on function public.broadcast_trips_changes() from public, anon, authenticated;
revoke execute on function public.broadcast_vote_tally_changes() from public, anon, authenticated;
revoke execute on function public.realtime_broadcast_messages() from public, anon, authenticated;
revoke execute on function public.realtime_broadcast_trip_items() from public, anon, authenticated;
revoke execute on function public.realtime_broadcast_trips() from public, anon, authenticated;
