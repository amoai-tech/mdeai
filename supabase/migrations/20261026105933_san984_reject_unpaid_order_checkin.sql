-- SAN-984: reject check-in after a paid order changes to refunded,
-- cancelled or pending even if the attendee row has not yet synchronized.
-- Reuse the canonical once-only ticket consumer and preserve service-only RPC access.
begin;

CREATE OR REPLACE FUNCTION public.ticket_validate_consume(p_qr_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_attendee public.event_attendees%ROWTYPE;
  v_ticket   public.event_tickets%ROWTYPE;
  v_event    public.events%ROWTYPE;
  v_now      timestamptz := now();
  v_order_status text;
BEGIN
  -- 1. Look up attendee by qr_token (UNIQUE; O(1))
  SELECT * INTO v_attendee FROM public.event_attendees WHERE qr_token = p_qr_token;
  IF NOT FOUND THEN
    -- Distinguish UNKNOWN_TOKEN (no row) from INVALID_SIGNATURE (caller pre-checked sig)
    RETURN jsonb_build_object('result', 'unknown_token');
  END IF;

  -- 2. Status checks (no DB write yet)
  IF v_attendee.status = 'pending'   THEN RETURN jsonb_build_object('result', 'pending_payment'); END IF;
  IF v_attendee.status = 'refunded'  THEN
    RETURN jsonb_build_object('result', 'refunded',
      'details', jsonb_build_object('attendee_name', v_attendee.full_name));
  END IF;
  IF v_attendee.status = 'cancelled' THEN RETURN jsonb_build_object('result', 'cancelled'); END IF;

  -- The paid order is authoritative even when attendee state lags a refund.
  -- A partial refund can leave valid active attendees; the attendee status
  -- above determines which individual tickets were actually cancelled.
  SELECT status INTO v_order_status FROM public.event_orders WHERE id = v_attendee.order_id;
  IF v_order_status IS DISTINCT FROM 'paid'
     AND v_order_status IS DISTINCT FROM 'partial_refund' THEN
    RETURN jsonb_build_object('result',
      CASE v_order_status
        WHEN 'refunded' THEN 'refunded'
        WHEN 'cancelled' THEN 'cancelled'
        ELSE 'pending_payment'
      END);
  END IF;

  IF v_attendee.qr_used_at IS NOT NULL THEN
    RETURN jsonb_build_object('result', 'already_used', 'details', jsonb_build_object(
      'used_at',       v_attendee.qr_used_at,
      'attendee_name', v_attendee.full_name
    ));
  END IF;

  -- 3. Event sanity
  SELECT * INTO v_event FROM public.events WHERE id = v_attendee.event_id;
  IF v_event.event_end_time IS NOT NULL AND v_event.event_end_time < v_now THEN
    RETURN jsonb_build_object('result', 'event_ended');
  END IF;

  -- 4. Atomic consume — race-safe (returns 0 rows if another concurrent scan won)
  UPDATE public.event_attendees
     SET qr_used_at = v_now
   WHERE id = v_attendee.id AND qr_used_at IS NULL
   RETURNING qr_used_at INTO v_attendee.qr_used_at;

  IF NOT FOUND THEN
    -- Race lost — read the winner's timestamp
    SELECT qr_used_at INTO v_attendee.qr_used_at
      FROM public.event_attendees WHERE id = v_attendee.id;
    RETURN jsonb_build_object('result', 'already_used', 'details', jsonb_build_object(
      'used_at',       v_attendee.qr_used_at,
      'attendee_name', v_attendee.full_name
    ));
  END IF;

  SELECT * INTO v_ticket FROM public.event_tickets WHERE id = v_attendee.ticket_id;

  RETURN jsonb_build_object('result', 'consumed', 'details', jsonb_build_object(
    'attendee_name', v_attendee.full_name,
    'ticket_tier',   v_ticket.name,
    'short_id',      (SELECT short_id FROM public.event_orders WHERE id = v_attendee.order_id)
  ));
END;
$function$;

revoke execute on function public.ticket_validate_consume(text) from public, anon, authenticated;
grant execute on function public.ticket_validate_consume(text) to service_role;
commit;
