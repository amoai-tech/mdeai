-- SAN-368: reserve one paid Places/grounding provider call atomically per UTC day.
-- Reuses the existing service-only quota table; row conflict locking prevents lost updates.
create or replace function public.reserve_places_grounding_quota(p_daily_cap integer)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_daily_cap is null or p_daily_cap <= 0 then
    return false;
  end if;

  insert into public.grounding_quota_log as quota (date, count)
  values ((now() at time zone 'utc')::date, 1)
  on conflict (date) do update
    set count = quota.count + 1
    where quota.count < p_daily_cap;

  return found;
end;
$$;

revoke all on function public.reserve_places_grounding_quota(integer) from public, anon, authenticated;
grant execute on function public.reserve_places_grounding_quota(integer) to service_role;

comment on function public.reserve_places_grounding_quota(integer) is
  'Atomically reserve one daily paid Places/grounding request under the server-side cap.';
