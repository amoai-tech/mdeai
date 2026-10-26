-- SAN-984: combine the existing ticket consumer and check-in auditor in one
-- PostgreSQL transaction. Failure to record the audit rolls back consumption.
-- Existing callers of ticket_validate_consume(text) remain unchanged.
begin;

create or replace function public.ticket_validate_consume_audited(
  p_event_id uuid,
  p_qr_token text,
  p_scanned_by uuid,
  p_scanner_device text,
  p_ip_address inet
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attendee_id uuid;
  v_ticket_event_id uuid;
  v_outcome jsonb;
  v_status text;
begin
  if p_event_id is null or p_scanned_by is null
    or nullif(btrim(p_qr_token), '') is null then
    raise exception 'event, scanned_by, and QR required' using errcode = '22023';
  end if;

  -- Wrong-event and unknown QR scans are audited against the target event,
  -- without cross-linking an attendee from a different organizer.
  select a.id, a.event_id into v_attendee_id, v_ticket_event_id
  from public.event_attendees a where a.qr_token = p_qr_token;

  if v_attendee_id is null then
    v_outcome := jsonb_build_object('result', 'unknown_token');
  elsif v_ticket_event_id <> p_event_id then
    v_attendee_id := null;
    v_outcome := jsonb_build_object('result', 'wrong_event');
  else
    -- Canonical logic retains its payment, event expiry and once-only checks.
    v_outcome := public.ticket_validate_consume(p_qr_token);
  end if;

  v_status := v_outcome->>'result';
  if v_status is null then
    raise exception 'ticket consumer returned an outcome without a result'
      using errcode = 'P0001';
  end if;

  -- This call shares the same transaction as the ticket UPDATE.
  perform public.record_check_in(
    p_event_id, v_attendee_id, p_qr_token, p_scanned_by,
    p_scanner_device, p_ip_address, v_status,
    coalesce(v_outcome->'details', '{}'::jsonb)
  );
  return v_outcome;
end;
$function$;

-- Only the server's trusted service client may invoke this privileged wrapper.
-- The public/anon/authenticated grant is intentionally absent.
revoke all on function public.ticket_validate_consume_audited(uuid, text, uuid, text, inet)
  from public, anon, authenticated;
grant execute on function public.ticket_validate_consume_audited(uuid, text, uuid, text, inet)
  to service_role;
commit;
