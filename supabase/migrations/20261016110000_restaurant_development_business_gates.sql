-- SAN-1521 · Restaurant development business gates (server-controlled phase)
--
-- Goal: during PRELAUNCH DEVELOPMENT, a Super Admin can create/import restaurants,
-- discover inactive ones, add unapproved contest entries, vote in a draft/expired test
-- contest, and see development counts — WITHOUT approval/verification/publication gates.
-- At public-launch certification the gates return automatically.
--
-- ONE canonical phase source, server-controlled, in an UNEXPOSED schema:
--   public.app_runtime_config('application_phase') -> private.mde_application_phase()
-- Default is 'development' (owner development-now policy). Flip to launch with:
--   update public.app_runtime_config set value='launch', updated_at=now()
--    where key='application_phase';
--
-- Preserved in BOTH phases: authentication (real auth.users), private vote.* schema,
-- one-ballot uniqueness + advisory lock, idempotency/receipts, transaction integrity,
-- and the device-reuse fraud signal. Fraud is observational in development (weight 1).
--
-- Applied migration 20261015222928 is NOT edited; the three functions are replaced here.

-- ── 1. Unexposed phase owner ──────────────────────────────────────────────────
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create table if not exists public.app_runtime_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_runtime_config (key, value)
values ('application_phase', 'development')
on conflict (key) do nothing;

alter table public.app_runtime_config enable row level security;
revoke all on public.app_runtime_config from public, anon, authenticated;
-- Reviewed: no extra policy is needed. RLS default-denies anon/authenticated and the revoke
-- removes their table privileges; service_role bypasses RLS and keeps its default privileges.
-- has_table_privilege confirms service_role sel/upd = true, authenticated/anon sel = false.

-- ── 1b. Development provenance on votes ──────────────────────────────────────
-- Development test ballots are real rows but must never feed the shared launch projection.
alter table vote.votes
  add column if not exists development_test boolean not null default false;

create or replace function private.mde_application_phase()
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

revoke all on function private.mde_application_phase() from public;
grant execute on function private.mde_application_phase() to anon, authenticated, service_role;
drop function if exists public.mde_application_phase();

-- ── 2. Restaurant visibility + Super Admin writes (phase-aware) ───────────────
drop policy if exists anon_can_view_active_restaurants on public.restaurants;
create policy anon_can_view_active_restaurants on public.restaurants
  for select to anon
  using (is_active = true or (select private.mde_application_phase()) = 'development');

drop policy if exists authenticated_can_view_active_restaurants on public.restaurants;
create policy authenticated_can_view_active_restaurants on public.restaurants
  for select to authenticated
  using (is_active = true or (select private.mde_application_phase()) = 'development');

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
  v_phase      text := private.mde_application_phase();
  v_dev        boolean := (private.mde_application_phase() = 'development');
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
      fraud_status, idempotency_key, restaurant_ballot, development_test
    ) values (
      p_contest_id, p_entity_id, p_user_id,
      case when v_suspicious and not v_dev then 0 else 1.0 end, 'audience', p_ip_hash, p_device_hash,
      left(p_user_agent, 256), p_country,
      case when v_suspicious and not v_dev then 'suspicious' else 'pending' end, p_idempotency_key, true, v_dev
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
    'application_phase', private.mde_application_phase(),
    'is_open', (
      c.status = 'live'
      and (c.starts_at is null or now() >= c.starts_at)
      and (c.ends_at is null or now() < c.ends_at)
    ),
    'voting_available', (
      (c.status = 'live'
       and (c.starts_at is null or now() >= c.starts_at)
       and (c.ends_at is null or now() < c.ends_at))
      or private.mde_application_phase() = 'development'
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
    'application_phase', private.mde_application_phase(),
    'audience_accepted', count(*) filter (where v.source = 'audience' and v.fraud_status = 'clean'),
    'audience_pending',  count(*) filter (where v.source = 'audience' and v.fraud_status in ('pending', 'suspicious')),
    'audience_total',    count(*) filter (where v.source = 'audience' and v.fraud_status <> 'blocked'),
    'development_test_total', count(*) filter (where v.source = 'audience' and v.fraud_status <> 'blocked')
  )
  from vote.votes v
  where v.entity_id = p_entity_id;
$$;

-- ── 6. Launch tally excludes development-test ballots ─────────────────────────
-- vote.trigger_recompute_on_vote fires on every vote insert and recounts all audience
-- votes, so development test ballots would otherwise leak into vote.entity_tally.
-- Provenance (development_test) keeps them out of that projection while public.vote_tally
-- still reports them via development_test_total. Their pending status is preserved.
create or replace function vote.recompute_entity_tally(p_entity_id uuid)
returns void
language plpgsql
security definer
set search_path = 'vote', 'public'
as $function$
DECLARE
  v_contest_id      uuid;
  v_formula         jsonb;
  v_w_audience      numeric;
  v_w_judges        numeric;
  v_audience_votes  bigint;
  v_paid_votes      bigint;
  v_max_audience    bigint;
  v_audience_norm   numeric;
  v_judge_norm      numeric;
  v_weighted        numeric;
  v_trend_24h       numeric;
BEGIN
  SELECT e.contest_id, c.scoring_formula
  INTO v_contest_id, v_formula
  FROM vote.entities e
  JOIN vote.contests c ON c.id = e.contest_id
  WHERE e.id = p_entity_id;

  IF v_contest_id IS NULL THEN RETURN; END IF;

  v_w_audience := COALESCE((v_formula->>'audience')::numeric, 0.5);
  v_w_judges   := COALESCE((v_formula->>'judges')::numeric, 0.3);

  SELECT
    COUNT(*) FILTER (WHERE source = 'audience' AND fraud_status <> 'blocked' AND NOT development_test),
    COUNT(*) FILTER (WHERE source = 'paid')
  INTO v_audience_votes, v_paid_votes
  FROM vote.votes
  WHERE entity_id = p_entity_id;

  -- GREATEST(...,1) keeps the normalizer safe when development ballots are the only votes.
  SELECT GREATEST(COALESCE(MAX(sub.cnt), 0), 1)
  INTO v_max_audience
  FROM (
    SELECT COUNT(*) FILTER (WHERE source = 'audience' AND fraud_status <> 'blocked' AND NOT development_test) AS cnt
    FROM vote.votes
    WHERE contest_id = v_contest_id
    GROUP BY entity_id
  ) sub;

  v_audience_norm := v_audience_votes::numeric / v_max_audience::numeric;

  SELECT COALESCE(
    SUM(js.score * sc.weight_pct::numeric / 100.0)
    / NULLIF(SUM(sc.weight_pct::numeric / 100.0 * sc.max_score::numeric), 0),
    0
  )
  INTO v_judge_norm
  FROM vote.judge_scores js
  JOIN vote.scoring_criteria sc ON sc.id = js.criterion_id
  WHERE js.entity_id = p_entity_id;

  v_weighted := (v_audience_norm * v_w_audience) + (v_judge_norm * v_w_judges);

  SELECT COUNT(*) FILTER (
    WHERE source = 'audience'
      AND fraud_status <> 'blocked'
      AND NOT development_test
      AND created_at >= NOW() - interval '24 hours'
  )
  INTO v_trend_24h
  FROM vote.votes
  WHERE entity_id = p_entity_id;

  INSERT INTO vote.entity_tally (
    entity_id, contest_id,
    audience_votes, paid_votes,
    judge_score, weighted_total, trend_24h,
    updated_at
  ) VALUES (
    p_entity_id, v_contest_id,
    v_audience_votes, v_paid_votes,
    v_judge_norm, v_weighted, v_trend_24h,
    NOW()
  )
  ON CONFLICT (entity_id) DO UPDATE SET
    audience_votes = EXCLUDED.audience_votes,
    paid_votes     = EXCLUDED.paid_votes,
    judge_score    = EXCLUDED.judge_score,
    weighted_total = EXCLUDED.weighted_total,
    trend_24h      = EXCLUDED.trend_24h,
    updated_at     = NOW();

  WITH ranked AS (
    SELECT entity_id,
           DENSE_RANK() OVER (ORDER BY weighted_total DESC) AS rnk
    FROM vote.entity_tally
    WHERE contest_id = v_contest_id
  )
  UPDATE vote.entity_tally et
  SET rank = r.rnk
  FROM ranked r
  WHERE et.entity_id = r.entity_id
    AND et.contest_id = v_contest_id;
END;
$function$;

-- ── 7. Grants unchanged: vote.* stays private, backend-only RPCs ──────────────
revoke all on function public.cast_restaurant_vote(uuid, uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.cast_restaurant_vote(uuid, uuid, uuid, text, text, text, text, text)
  to service_role;
revoke all on function public.vote_contest_context(uuid) from public, anon, authenticated;
grant execute on function public.vote_contest_context(uuid) to service_role;
revoke all on function public.vote_tally(uuid) from public, anon, authenticated;
grant execute on function public.vote_tally(uuid) to service_role;
