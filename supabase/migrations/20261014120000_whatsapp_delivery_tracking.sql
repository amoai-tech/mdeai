-- SAN-1444 · Persist outbound WhatsApp sends and delivery status (PR 1)
--
-- Reuses public.whatsapp_messages: the outbound wamid lives in the existing unique external_id,
-- the status check constraint already allows pending/sent/delivered/read/failed, and the RLS
-- policies are service_role-only. New columns only link an outbound row to its inbound message.

alter table public.whatsapp_messages
  add column if not exists inbound_message_id uuid references public.whatsapp_messages(id) on delete set null,
  add column if not exists delivery_status_at timestamptz;

create index if not exists idx_whatsapp_messages_inbound_message_id
  on public.whatsapp_messages (inbound_message_id) where inbound_message_id is not null;
create index if not exists idx_whatsapp_messages_outbound_status
  on public.whatsapp_messages (status) where direction = 'outbound';

-- Monotonic status ordering so a late/duplicate callback can never regress read -> delivered.
create or replace function public.whatsapp_status_rank(p_status text)
returns integer language sql immutable set search_path to ''
as $fn$
  select case p_status
    when 'pending' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4
    else -1 end;
$fn$;

-- Record the confirmed outbound sends AND complete the inbound claim in one transaction.
-- Fenced on claim_token: a stale worker records nothing and completes nothing. Returns the
-- number of sends recorded (0 => the caller must NOT treat the message as answered).
create or replace function public.whatsapp_complete_inbound_with_sends(
  p_message_id uuid,
  p_claim_token uuid,
  p_sends jsonb
) returns integer
language plpgsql security definer set search_path to ''
as $fn$
declare
  v_inbound public.whatsapp_messages;
  v_send jsonb;
  v_wamid text;
  v_count integer := 0;
begin
  select * into v_inbound from public.whatsapp_messages
   where id = p_message_id and processing_status = 'processing' and claim_token = p_claim_token
   for update;
  if not found then return 0; end if;
  if p_sends is null or jsonb_typeof(p_sends) <> 'array' or jsonb_array_length(p_sends) = 0 then
    return 0;
  end if;

  for v_send in select * from jsonb_array_elements(p_sends) loop
    v_wamid := nullif(btrim(coalesce(v_send->>'wamid', '')), '');
    continue when v_wamid is null;
    insert into public.whatsapp_messages
      (phone_number, direction, message_type, content, sender, external_id, status, to_number, inbound_message_id, delivery_status_at)
    values
      (v_inbound.phone_number, 'outbound', 'text', coalesce(v_send->>'content', ''), 'assistant', v_wamid, 'sent', v_inbound.phone_number, v_inbound.id, now())
    on conflict (external_id) where external_id is not null do update
      set inbound_message_id = coalesce(excluded.inbound_message_id, public.whatsapp_messages.inbound_message_id),
          content = case when public.whatsapp_messages.content = '' then excluded.content else public.whatsapp_messages.content end,
          phone_number = case when public.whatsapp_messages.phone_number = 'unknown' then excluded.phone_number else public.whatsapp_messages.phone_number end,
          status = case when public.whatsapp_status_rank(public.whatsapp_messages.status) >= public.whatsapp_status_rank('sent') then public.whatsapp_messages.status else 'sent' end,
          -- Keep an early receipt's ORIGINAL Meta timestamp; only fill it when we have none.
          delivery_status_at = coalesce(public.whatsapp_messages.delivery_status_at, excluded.delivery_status_at);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then return 0; end if;

  update public.whatsapp_messages
     set processing_status = 'processed', processed_at = now(), claimed_at = null, claimed_by = null, claim_token = null, last_error = null
   where id = v_inbound.id;
  return v_count;
end $fn$;

-- Persist a Meta delivery callback. Upserts by wamid, so an early callback (before the outbound
-- row exists) creates a placeholder that the send RPC later enriches. Never regresses status.
create or replace function public.whatsapp_record_delivery_status(
  p_external_id text,
  p_status text,
  p_status_at timestamptz,
  p_error text
) returns integer
language plpgsql security definer set search_path to ''
as $fn$
declare v_wamid text; v_rows integer := 0;
begin
  v_wamid := nullif(btrim(coalesce(p_external_id, '')), '');
  if v_wamid is null then return 0; end if;
  if public.whatsapp_status_rank(p_status) < 0 then return 0; end if;

  insert into public.whatsapp_messages
    (phone_number, direction, message_type, content, sender, external_id, status, delivery_status_at, last_error)
  values
    ('unknown', 'outbound', 'text', '', 'assistant', v_wamid, p_status, coalesce(p_status_at, now()), p_error)
  on conflict (external_id) where external_id is not null do update
    set status = case
          when public.whatsapp_messages.status = 'failed' then 'failed'
          when excluded.status = 'failed' then 'failed'
          when public.whatsapp_status_rank(excluded.status) > public.whatsapp_status_rank(public.whatsapp_messages.status) then excluded.status
          else public.whatsapp_messages.status end,
        delivery_status_at = case
          when public.whatsapp_status_rank(excluded.status) > public.whatsapp_status_rank(public.whatsapp_messages.status) then excluded.delivery_status_at
          else public.whatsapp_messages.delivery_status_at end,
        last_error = coalesce(excluded.last_error, public.whatsapp_messages.last_error)
    where public.whatsapp_messages.direction = 'outbound';
  get diagnostics v_rows = row_count;
  return v_rows;
end $fn$;

revoke all on function public.whatsapp_status_rank(text) from public, anon, authenticated;
revoke all on function public.whatsapp_complete_inbound_with_sends(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.whatsapp_record_delivery_status(text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.whatsapp_status_rank(text) to service_role;
grant execute on function public.whatsapp_complete_inbound_with_sends(uuid, uuid, jsonb) to service_role;
grant execute on function public.whatsapp_record_delivery_status(text, text, timestamptz, text) to service_role;
