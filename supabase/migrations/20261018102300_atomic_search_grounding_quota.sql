-- SAN-124: reserve one Google Search grounding call atomically per UTC day.
-- Reuse the existing service-only quota table, no new engine or user-visible gates.
-- Reserve capacity in one statement; row-level conflict locking prevents lost updates.

create or replace function public.reserve_search_grounding_quota(p_daily_cap integer)
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

  insert into public.search_grounding_quota_log as quota (date, count)
  values ((now() at time zone 'utc')::date, 1)
  on conflict (date) do update
    set count = quota.count + 1
    where quota.count < p_daily_cap;

  return found;
end;
$$;

-- Functions have PUBLIC EXECUTE by default. Only the trusted server client may
-- reserve paid searches; never allow anonymous or authenticated callers.
revoke all on function public.reserve_search_grounding_quota(integer) from public, anon, authenticated;
grant execute on function public.reserve_search_grounding_quota(integer) to service_role;

comment on function public.reserve_search_grounding_quota(integer) is
  'Atomically reserve one daily Google Search grounding request under the server-side cap.';
