-- SECURITY: Revoke anon/authenticated EXECUTE on SECURITY DEFINER functions
-- that are exclusively called by service_role (edge functions / Mastra backend).
--
-- These functions have EXECUTE granted to PUBLIC by default but should only be
-- callable via service_role. Surfaced by Supabase security advisor 2026-06-06.
--
-- Risk if left open:
--   outbox_enqueue      → email injection (queue arbitrary messages from mdeai domain)
--   outbox_claim        → PII leak (pending message payloads include phone/email)
--   outbox_mark_failed  → DoS (prevent delivery of transactional email/SMS)
--   outbox_mark_sent    → message suppression without delivery
--   fn_record_tool_call_start/end → inject/corrupt Mastra agent telemetry
--   request_approval    → create fake HITL approval requests
--   fn_notify_next_in_line → trigger spurious waitlist notifications
--   fn_insert_conversation / fn_upsert_delivery_log / fn_update_conversation_intent
--                       → inject/corrupt OpenClaw marketing records
--
-- Verified no callers in mdeapp/src/ or supabase/functions/ via PostgREST.
-- All production callers use service_role SQL directly.
--
-- Trigger-return functions (handle_new_user, fn_audit_*, fn_outbox_suppression_check,
-- compute_lead_score, etc.) are excluded — PostgREST cannot invoke trigger functions
-- and revoking EXECUTE would break the trigger machinery.
--
-- Functions intentionally kept accessible to anon:
--   get_anonymous_order (guest ticket QR view — requires order_id + access_token)
--   ticket_checkout_create_pending, ticket_validate_consume, compute_ticket_total
--   fn_join_wait_list, get_my_role (returns null for anon), is_admin/is_moderator
--   (return false for anon), has_role, apartment_save_counts, check_rate_limit,
--   is_suppressed, log_outbound_click, redeem_promo_code, get_landlord_public_profile,
--   decide_approval (internal is_admin() guard), insert_trip_item_for_user
--   (internal auth.uid() null check), st_estimatedextent (PostGIS system).
--   record_check_in: authenticated kept (staff check-in scanner may use auth session).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SB-001 (2026-09-17) — REPLAY FIX
-- The target functions exist in production but have NO `CREATE` statement anywhere
-- in the repository, so `supabase db reset` from zero failed here with
--   ERROR: function public.outbox_enqueue(text, text, text, jsonb, uuid) does not exist
--   (SQLSTATE 42883)
-- which is the root cause of the preview-branch MIGRATIONS_FAILED state.
-- Guarding each revoke with to_regprocedure makes this migration idempotent and
-- replay-safe. On production every object exists, so behaviour is UNCHANGED; on a
-- fresh database the guard skips whatever is not there yet.
-- Evidence: docs/02-architecture/snapshots/baseline-replay-audit-2026-09-17.md
-- Still outstanding (SB-003/SB-006): the 41 live-only functions and 8 live-only
-- tables must be recovered into Git so a fresh replay yields a COMPLETE schema.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- signature, roles to revoke from
      ('public.outbox_enqueue(text,text,text,jsonb,uuid)',                     array['anon','authenticated']),
      ('public.outbox_claim(text,integer)',                                    array['anon','authenticated']),
      ('public.outbox_mark_failed(uuid,text,timestamptz)',                     array['anon','authenticated']),
      ('public.outbox_mark_sent(uuid,text)',                                   array['anon','authenticated']),
      ('public.fn_record_tool_call_start(uuid,text,integer,jsonb,text,uuid)',  array['anon','authenticated']),
      ('public.fn_record_tool_call_end(uuid,text,jsonb,text)',                 array['anon','authenticated']),
      ('public.request_approval(text,text,text,jsonb,text,text,uuid,integer)', array['anon','authenticated']),
      -- record_check_in: anon revoked; authenticated intentionally kept
      ('public.record_check_in(uuid,uuid,text,uuid,text,inet,text,jsonb)',     array['anon']),
      ('public.fn_notify_next_in_line(uuid)',                                  array['anon','authenticated']),
      ('public.fn_insert_conversation(jsonb)',                                 array['anon','authenticated']),
      ('public.fn_upsert_delivery_log(jsonb)',                                 array['anon','authenticated']),
      ('public.fn_update_conversation_intent(text,text,numeric,text)',         array['anon','authenticated'])
    ) as t(sig, roles)
  loop
    if to_regprocedure(r.sig) is not null then
      execute format('revoke execute on function %s from %s', r.sig, array_to_string(r.roles, ', '));
    else
      raise notice 'Skipping revoke; function not present in this database: %', r.sig;
    end if;
  end loop;
end $$;
