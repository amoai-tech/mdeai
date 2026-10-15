-- SAN-1498 · Secure restaurant vote submission contract (Option A)
--
-- Problem: the deployed vote Edge Functions call service.schema('vote').from(...) over
-- PostgREST, but the private vote schema is deliberately NOT exposed
-- (authenticator.pgrst.db_schemas = public,sponsor). Every vote read/write therefore fails
-- with PGRST106 before RLS is evaluated. vote-cast is verify_jwt=false and its current
-- insert path allows anonymous ballots (voter_anon_id) with no one-ballot constraint.
--
-- Option A keeps vote.* private and adds a small public RPC boundary: one restaurant writer
-- plus two readers. It contains no pageant logic.
--
--   authenticated user -> Edge Function (verifies the Supabase JWT)
--     -> public.cast_restaurant_vote(...)   [SECURITY DEFINER, service_role only]
--       -> private vote.votes                [one audience ballot per account per contest]
--     -> persisted receipt (jsonb)
--
-- Security properties:
--   * SECURITY DEFINER with an empty, fixed search_path; every object is schema-qualified.
--   * EXECUTE revoked from PUBLIC, anon and authenticated; granted only to service_role.
--     The service-role key identifies the backend, so the caller MUST pass the user id it
--     verified from the user's JWT — never a client-supplied id.
--   * No anonymous ballots: p_user_id is required and must be a real auth.users row.
--   * One audience ballot per (contest, user). The pageant contest allows 3 free votes/day,
--     so a table-wide unique index cannot express this rule; a per-(contest,user)
--     transaction advisory lock serialises check-then-insert and guarantees exactly one
--     record under concurrency through this contract. A kind-scoped unique index is a
--     deliberate follow-up once the restaurant contest kind is fixed (SAN-1453/SAN-1496).
--   * Restaurant-only: the contest must have kind = 'restaurant'. Historical pageant rows,
--     tables and legacy callers are untouched; no pageant functionality is added.

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
  v_contest  vote.contests;
  v_entity   vote.entities;
  v_vote     vote.votes;
  v_now      timestamptz := now();
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
      'status', 'replayed',
      'vote_id', v_vote.id,
      'contest_id', v_vote.contest_id,
      'entity_id', v_vote.entity_id,
      'created_at', v_vote.created_at
    );
  end if;

  -- ── Serialise per (contest, account): concurrent requests create one row ──
  perform pg_advisory_xact_lock(hashtextextended(p_contest_id::text || ':' || p_user_id::text, 0));

  -- ── Contest must be open by database time ─────────────────────────────────
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

  -- ── Entry must be approved and belong to this contest ─────────────────────
  select * into v_entity
    from vote.entities e
   where e.id = p_entity_id and e.contest_id = p_contest_id;
  if not found then
    raise exception 'RESTAURANT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not coalesce(v_entity.approved, false) then
    raise exception 'RESTAURANT_NOT_APPROVED' using errcode = '22023';
  end if;

  -- ── One audience ballot per account per contest ───────────────────────────
  select * into v_vote
    from vote.votes v
   where v.contest_id = p_contest_id
     and v.voter_user_id = p_user_id
     and v.source = 'audience'
   limit 1;
  if found then
    return jsonb_build_object(
      'status', 'already_voted',
      'vote_id', v_vote.id,
      'contest_id', v_vote.contest_id,
      'entity_id', v_vote.entity_id,
      'created_at', v_vote.created_at
    );
  end if;

  insert into vote.votes (
    contest_id, entity_id, voter_user_id,
    weight, source, ip_hash, device_hash, user_agent, country,
    fraud_status, idempotency_key
  ) values (
    p_contest_id, p_entity_id, p_user_id,
    1.0, 'audience', p_ip_hash, p_device_hash, left(p_user_agent, 256), p_country,
    'pending', p_idempotency_key
  )
  returning * into v_vote;

  return jsonb_build_object(
    'status', 'cast',
    'vote_id', v_vote.id,
    'contest_id', v_vote.contest_id,
    'entity_id', v_vote.entity_id,
    'created_at', v_vote.created_at
  );
end;
$$;

comment on function public.cast_restaurant_vote(uuid, uuid, uuid, text, text, text, text, text) is
  'SAN-1498: authorised restaurant vote writer. SECURITY DEFINER; service_role only. The caller must pass a user id verified from the user JWT.';

-- The private vote schema stays unexposed and no end user can call this directly.
revoke all on function public.cast_restaurant_vote(uuid, uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.cast_restaurant_vote(uuid, uuid, uuid, text, text, text, text, text)
  to service_role;

-- ── Read boundary: contest context (kind, open-by-DB-time, quota fields) ──────
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

-- ── Read boundary: entity tally for the optimistic UI response ───────────────
create or replace function public.vote_tally(p_entity_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'entity_id', et.entity_id,
    'audience_votes', et.audience_votes,
    'paid_votes', et.paid_votes,
    'judge_score', et.judge_score,
    'weighted_total', et.weighted_total,
    'rank', et.rank,
    'trend_24h', et.trend_24h,
    'updated_at', et.updated_at
  )
  from vote.entity_tally et
  where et.entity_id = p_entity_id;
$$;

-- The boundaries are backend-only. vote.* stays unexposed and ungranted to end users.
revoke all on function public.vote_contest_context(uuid) from public, anon, authenticated;
grant execute on function public.vote_contest_context(uuid) to service_role;

revoke all on function public.vote_tally(uuid) from public, anon, authenticated;
grant execute on function public.vote_tally(uuid) to service_role;
