-- SECURITY: Revoke PUBLIC EXECUTE on SECURITY DEFINER functions that are
-- service_role-only callers (edge functions / Mastra backend).
--
-- These functions had the default PUBLIC grant (=X/postgres). The prior migration
-- used REVOKE FROM anon/authenticated which only removes explicit
-- role grants — it does not affect the PUBLIC grant. REVOKE FROM PUBLIC is required.
--
-- After this migration ACL for affected functions: {postgres=X/postgres, service_role=X/postgres}
-- anon and authenticated lose access (PUBLIC inheritance removed).
-- service_role retains EXECUTE — all production callers use service_role.
--
-- record_check_in is excluded here — handled in the companion migration (had an explicit
-- anon grant, not PUBLIC; authenticated is intentionally kept for the check-in scanner).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SB-001 (2026-09-17) — REPLAY FIX
-- Same defect class as the companion migration: these functions exist in production
-- but have no `CREATE` in the repository, so a from-zero replay raised SQLSTATE 42883.
-- Guarded with to_regprocedure — idempotent, replay-safe, and a no-op change on
-- production, where every object exists.
-- Evidence: docs/02-architecture/snapshots/baseline-replay-audit-2026-09-17.md
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- Outbox pipeline
      ('public.outbox_enqueue(text,text,text,jsonb,uuid)'),
      ('public.outbox_claim(text,integer)'),
      ('public.outbox_mark_failed(uuid,text,timestamptz)'),
      ('public.outbox_mark_sent(uuid,text)'),
      -- Agent telemetry
      ('public.fn_record_tool_call_start(uuid,text,integer,jsonb,text,uuid)'),
      ('public.fn_record_tool_call_end(uuid,text,jsonb,text)'),
      -- HITL approval system
      ('public.request_approval(text,text,text,jsonb,text,text,uuid,integer)'),
      -- Waitlist backend
      ('public.fn_notify_next_in_line(uuid)'),
      -- OpenClaw marketing integration
      ('public.fn_insert_conversation(jsonb)'),
      ('public.fn_upsert_delivery_log(jsonb)'),
      ('public.fn_update_conversation_intent(text,text,numeric,text)')
    ) as t(sig)
  loop
    if to_regprocedure(r.sig) is not null then
      execute format('revoke execute on function %s from public', r.sig);
    else
      raise notice 'Skipping revoke; function not present in this database: %', r.sig;
    end if;
  end loop;
end $$;
