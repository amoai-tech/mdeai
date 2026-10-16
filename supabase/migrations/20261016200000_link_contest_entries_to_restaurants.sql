-- SAN-1483 · Link contest entries to canonical restaurant records
--
-- One nullable FK from a contest entry to the restaurant it represents, so the vote and
-- leaderboard screens can show the canonical business instead of a lookalike row.
-- vote.* stays private: reads go through a service-role-only RPC.

alter table vote.entities
  add column if not exists restaurant_id uuid references public.restaurants(id) on delete set null;

create index if not exists vote_entities_restaurant_idx
  on vote.entities (restaurant_id) where restaurant_id is not null;

-- One entry per restaurant per contest.
create unique index if not exists vote_entities_one_entry_per_restaurant_idx
  on vote.entities (contest_id, restaurant_id) where restaurant_id is not null;

-- Backfill: link the labelled development entry to its canonical restaurant (Carmen).
update vote.entities e
   set restaurant_id = 'ade2d416-1250-4edb-b131-59691910e8e1'
 where e.id = 'e1520000-0000-0000-0000-000000000331'
   and e.restaurant_id is null;

-- Server-only read contract: the contest + entry a restaurant is contesting in.
create or replace function public.vote_restaurant_target(p_restaurant_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'contest_id', c.id,
    'entity_id', e.id,
    'contest_title', c.title,
    'restaurant_name', r.name,
    'application_phase', private.mde_application_phase()
  )
  from vote.entities e
  join vote.contests c on c.id = e.contest_id
  join public.restaurants r on r.id = e.restaurant_id
  where e.restaurant_id = p_restaurant_id
    and c.kind = 'restaurant'
    and (
      (c.status = 'live'
        and (c.starts_at is null or now() >= c.starts_at)
        and (c.ends_at is null or now() < c.ends_at))
      or private.mde_application_phase() = 'development'
    )
  order by (c.status = 'live') desc, c.id asc
  limit 1;
$$;

revoke all on function public.vote_restaurant_target(uuid) from public, anon, authenticated;
grant execute on function public.vote_restaurant_target(uuid) to service_role;