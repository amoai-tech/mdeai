-- SAN-1524 · make an ambiguous restaurant contest visible instead of silent
--
-- vote_restaurant_target refuses to guess when a restaurant contests more than one contest
-- (20261016220000). Refusing is correct, but the detail page showed nothing at all, so a
-- restaurant in two contests could not be voted for in either.
--
-- This adds the read the page needs to ASK: every contest this restaurant can be voted in,
-- with the same eligibility filter and the same service-role-only grant as the target RPC.

create or replace function public.vote_restaurant_contest_options(p_restaurant_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(jsonb_agg(row order by row->>'status' desc, row->>'contest_title'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'contest_id', c.id,
      'entity_id', e.id,
      'contest_title', c.title,
      'status', c.status,
      'starts_at', c.starts_at,
      'ends_at', c.ends_at
    ) as row
    from vote.entities e
    join vote.contests c on c.id = e.contest_id
    where e.restaurant_id = p_restaurant_id
      and c.kind = 'restaurant'
      and (
        (c.status = 'live'
          and (c.starts_at is null or now() >= c.starts_at)
          and (c.ends_at is null or now() < c.ends_at))
        or private.mde_application_phase() = 'development'
      )
  ) s;
$$;

revoke all on function public.vote_restaurant_contest_options(uuid) from public, anon, authenticated;
grant execute on function public.vote_restaurant_contest_options(uuid) to service_role;
