-- SAN-1597: Persist server-calculated paid ticket subtotal (minor units).
-- Keep the existing 7-argument canonical reservation RPC and seat locking.
-- The UNIQUE access_token constraint already makes same-key HMAC retries atomic.
-- Historical paid orders are not rewritten or misrepresented.
create or replace function public.ticket_checkout_create_pending(
  p_event_id uuid,
  p_ticket_id uuid,
  p_quantity integer,
  p_buyer_email text,
  p_buyer_name text,
  p_access_token text,
  p_attendees jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ticket   public.event_tickets%rowtype;
  v_event    public.events%rowtype;
  v_order_id uuid;
  v_short_id text;
  v_attendee jsonb;
begin
  perform pg_advisory_xact_lock(hashtext(p_event_id::text));

  if jsonb_array_length(p_attendees) <> p_quantity then
    raise exception 'ATTENDEES_QUANTITY_MISMATCH: expected %, got %',
      p_quantity, jsonb_array_length(p_attendees);
  end if;

  select * into v_ticket from public.event_tickets where id = p_ticket_id for update;
  if not found or not v_ticket.is_active then raise exception 'TICKET_INACTIVE'; end if;
  if v_ticket.event_id <> p_event_id then raise exception 'TICKET_INACTIVE'; end if;
  if v_ticket.qty_sold + v_ticket.qty_pending + p_quantity > v_ticket.qty_total then
    raise exception 'OUT_OF_STOCK';
  end if;
  if p_quantity < v_ticket.min_per_order or p_quantity > v_ticket.max_per_order then
    raise exception 'QUANTITY_OUT_OF_RANGE: min=% max=%', v_ticket.min_per_order, v_ticket.max_per_order;
  end if;

  select * into v_event from public.events where id = p_event_id;
  if v_event.status not in ('published','live') then raise exception 'EVENT_NOT_PUBLISHED'; end if;

  if v_ticket.sale_starts_at is not null and v_ticket.sale_starts_at > now() then
    raise exception 'TICKET_SALE_NOT_STARTED';
  end if;
  if v_ticket.sale_ends_at is not null and v_ticket.sale_ends_at < now() then
    raise exception 'TICKET_SALE_ENDED';
  end if;

  -- Checkout only charges a positive COP ticket; zero-priced tickets need
  -- a separate no-payment issuance path, not a fabricated paid Stripe order.
  if lower(coalesce(v_ticket.currency, '')) <> 'cop' or v_ticket.price_cents <= 0 then
    raise exception 'INVALID_TICKET_PRICE_OR_CURRENCY';
  end if;

  v_short_id := 'MDE-' || upper(substr(
    md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 10));

  update public.event_tickets
     set qty_pending = qty_pending + p_quantity
   where id = p_ticket_id;

  -- bigint cast keeps the Stripe minor-unit total exact for high-price tickets.
  insert into public.event_orders
    (event_id, ticket_id, quantity, buyer_email, buyer_name, subtotal_cents, total_cents, currency, status, short_id, access_token)
  values
    (p_event_id, p_ticket_id, p_quantity, p_buyer_email, p_buyer_name,
     v_ticket.price_cents::bigint * p_quantity,
     v_ticket.price_cents::bigint * p_quantity, v_ticket.currency, 'pending', v_short_id, p_access_token)
  returning id into v_order_id;

  for v_attendee in select * from jsonb_array_elements(p_attendees) loop
    insert into public.event_attendees
      (id, order_id, ticket_id, event_id, email, full_name, qr_token, status)
    values
      ((v_attendee->>'id')::uuid, v_order_id, p_ticket_id, p_event_id,
       v_attendee->>'email', v_attendee->>'full_name', v_attendee->>'qr_token', 'pending');
  end loop;

  return jsonb_build_object(
    'order_id',    v_order_id,
    'short_id',    v_short_id,
    'price_cents', v_ticket.price_cents,
    'ticket_name', v_ticket.name,
    'event_name',  v_event.name
  );
end;
$function$;
revoke execute on function public.ticket_checkout_create_pending(
  uuid, uuid, integer, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.ticket_checkout_create_pending(
  uuid, uuid, integer, text, text, text, jsonb
) to service_role;
