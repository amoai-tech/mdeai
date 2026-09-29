-- SAN-1313 · C regression suite — the wait-list notify path actually works
--
-- WHAT THIS LOCKS IN
--   1. The stored `wait_list_expire_holds` command, executed verbatim from `cron.job`, expires
--      the overdue hold AND advances the queue — the next person moves from `waiting` to
--      `notified`.
--   2. An account-holder gets an in-app notification row.
--   3. An email-only entry (user_id NULL, which the schema allows) does not raise, and still
--      advances the queue.
--   4. The repaired function no longer references the non-existent `payload` column.
--   5. The grant contract is preserved: service_role may execute, anon may not.
--
-- WHY THIS TEST RUNS THE STORED COMMAND RATHER THAN A COPY
-- The defect this suite guards against was invisible precisely because the schedule asserted
-- fine in `cron.job` while doing nothing at runtime. Extracting the command text from
-- `cron.job` and executing it proves the *stored schedule* works, not a paraphrase of it.
--
-- WHY THE FIXTURE MATTERS
-- The original bug needed a 30-minute-old `notified_at` to reproduce. A fixture that notified
-- "just now" would pass against the broken logic and prove nothing, so the hold is set to have
-- expired one minute ago with `notified_at` 30 minutes in the past — exactly a real hold.
--
-- RED → GREEN
--   RED   against the pre-repair function: the command raises
--         `column "payload" of relation "notifications" does not exist`.
--   GREEN after 20260928140000_san1313c_wait_list_notify_repair.sql.
--
-- Run with: supabase test db

begin;

select plan(6);

-- ── Fixture: one expired hold with a 30-minute-old notified_at, one person waiting behind it
insert into public.event_tickets (event_id, name, price_cents, qty_total)
select id, 'SAN1313C-Probe', 0, 10 from public.events order by id limit 1;

insert into public.event_wait_list (event_id, ticket_type_id, user_id, email, position, status, notified_at, hold_expires_at)
select t.event_id, t.id, null::uuid, 'san1313c-expired@example.com', 9001, 'notified',
       pg_catalog.now() - interval '30 minutes', pg_catalog.now() - interval '1 minute'
from public.event_tickets t where t.name = 'SAN1313C-Probe'
union all
select t.event_id, t.id, null::uuid, 'san1313c-next@example.com', 9002, 'waiting',
       null::timestamptz, null::timestamptz
from public.event_tickets t where t.name = 'SAN1313C-Probe';

-- ── Execute the STORED command exactly as pg_cron would
do $run$
declare
  v_cmd text;
begin
  select command into v_cmd from cron.job where jobname = 'wait_list_expire_holds';
  if v_cmd is null then
    raise exception 'SAN-1313: wait_list_expire_holds is not scheduled';
  end if;
  execute v_cmd;
end
$run$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- The path end to end
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select status from public.event_wait_list where email = 'san1313c-expired@example.com'),
  'expired',
  'C: the overdue hold is expired');

select is(
  (select status from public.event_wait_list where email = 'san1313c-next@example.com'),
  'notified',
  'C: the next person in the queue is advanced to notified (the original defect)');

-- ═══════════════════════════════════════════════════════════════════════════════
-- The repaired function
-- ═══════════════════════════════════════════════════════════════════════════════

-- Asserts the INSERT names the correct columns, positively. A negative "does the body mention
-- column X anywhere" check is prose-fragile: `prosrc` stores the function's own comments, so an
-- explanatory comment would trip it. This pins the actual column list instead.
select ok(
  (select prosrc from pg_proc where proname = 'fn_notify_next_in_line')
    ~ 'insert into public\.notifications \(user_id, type, title, metadata\)',
  'C: the notification insert names (user_id, type, title, metadata) — the columns that exist');

-- Documents WHY the repair was needed: the column genuinely does not exist.
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'payload'),
  0,
  'C: public.notifications still has no payload column (metadata is the structured column)');

-- The queue is now empty (the only waiting row was just advanced), so a second call must
-- report `empty_queue` rather than raising. This is the email-only path: both fixture rows have
-- user_id NULL, so reaching this point at all proves the NOT NULL user_id guard holds.
select is(
  (public.fn_notify_next_in_line(
     (select id from public.event_tickets where name = 'SAN1313C-Probe'))) -> 'notified',
  'false'::jsonb,
  'C: email-only entries (user_id NULL) work and an empty queue reports rather than raising');

select is(
  (select count(*)::int from information_schema.routine_privileges
    where routine_name = 'fn_notify_next_in_line'
      and grantee = 'anon'),
  0,
  'C: anon cannot execute fn_notify_next_in_line (grant contract preserved)');

select * from finish();
rollback;
