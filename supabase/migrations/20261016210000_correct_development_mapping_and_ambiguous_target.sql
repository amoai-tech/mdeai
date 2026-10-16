-- SAN-1483 corrective · honest development identity + deterministic target resolution
--
-- 1. The linked development entry named itself "Restaurant Candidate". A link alone is not
--    evidence that the entry represents Carmen, so the entry must say so.
-- 2. public.vote_restaurant_target must not choose a contest for the visitor. It now takes
--    an explicit contest and REFUSES (returns null) when the restaurant is ambiguous.

update vote.entities
   set display_name = '[DEV TEST] Carmen',
       slug = 'dev-test-carmen'
 where id = 'e1520000-0000-0000-0000-000000000331'
   and restaurant_id = 'ade2d416-1250-4edb-b131-59691910e8e1';

drop function if exists public.vote_restaurant_target(uuid);

create or replace function public.vote_restaurant_target(
  p_restaurant_id uuid,
  p_contest_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_candidates integer;
  v_row jsonb;
begin
  select count(*) into v_candidates
    from vote.entities e
    join vote.contests c on c.id = e.contest_id
   where e.restaurant_id = p_restaurant_id
     and c.kind = 'restaurant'
     and (p_contest_id is null or c.id = p_contest_id)
     and (
       (c.status = 'live'
         and (c.starts_at is null or now() >= c.starts_at)
         and (c.ends_at is null or now() < c.ends_at))
       or private.mde_application_phase() = 'development'
     );

  -- No candidate, or several with no explicit contest: refuse rather than guess.
  if v_candidates = 0 or (p_contest_id is null and v_candidates > 1) then
    return null;
  end if;

  select jsonb_build_object(
    'contest_id', c.id,
    'entity_id', e.id,
    'contest_title', c.title,
    'restaurant_name', r.name,
    'application_phase', private.mde_application_phase()
  )
  into v_row
  from vote.entities e
  join vote.contests c on c.id = e.contest_id
  join public.restaurants r on r.id = e.restaurant_id
  where e.restaurant_id = p_restaurant_id
    and c.kind = 'restaurant'
    and (p_contest_id is null or c.id = p_contest_id)
    and (
      (c.status = 'live'
        and (c.starts_at is null or now() >= c.starts_at)
        and (c.ends_at is null or now() < c.ends_at))
      or private.mde_application_phase() = 'development'
    )
  order by (c.status = 'live') desc, c.id asc
  limit 1;

  return v_row;
end;
$$;

revoke all on function public.vote_restaurant_target(uuid, uuid) from public, anon, authenticated;
grant execute on function public.vote_restaurant_target(uuid, uuid) to service_role;