-- SAN-1620 S4/S5 — follow an event, and be told once when real tickets appear.
--
-- A follow is consent to one in-app notification about this event, not a booking, a
-- ticket, or a waitlist entry. event_wait_list is tier-scoped (ticket_type_id NOT NULL)
-- and saved_places is a bookmark without consent, so neither can represent this.

create table if not exists public.event_interest_subscriptions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- The last tier that produced a notification for this follower. Retries of the same
  -- tier therefore cannot notify twice.
  last_notified_tier_id uuid references public.event_tickets(id) on delete set null,
  constraint event_interest_subscriptions_event_user_key unique (event_id, user_id)
);

comment on table public.event_interest_subscriptions is
  'Per-user consent to in-app updates about one event. Not a ticket, booking or waitlist entry.';

create index if not exists event_interest_subscriptions_event_idx
  on public.event_interest_subscriptions (event_id);

alter table public.event_interest_subscriptions enable row level security;

-- A subscriber list is private: only the owning user may read or change their own row.
drop policy if exists event_interest_select_own on public.event_interest_subscriptions;
create policy event_interest_select_own on public.event_interest_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists event_interest_insert_own on public.event_interest_subscriptions;
create policy event_interest_insert_own on public.event_interest_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists event_interest_delete_own on public.event_interest_subscriptions;
create policy event_interest_delete_own on public.event_interest_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, delete on public.event_interest_subscriptions to authenticated;
revoke all on public.event_interest_subscriptions from anon;

-- One notification per follower per newly available tier. The trigger is the canonical
-- place: it covers every writer (host UI, admin, AI draft publish, migrations) instead
-- of one server action that the next writer would forget.
create or replace function public.notify_event_interest_on_tier_available()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  became_available boolean;
begin
  -- "Available" means a real active tier with seats that is not held by pending orders.
  became_available := coalesce(new.is_active, false)
    and coalesce(new.qty_total, 0) > coalesce(new.qty_sold, 0) + coalesce(new.qty_pending, 0);

  if not became_available then
    return new;
  end if;
  -- Only on the transition into availability, not on every later edit.
  if tg_op = 'UPDATE'
     and coalesce(old.is_active, false)
     and coalesce(old.qty_total, 0) > coalesce(old.qty_sold, 0) + coalesce(old.qty_pending, 0) then
    return new;
  end if;

  with notified as (
    update public.event_interest_subscriptions s
       set last_notified_tier_id = new.id
     where s.event_id = new.event_id
       and (s.last_notified_tier_id is null or s.last_notified_tier_id <> new.id)
    returning s.user_id
  )
  insert into public.notifications (user_id, type, title, body, metadata)
  select n.user_id,
         'event_ticket_available',
         'Tickets are available for ' || coalesce(e.name, 'an event you follow'),
         'A new ticket option is on sale. Open the event to see it.',
         jsonb_build_object('event_id', new.event_id, 'ticket_id', new.id)
    from notified n
    join public.events e on e.id = new.event_id;

  return new;
end;
$$;

drop trigger if exists event_ticket_notify_interested on public.event_tickets;
create trigger event_ticket_notify_interested
  after insert or update of is_active, qty_total, qty_sold, qty_pending on public.event_tickets
  for each row execute function public.notify_event_interest_on_tier_available();
