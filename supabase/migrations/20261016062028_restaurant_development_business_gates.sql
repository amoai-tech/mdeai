-- SAN-1521 · Restaurant development business gates (server-controlled phase)
--
-- Goal: during PRELAUNCH DEVELOPMENT, a Super Admin can create/import restaurants,
-- discover inactive ones, add unapproved contest entries, vote in a draft/expired test
-- contest, and see development counts — WITHOUT approval/verification/publication gates.
-- At public-launch certification the gates return automatically.
--
-- ONE canonical phase source, server-controlled and NOT client-writable:
--   public.app_runtime_config('application_phase') -> public.mde_application_phase()
-- Default is 'launch' (production-safe). Enabling development is an explicit owner action:
--   update public.app_runtime_config set value='development', updated_at=now()
--    where key='application_phase';
--
-- Preserved in BOTH phases: authentication (real auth.users), private vote.* schema,
-- one-ballot uniqueness + advisory lock, idempotency/receipts, transaction integrity,
-- and the device-reuse fraud signal. Fraud is observational in development (weight 1).
--
-- Applied migration 20261015222928 is NOT edited; the three functions are replaced here.

-- ── 1. Canonical phase ────────────────────────────────────────────────────────
create table if not exists public.app_runtime_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_runtime_config (key, value)
values ('application_phase', 'launch')
on conflict (key) do nothing;

alter table public.app_runtime_config enable row level security;
revoke all on public.app_runtime_config from public, anon, authenticated;

create or replace function public.mde_application_phase()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select value from public.app_runtime_config where key = 'application_phase'),
    'launch'
  );
$$;

-- Read-only, non-sensitive phase string: anon/authenticated need it for RLS predicates.
revoke all on function public.mde_application_phase() from public;
grant execute on function public.mde_application_phase() to anon, authenticated, service_role;

-- ── 2. Restaurant visibility + Super Admin writes (phase-aware) ───────────────
drop policy if exists anon_can_view_active_restaurants on public.restaurants;
create policy anon_can_view_active_restaurants on public.restaurants
  for select to anon
  using (is_active = true or public.mde_application_phase() = 'development');

drop policy if exists authenticated_can_view_active_restaurants on public.restaurants;
create policy authenticated_can_view_active_restaurants on public.restaurants
  for select to authenticated
  using (is_active = true or public.mde_application_phase() = 'development');

drop policy if exists moderators_can_insert_restaurants on public.restaurants;
create policy moderators_can_insert_restaurants on public.restaurants
  for insert to authenticated
  with check (public.is_moderator() or public.is_admin());

drop policy if exists moderators_can_update_restaurants on public.restaurants;
create policy moderators_can_update_restaurants on public.restaurants
  for update to authenticated
  using (public.is_moderator() or public.is_admin())
  with check (public.is_moderator() or public.is_admin());

-- ── 3. Restaurant vote writer (business gates phase-aware) ────────────────────
create or replace function public.cast_restaurant_vote(
  p_contest_id      uuid,
  p_entity_id       uuid,
  p_user_id         uuid,
  p_idempotency_key text,
  p_ip_hash         text,
  p_device_hash     text default null,
  p_user_agent      text default null,
  p_country         text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contest    vote.contests;
  v_entity     vote.entities;
  v_vote       vote.votes;
  v_now        timestamptz := now();
  v_phase      text := public.mde_application_phase();
  v_dev        boolean := (public.mde_application_phase() = 'development');
  v_suspicious boolean := false;
  v_devices    integer;
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'AUTH_USER_NOT_FOUND' using errcode = '42501';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;
  if p_ip_hash is null or length(btrim(p_ip_hash)) = 0 then
    raise exception 'INVALID_IP_HASH' using errcode = '22023';
  end if;

  select * into v_vote from vote.votes v where v.idempotency_key = p_idempotency_key;
  if found then
    if v_vote.contest_id <> p_contest_id
       or v_vote.entity_id <> p_entity_id
       or v_vote.voter_user_id is distinct from p_user_id then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'status', 'replayed', 'vote_id', v_vote.id, 'contest_id', v_vote.contest_id,
      'entity_id', v_vote.entity_id, 'created_at', v_vote.created_at
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_contest_id::text || ':' || p_user_id::text, 0));

  select * into v_contest from vote.contests c where c.id = p_contest_id;
  if not found then
    raise exception 'CONTEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_contest.kind is distinct from 'restaurant' then
    raise exception 'CONTEST_NOT_RESTAURANT' using errcode = '22023';
  end if;

  -- Business gates apply at launch; development lets an owner exercise the workflow.
  if not v_dev then
    if v_contest.status <> 'live' then
      raise exception 'CONTEST_NOT_OPEN' using errcode = '22023';
    end if;
    if v_contest.starts_at is not null and v_now < v_contest.starts_at then
      raise exception 'CONTEST_NOT_STARTED' using errcode = '22023';
    end if;
    if v_contest.ends_at is not null and v_now >= v_contest.ends_at then
      raise exception 'CONTEST_CLOSED' using errcode = '22023';
    end if;
  end if;

  select * into v_entity
    from vote.entities e
   where e.id = p_entity_id and e.contest_id = p_contest_id;
  if not found then
    raise exception 'RESTAURANT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not v_dev and not coalesce(v_entity.approved, false) then
    raise exception 'RESTAURANT_NOT_APPROVED' using errcode = '22023';
  end if;

  select * into v_vote
    from vote.votes v
   where v.contest_id = p_contest_id
     and v.voter_user_id = p_user_id
     and v.source = 'audience'
     and v.restaurant_ballot
   limit 1;
  if found then
    return jsonb_build_object(
      'status', 'already_voted', 'vote_id', v_vote.id, 'contest_id', v_vote.contest_id,
      'entity_id', v_vote.entity_id, 'created_at', v_vote.created_at
    );
  end if;

  -- Device reuse is always detected; it only suppresses weight at launch.
  if p_device_hash is not null then
    select count(*) into v_devices
      from vote.votes v
     where v.device_hash = p_device_hash
       and v.contest_id = p_contest_id
       and v.voter_user_id is distinct from p_user_id
       and v.created_at >= v_now - interval '1 day';
    v_suspicious := v_devices >= 3;
  end if;

  begin
    insert into vote.votes (
      contest_id, entity_id, voter_user_id,
      weight, source, ip_hash, device_hash, user_agent, country,
      fraud_status, idempotency_key, restaurant_ballot
    ) values (
      p_contest_id, p_entity_id, p_user_id,
      case when v_suspicious and not v_dev then 0 else 1.0 end, 'audience', p_ip_hash, p_device_hash,
      left(p_user_agent, 256), p_country,
      case when v_suspicious and not v_dev then 'suspicious' else 'pending' end, p_idempotency_key, true
    )
    returning * into v_vote;
  exception when unique_violation then
    select * into v_vote
      from vote.votes v
     where v.contest_id = p_contest_id and v.voter_user_id = p_user_id
       and v.source = 'audience' and v.restaurant_ballot
     limit 1;
    if found then
      return jsonb_build_object(
        'status', 'already_voted', 'vote_id', v_vote.id, 'contest_id', v_vote.contest_id,
        'entity_id', v_vote.entity_id, 'created_at', v_vote.created_at
      );
    end if;
    raise;
  end;

  if v_suspicious then
    insert into vote.fraud_signals (vote_id, rules_hit)
    values (v_vote.id, array['device_reuse']);
  end if;

  return jsonb_build_object(
    'status', 'cast', 'vote_id', v_vote.id, 'contest_id', v_vote.contest_id,
    'entity_id', v_vote.entity_id, 'created_at', v_vote.created_at,
    'fraud_status', v_vote.fraud_status, 'application_phase', v_phase
  );
end;
$$;

-- ── 4. Contest context: report development availability truthfully ────────────
create or replace function public.vote_contest_context(p_contest_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'id', c.id,
    'kind', c.kind,
    'status', c.status,
    'starts_at', c.starts_at,
    'ends_at', c.ends_at,
    'free_votes_per_user_per_day', c.free_votes_per_user_per_day,
    'paid_votes_enabled', c.paid_votes_enabled,
    'application_phase', public.mde_application_phase(),
    'is_open', (
      c.status = 'live'
      and (c.starts_at is null or now() >= c.starts_at)
      and (c.ends_at is null or now() < c.ends_at)
    ),
    'voting_available', (
      (c.status = 'live'
       and (c.starts_at is null or now() >= c.starts_at)
       and (c.ends_at is null or now() < c.ends_at))
      or public.mde_application_phase() = 'development'
    )
  )
  from vote.contests c
  where c.id = p_contest_id;
$$;

-- ── 5. Tally: development counts are not suppressed by fraud flags ────────────
create or replace function public.vote_tally(p_entity_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'entity_id', p_entity_id,
    'application_phase', public.mde_application_phase(),
    'audience_accepted', count(*) filter (
      where v.source = 'audience'
        and (v.fraud_status = 'clean'
             or (public.mde_application_phase() = 'development' and v.fraud_status <> 'blocked'))
    ),
    'audience_pending',  count(*) filter (where v.source = 'audience' and v.fraud_status in ('pending', 'suspicious')),
    'audience_total',    count(*) filter (where v.source = 'audience' and v.fraud_status <> 'blocked')
  )
  from vote.votes v
  where v.entity_id = p_entity_id;
$$;

-- ── 6. Grants unchanged: vote.* stays private, backend-only RPCs ──────────────
revoke all on function public.cast_restaurant_vote(uuid, uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.cast_restaurant_vote(uuid, uuid, uuid, text, text, text, text, text)
  to service_role;
revoke all on function public.vote_contest_context(uuid) from public, anon, authenticated;
grant execute on function public.vote_contest_context(uuid) to service_role;
revoke all on function public.vote_tally(uuid) from public, anon, authenticated;
grant execute on function public.vote_tally(uuid) to service_role;
