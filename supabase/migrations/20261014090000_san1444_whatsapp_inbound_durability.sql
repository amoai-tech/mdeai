-- SAN-1444 · P0 durable WhatsApp inbound processing
--
-- WHAT THIS ADDS
-- The webhook previously acknowledged Meta before recording recoverable work, so a crash
-- could lose a customer message, and a provider retry could start the concierge twice.
-- This adds the minimum processing state to the EXISTING whatsapp_messages table (no new
-- messages table) plus SECURITY DEFINER RPCs that record, claim, complete and fail inbound
-- work atomically.
--
-- DEDUPLICATION reuses the existing partial unique index uq_whatsapp_messages_external_id.
-- CLAIMING uses FOR UPDATE SKIP LOCKED plus a lease so two workers cannot take the same row.
-- RECOVERY re-selects 'processing' rows whose lease expired, and 'failed' rows past backoff.

alter table public.whatsapp_messages
  add column if not exists processing_status text not null default 'pending',
  add column if not exists attempts integer not null default 0,
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_by text,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists processed_at timestamptz,
  add column if not exists last_error text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'whatsapp_messages_processing_status_check'
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_processing_status_check
      check (processing_status in ('pending', 'processing', 'processed', 'failed', 'dead'));
  end if;
end $$;

create index if not exists idx_whatsapp_messages_inbound_due
  on public.whatsapp_messages (processing_status, next_attempt_at)
  where direction = 'inbound';

-- Record one inbound message durably. Idempotent on external_id: a duplicate delivery returns
-- the existing row with is_new = false and must not start a second concierge run.
create or replace function public.whatsapp_record_inbound(
  p_external_id text,
  p_from_e164 text,
  p_message_type text,
  p_content text,
  p_payload jsonb
) returns table (message_id uuid, is_new boolean)
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_id uuid;
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
  end if;
  return query select v_id, true;
end
$fn$;

-- Atomically claim due inbound work. Lease expiry recovers crashed workers.
create or replace function public.whatsapp_claim_inbound(
  p_worker text,
  p_limit integer default 5,
  p_lease_seconds integer default 120
) returns setof public.whatsapp_messages
language sql
security definer
set search_path to ''
as $fn$
  with claimed as (
    select m.id
    from public.whatsapp_messages m
    where m.direction = 'inbound'
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
      attempts = m.attempts + 1
  from claimed
  where m.id = claimed.id
  returning m.*;
$fn$;

-- Mark a claimed message processed.
create or replace function public.whatsapp_complete_inbound(
  p_message_id uuid
) returns void
language sql
security definer
set search_path to ''
as $fn$
  update public.whatsapp_messages
  set processing_status = 'processed',
      processed_at = now(),
      claimed_at = null,
      claimed_by = null,
      last_error = null
  where id = p_message_id;
$fn$;

-- Record a failure. Bounded exponential backoff; 'dead' after p_max_attempts.
create or replace function public.whatsapp_fail_inbound(
  p_message_id uuid,
  p_error text,
  p_max_attempts integer default 5,
  p_base_backoff_seconds integer default 30
) returns void
language sql
security definer
set search_path to ''
as $fn$
  update public.whatsapp_messages
  set processing_status = case when attempts >= p_max_attempts then 'dead' else 'failed' end,
      last_error = left(coalesce(p_error, 'unknown'), 500),
      next_attempt_at = now() + make_interval(
        secs => least(p_base_backoff_seconds * greatest(attempts, 1), 3600)
      ),
      claimed_at = null,
      claimed_by = null
  where id = p_message_id;
$fn$;

-- These are service-role-only entry points; no anon/authenticated caller may reach them.
revoke all on function public.whatsapp_record_inbound(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.whatsapp_claim_inbound(text, integer, integer) from public, anon, authenticated;
revoke all on function public.whatsapp_complete_inbound(uuid) from public, anon, authenticated;
revoke all on function public.whatsapp_fail_inbound(uuid, text, integer, integer) from public, anon, authenticated;

grant execute on function public.whatsapp_record_inbound(text, text, text, text, jsonb) to service_role;
grant execute on function public.whatsapp_claim_inbound(text, integer, integer) to service_role;
grant execute on function public.whatsapp_complete_inbound(uuid) to service_role;
grant execute on function public.whatsapp_fail_inbound(uuid, text, integer, integer) to service_role;
