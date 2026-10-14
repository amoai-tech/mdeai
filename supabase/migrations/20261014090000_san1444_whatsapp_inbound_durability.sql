-- SAN-1444 · P0 durable WhatsApp inbound processing (v2 — claim ownership + fencing)
--
-- WHAT WAS WRONG IN v1
--  1. complete/fail updated by message id only, so a worker whose lease had expired could
--     overwrite a newer worker's claim.
--  2. the lease-reclaim path did not check the attempt ceiling, so repeated crashes retried
--     forever.
--  3. no dead-letter transition for exhausted work.
--
-- FIXES: a per-claim token (fencing), ownership predicates on complete/fail that return the
-- affected row count, an attempt ceiling on every claim path, and a dead-letter function.

alter table public.whatsapp_messages
  add column if not exists processing_status text not null default 'pending',
  add column if not exists attempts integer not null default 0,
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_by text,
  add column if not exists claim_token uuid,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists processed_at timestamptz,
  add column if not exists last_error text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'whatsapp_messages_processing_status_check') then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_processing_status_check
      check (processing_status in ('pending', 'processing', 'processed', 'failed', 'dead'));
  end if;
end $$;

create index if not exists idx_whatsapp_messages_inbound_due
  on public.whatsapp_messages (processing_status, next_attempt_at)
  where direction = 'inbound';

-- Durably record one inbound message. Idempotent on the existing external_id index.
create or replace function public.whatsapp_record_inbound(
  p_external_id text,
  p_from_e164 text,
  p_message_type text,
  p_content text,
  p_payload jsonb
) returns table (message_id uuid, is_new boolean)
language plpgsql security definer set search_path to ''
as $fn$
declare v_id uuid;
begin
  insert into public.whatsapp_messages as m (
    phone_number, direction, message_type, content, sender,
    external_id, status, raw_payload, processing_status
  ) values (
    p_from_e164, 'inbound', coalesce(p_message_type, 'text'), coalesce(p_content, ''), 'user',
    p_external_id, 'pending', p_payload, 'pending'
  )
  on conflict (external_id) where external_id is not null do nothing
  returning m.id into v_id;

  if v_id is null then
    select m.id into v_id from public.whatsapp_messages m where m.external_id = p_external_id;
    return query select v_id, false;
    return;  -- RETURN QUERY appends a row; without RETURN the true branch below adds a second row
  end if;
  return query select v_id, true;
end $fn$;

-- Claim due work. Sets a fresh claim_token so only this claim can complete or fail the row.
-- The attempt ceiling applies to every path, including lease expiry, so crashed workers
-- cannot retry forever.
create or replace function public.whatsapp_claim_inbound(
  p_worker text,
  p_limit integer default 5,
  p_lease_seconds integer default 180,
  p_max_attempts integer default 5
) returns setof public.whatsapp_messages
language sql security definer set search_path to ''
as $fn$
  with candidate as (
    select m.id
    from public.whatsapp_messages m
    where m.direction = 'inbound'
      and m.attempts < p_max_attempts
      and (
        (m.processing_status in ('pending', 'failed') and m.next_attempt_at <= now())
        or (m.processing_status = 'processing' and m.claimed_at < now() - make_interval(secs => p_lease_seconds))
      )
    order by m.next_attempt_at asc
    limit p_limit
    for update skip locked
  )
  update public.whatsapp_messages m
  set processing_status = 'processing',
      claimed_at = now(),
      claimed_by = p_worker,
      claim_token = gen_random_uuid(),
      attempts = m.attempts + 1
  from candidate c
  where m.id = c.id
  returning m.*;
$fn$;

-- Move exhausted, unowned or lease-expired work to a diagnosable terminal state.
create or replace function public.whatsapp_dead_letter_inbound(
  p_max_attempts integer default 5,
  p_lease_seconds integer default 180
) returns integer
language sql security definer set search_path to ''
as $fn$
  with dead as (
    update public.whatsapp_messages
    set processing_status = 'dead',
        last_error = coalesce(last_error, 'max attempts reached'),
        claimed_at = null,
        claimed_by = null,
        claim_token = null
    where direction = 'inbound'
      and attempts >= p_max_attempts
      and processing_status in ('pending', 'failed', 'processing')
      and (processing_status <> 'processing' or claimed_at < now() - make_interval(secs => p_lease_seconds))
    returning id
  )
  select count(*)::integer from dead;
$fn$;

-- Complete ONLY the row owned by this claim. Returns the number of rows updated: 0 means the
-- claim was fenced out (another worker owns it) and the caller must NOT treat it as success.
create or replace function public.whatsapp_complete_inbound(
  p_message_id uuid,
  p_claim_token uuid
) returns integer
language sql security definer set search_path to ''
as $fn$
  with done as (
    update public.whatsapp_messages
    set processing_status = 'processed',
        processed_at = now(),
        claimed_at = null,
        claimed_by = null,
        claim_token = null,
        last_error = null
    where id = p_message_id
      and processing_status = 'processing'
      and claim_token = p_claim_token
    returning id
  )
  select count(*)::integer from done;
$fn$;

-- Fail ONLY the row owned by this claim, with bounded backoff, dead after p_max_attempts.
create or replace function public.whatsapp_fail_inbound(
  p_message_id uuid,
  p_claim_token uuid,
  p_error text,
  p_max_attempts integer default 5,
  p_base_backoff_seconds integer default 30
) returns integer
language sql security definer set search_path to ''
as $fn$
  with failed as (
    update public.whatsapp_messages
    set processing_status = case when attempts >= p_max_attempts then 'dead' else 'failed' end,
        last_error = left(coalesce(p_error, 'unknown'), 500),
        next_attempt_at = now() + make_interval(secs => least(p_base_backoff_seconds * greatest(attempts, 1), 3600)),
        claimed_at = null,
        claimed_by = null,
        claim_token = null
    where id = p_message_id
      and processing_status = 'processing'
      and claim_token = p_claim_token
    returning id
  )
  select count(*)::integer from failed;
$fn$;

revoke all on function public.whatsapp_record_inbound(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.whatsapp_claim_inbound(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.whatsapp_dead_letter_inbound(integer, integer) from public, anon, authenticated;
revoke all on function public.whatsapp_complete_inbound(uuid, uuid) from public, anon, authenticated;
revoke all on function public.whatsapp_fail_inbound(uuid, uuid, text, integer, integer) from public, anon, authenticated;

grant execute on function public.whatsapp_record_inbound(text, text, text, text, jsonb) to service_role;
grant execute on function public.whatsapp_claim_inbound(text, integer, integer, integer) to service_role;
grant execute on function public.whatsapp_dead_letter_inbound(integer, integer) to service_role;
grant execute on function public.whatsapp_complete_inbound(uuid, uuid) to service_role;
grant execute on function public.whatsapp_fail_inbound(uuid, uuid, text, integer, integer) to service_role;
