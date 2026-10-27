-- SAN-982 follow-up: reject missing organizer identity before reading attendee PII.
-- Retain stable paging, search, existing grants, and explicit service_role calls.
begin;

CREATE OR REPLACE FUNCTION public.event_attendees_paginated(p_event_id uuid, p_search text DEFAULT ''::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_caller uuid := auth.uid();
BEGIN
  -- Service-role calls are explicitly trusted; ordinary RPC callers must have
  -- a verified actor, even when PostgREST's authenticated DB role is selected.
  -- This claim comes from the JWT validated at the API boundary, not a form field.
  IF v_caller IS NULL THEN
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.events
     WHERE id = p_event_id AND organizer_id = v_caller
  ) THEN
    RAISE EXCEPTION 'NOT_ORGANIZER' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'total', (
      SELECT count(*)
        FROM public.event_attendees a
       WHERE a.event_id = p_event_id
         AND (
           p_search = ''
           OR lower(a.full_name) ILIKE '%' || lower(p_search) || '%'
           OR lower(a.email)     ILIKE '%' || lower(p_search) || '%'
         )
    ),
    'rows', COALESCE(
      (
        SELECT jsonb_agg(r)
          FROM (
            SELECT jsonb_build_object(
              'id',                    a.id,
              'full_name',             a.full_name,
              'email',                 a.email,
              'status',                a.status,
              'qr_used_at',            a.qr_used_at,
              'tier_name',             t.name,
              'purchase_time',         o.created_at,
              'order_short_id',        o.short_id,
              'stripe_payment_intent', o.stripe_payment_intent
            ) AS r
              FROM public.event_attendees a
              JOIN public.event_orders   o ON o.id = a.order_id
              JOIN public.event_tickets  t ON t.id = o.ticket_id
             WHERE a.event_id = p_event_id
               AND (
                 p_search = ''
                 OR lower(a.full_name) ILIKE '%' || lower(p_search) || '%'
                 OR lower(a.email)     ILIKE '%' || lower(p_search) || '%'
               )
             -- Attendees sharing one order timestamp require a stable tie-breaker.
             ORDER BY o.created_at DESC, a.id ASC
             LIMIT  p_limit
             OFFSET p_offset
          ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$function$;

-- Preserve explicit role grants on the security-definer RPC.
revoke execute on function public.event_attendees_paginated(uuid,text,integer,integer)
  from public, anon;
grant execute on function public.event_attendees_paginated(uuid,text,integer,integer)
  to authenticated, service_role;
commit;
