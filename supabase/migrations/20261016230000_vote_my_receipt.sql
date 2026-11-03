-- SAN-1469 · Account-scoped receipt recovery (cross-device)
--
-- localStorage only knows the browser that cast the ballot. This RPC answers "which ballot
-- does THIS account already have in this contest?" so a second device can show the same
-- durable receipt. It never reveals another account's ballot: the caller passes the user id
-- it verified server-side, and execution is service_role only.

create or replace function public.vote_my_receipt(p_contest_id uuid, p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'vote_id', v.id,
    'contest_id', v.contest_id,
    'entity_id', v.entity_id,
    'created_at', v.created_at,
    'restaurant_id', e.restaurant_id,
    'restaurant_name', r.name
  )
  from vote.votes v
  join vote.entities e on e.id = v.entity_id
  left join public.restaurants r on r.id = e.restaurant_id
  where v.contest_id = p_contest_id
    and v.voter_user_id = p_user_id
    and v.source = 'audience'
    and v.restaurant_ballot
  order by v.created_at asc
  limit 1;
$$;

revoke all on function public.vote_my_receipt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.vote_my_receipt(uuid, uuid) to service_role;