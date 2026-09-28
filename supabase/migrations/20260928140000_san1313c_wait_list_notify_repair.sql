-- SAN-1313 · C — repair the wait-list notification insert
--
-- ⚠️ SCOPE NOTE — this migration is a deliberate, documented expansion of SAN-1313.
--
-- SAN-1313 owns making the cron schedules reproducible. B2 (20260928130000) fixed a defect
-- INSIDE the `wait_list_expire_holds` command. Fixing that defect makes the command actually
-- call `public.fn_notify_next_in_line()` — which exposed a second, independent defect in the
-- function itself. Leaving it unfixed would mean the schedule B2 just repaired fails on every
-- run, so the two changes only make sense together. Recorded here rather than folded silently
-- into the schedule migration.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE DEFECT
--
-- `public.fn_notify_next_in_line()` ends with:
--
--     INSERT INTO public.notifications (user_id, type, payload)
--     VALUES (v_row.user_id, 'wait_list_spot_available', jsonb_build_object(...))
--     ON CONFLICT DO NOTHING;
--
-- `public.notifications` has NO `payload` column. Its columns are:
--
--     id, user_id, type, title, body, metadata, read, created_at
--
-- Verified live in production `zkwcbyxiwklihegjhuql` on 2026-09-28 — this is not local drift.
-- The function has no EXCEPTION block, so the error propagates rather than being swallowed:
--
--     ERROR:  column "payload" of relation "notifications" does not exist
--     CONTEXT:  PL/pgSQL function fn_notify_next_in_line(uuid) line 23
--
-- There is also a second, latent failure in the same statement: `title` is NOT NULL with no
-- DEFAULT, and the original INSERT never supplied it. So correcting `payload` to `metadata`
-- alone would still fail. Both are fixed here.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY IT WAS NEVER NOTICED — one bug masked the other
--
-- The cron command in production filtered its notify step with
-- `notified_at > now() - interval '6 minutes'` while the hold is 30 minutes, so the condition
-- was unsatisfiable and `fn_notify_next_in_line()` was NEVER CALLED. The function's own defect
-- could not surface because nothing ever invoked it. `public.event_wait_list` also currently
-- holds 0 rows, and pg_cron records `succeeded` because the SQL executed without error.
--
-- B2 removes the first defect; this migration removes the second. Together the path works.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE FIX — minimal, and no business rule changed
--
--   * `payload`  -> `metadata`      the structured column that actually exists
--                                   (jsonb, NOT NULL DEFAULT '{}')
--   * `title`   -> added            NOT NULL with no default; a plain user-facing string
--
-- Nothing else changes. The function keeps its exact signature, SECURITY DEFINER, its
-- `search_path`, its queue selection (`ORDER BY position ASC LIMIT 1 FOR UPDATE SKIP LOCKED`),
-- its 30-minute hold, and its return shape. Only the INSERT is corrected.
--
-- `search_path` is deliberately left as the verified live contract `public, pg_temp` rather
-- than tightened to `''`. Tightening it is a legitimate hardening step, but it is a different
-- change with a different risk profile and does not belong in a bug repair.
--
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_notify_next_in_line(p_ticket_type_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row   public.event_wait_list%rowtype;
begin
  select * into v_row
  from public.event_wait_list
  where ticket_type_id = p_ticket_type_id and status = 'waiting'
  order by position asc
  limit 1
  for update skip locked;

  if v_row.id is null then
    return jsonb_build_object('notified', false, 'reason', 'empty_queue');
  end if;

  update public.event_wait_list set
    status          = 'notified',
    notified_at     = pg_catalog.now(),
    hold_expires_at = pg_catalog.now() + interval '30 minutes'
  where id = v_row.id;

  -- in-app notification
  -- FIX 1: the structured column on public.notifications is `metadata`. The previous statement
  --        named a column that does not exist on that table, so this insert always raised.
  -- FIX 2: `title` is NOT NULL with no default -> it must be supplied.
  -- FIX 3: `notifications.user_id` is NOT NULL, but `event_wait_list.user_id` is NULLABLE
  --        (email is NOT NULL), so an email-only wait-list entry has no account to notify
  --        into. An unconditional insert raises `null value in column "user_id"` for those
  --        entries and aborts the whole call. The caller already receives `email` in the
  --        returned result for out-of-band delivery, so the in-app row is only written
  --        when there is a real user to write it for.
  if v_row.user_id is not null then
    insert into public.notifications (user_id, type, title, metadata)
    values (
      v_row.user_id,
      'wait_list_spot_available',
      'A wait-list spot opened',
      jsonb_build_object(
        'ticket_type_id', v_row.ticket_type_id,
        'event_id',       v_row.event_id,
        'expires_at',     (pg_catalog.now() + interval '30 minutes')
      )
    )
    on conflict do nothing;
  end if;

  return jsonb_build_object('notified', true, 'user_id', v_row.user_id, 'email', v_row.email);
end;
$fn$;

-- Preserve the verified live grant contract: service_role and postgres only.
revoke all on function public.fn_notify_next_in_line(uuid) from public, anon, authenticated;
grant execute on function public.fn_notify_next_in_line(uuid) to service_role;
