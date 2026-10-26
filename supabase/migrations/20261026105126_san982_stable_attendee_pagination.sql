-- SAN-982: stable organizer attendee paging, preserving existing RPC access.
begin;

CREATE OR REPLACE FUNCTION public.event_attendees_paginated(p_event_id uuid, p_search text DEFAULT ''::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.events
       WHERE id = p_event_id AND organizer_id = v_caller
    ) THEN
      RAISE EXCEPTION 'NOT_ORGANIZER' USING ERRCODE = 'P0001';
    END IF;
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
