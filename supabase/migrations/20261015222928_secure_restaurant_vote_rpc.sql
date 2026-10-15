-- SAN-1498 · Secure restaurant vote submission contract (Option A)
--
-- Problem: the deployed vote Edge Functions call service.schema('vote').from(...) over
-- PostgREST, but the private vote schema is deliberately NOT exposed
-- (authenticator.pgrst.db_schemas = public,sponsor). Every vote read/write therefore fails
-- with PGRST106 before RLS is evaluated.
--
-- Option A keeps vote.* private and adds a small public RPC boundary: one restaurant writer
-- plus readers. It contains no pageant logic. vote-cast reaches it with the service client.
--
-- Security properties:
--   * SECURITY DEFINER with an empty, fixed search_path; every object is schema-qualified.
--   * EXECUTE revoked from PUBLIC, anon and authenticated; granted only to service_role.
--     The caller MUST pass the user id it verified from the user's JWT, never a body value.
--   * No anonymous ballots: p_user_id is required and must be a real auth.users row.
--   * Restaurant-only: kind = 'restaurant' is required (CONTEST_NOT_RESTAURANT).
--   * One final audience ballot per account per contest is enforced BOTH by a per-
--     (contest,account) advisory lock and by a restaurant-scoped partial unique index.
--     The flag column defaults false, so historical pageant rows are unaffected.
--   * Device-reuse is scored at write time (weight 0, fraud_status 'suspicious', a row in
--     vote.fraud_signals) in addition to the async scan.
--   * Restaurant reads never expose legacy weighted/paid/judge fields.

-- ── 0. Restaurant-scoped uniqueness (additive; legacy rows default false) ─────
alter table vote.votes
  add column if not exists restaurant_ballot boolean not null default false;

create unique index if not exists vote_votes_one_restaurant_ballot_idx
  on vote.votes (contest_id, voter_user_id)
  where restaurant_ballot and source = 'audience' and voter_user_id is not null;

-- ── 1. Restaurant vote writer ─────────────────────────────────────────────────
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
  v_suspicious boolean := false;
  v_devices    integer;
begin
  -- ── Authorization ─────────────────────────────────────────────────────────
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

  -- ── Idempotent replay: return the original receipt, never a second row ─────
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

  -- ── Serialise per (contest, account) ──────────────────────────────────────
  perform pg_advisory_xact_lock(hashtextextended(p_contest_id::text || ':' || p_user_id::text, 0));

  -- ── Contest must be a restaurant contest, open by database time ───────────
  select * into v_contest from vote.contests c where c.id = p_contest_id;
  if not found then
    raise exception 'CONTEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_contest.kind is distinct from 'restaurant' then
    raise exception 'CONTEST_NOT_RESTAURANT' using errcode = '22023';
  end if;
  if v_contest.status <> 'live' then
    raise exception 'CONTEST_NOT_OPEN' using errcode = '22023';
  end if;
  if v_contest.starts_at is not null and v_now < v_contest.starts_at then
    raise exception 'CONTEST_NOT_STARTED' using errcode = '22023';
  end if;
  if v_contest.ends_at is not null and v_now >= v_contest.ends_at then
    raise exception 'CONTEST_CLOSED' using errcode = '22023';
  end if;

  -- ── Entry must be an approved restaurant in this contest ──────────────────
  select * into v_entity
    from vote.entities e
   where e.id = p_entity_id and e.contest_id = p_contest_id;
  if not found then
    raise exception 'RESTAURANT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not coalesce(v_entity.approved, false) then
    raise exception 'RESTAURANT_NOT_APPROVED' using errcode = '22023';
  end if;

  -- ── One restaurant ballot per account per contest ─────────────────────────
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

  -- ── Sync device-reuse signal (legacy L4), kept alongside the async scan ───
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
      case when v_suspicious then 0 else 1.0 end, 'audience', p_ip_hash, p_device_hash,
      left(p_user_agent, 256), p_country,
      case when v_suspicious then 'suspicious' else 'pending' end, p_idempotency_key, true
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
    'fraud_status', v_vote.fraud_status
  );
end;
$$;

comment on function public.cast_restaurant_vote(uuid, uuid, uuid, text, text, text, text, text) is
  'SAN-1498: authorised restaurant vote writer. SECURITY DEFINER; service_role only. The caller must pass a user id verified from the user JWT.';

-- ── 2. Read boundary: restaurant contest context ──────────────────────────────
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
    'is_open', (
      c.status = 'live'
      and (c.starts_at is null or now() >= c.starts_at)
      and (c.ends_at is null or now() < c.ends_at)
    )
  )
  from vote.contests c
  where c.id = p_contest_id;
$$;

-- ── 3. Read boundary: restaurant audience tally (no legacy weighted fields) ───
create or replace function public.vote_tally(p_entity_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'entity_id', p_entity_id,
    'audience_accepted', count(*) filter (where v.source = 'audience' and v.fraud_status = 'clean'),
    'audience_pending',  count(*) filter (where v.source = 'audience' and v.fraud_status in ('pending', 'suspicious')),
    'audience_total',    count(*) filter (where v.source = 'audience' and v.fraud_status <> 'blocked')
  )
  from vote.votes v
  where v.entity_id = p_entity_id;
$$;

-- ── 4. Single-use nonce consumption (nonce replay protection) ────────────────
create table if not exists public.vote_consumed_nonces (
  jti uuid primary key,
  consumed_at timestamptz not null default now()
);

alter table public.vote_consumed_nonces enable row level security;
revoke all on public.vote_consumed_nonces from public, anon, authenticated;

create or replace function public.vote_consume_nonce(p_jti uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_jti is null then
    return false;
  end if;
  insert into public.vote_consumed_nonces (jti) values (p_jti);
  return true;
exception when unique_violation then
  return false;
end;
$$;

-- ── Grants: backend-only boundaries, vote.* stays unexposed ──────────────────
revoke all on function public.cast_restaurant_vote(uuid, uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.cast_restaurant_vote(uuid, uuid, uuid, text, text, text, text, text)
  to service_role;

revoke all on function public.vote_contest_context(uuid) from public, anon, authenticated;
grant execute on function public.vote_contest_context(uuid) to service_role;

revoke all on function public.vote_tally(uuid) from public, anon, authenticated;
grant execute on function public.vote_tally(uuid) to service_role;

revoke all on function public.vote_consume_nonce(uuid) from public, anon, authenticated;
grant execute on function public.vote_consume_nonce(uuid) to service_role;
