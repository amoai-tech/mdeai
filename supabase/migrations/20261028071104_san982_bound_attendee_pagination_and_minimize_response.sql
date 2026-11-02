-- SAN-982 follow-up: bound attendee RPC pagination and omit an unused Stripe payment reference.
-- Preserves the merged caller-role security boundary and explicit EXECUTE grants.
-- SAN-982: only the actual PostgreSQL caller role may bypass organizer checks.
-- A forged request.jwt.claim.role must not expose attendee data.

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
    -- Never trust mutable JWT claim GUCs for the elevated service-role bypass.
    -- SECURITY DEFINER changes current_user, so test the caller's SET ROLE GUC.
    IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.events
     WHERE id = p_event_id AND organizer_id = v_caller
  ) THEN
    RAISE EXCEPTION 'NOT_ORGANIZER' USING ERRCODE = 'P0001';
  END IF;

  -- Validate RPC pagination at the database boundary, not only in Next.js.
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100
     OR p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'INVALID_PAGINATION' USING ERRCODE = '22023';
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
              'order_short_id',        o.short_id
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
