-- SAN-1285 follow-up: make ticket money arithmetic safe in Stripe minor units.
--
-- The atomic publisher now stores `event_tickets.price_cents` in Stripe minor
-- units (whole COP × 100). Order totals, refunds and the checkout RPCs still used
-- 32-bit `integer`, so a normal high-price ticket (e.g. COP 3,000,000 × 10)
-- overflowed at checkout before any payment could start.
--
-- This migration widens the money columns and the arithmetic to bigint. It does
-- not rewrite historical rows: reconciling old whole-COP rows remains SAN-582.
--
-- Affected:
--   * event_tickets.price_cents
--   * event_orders.total_cents / subtotal_cents / tax_cents / fee_cents / discount_cents
--   * event_order_refunds.amount_cents
--   * compute_ticket_total, ticket_checkout_create_pending, ticket_payment_refund_v2

alter table public.event_tickets
  alter column price_cents type bigint;

alter table public.event_orders
  alter column total_cents type bigint,
  alter column subtotal_cents type bigint,
  alter column tax_cents type bigint,
  alter column fee_cents type bigint,
  alter column discount_cents type bigint;

alter table public.event_order_refunds
  alter column amount_cents type bigint;

-- Signature changes (integer -> bigint), so drop the old function before
-- recreating it rather than leaving an integer overload behind.
drop function if exists public.compute_ticket_total(uuid, integer, integer);

create or replace function public.compute_ticket_total(
  p_ticket_id uuid,
  p_quantity integer,
  p_discount_cents bigint default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
declare
  v_ticket  public.event_tickets%rowtype;
  v_subtotal bigint;
  v_tax      bigint := 0;
  v_fee      bigint := 0;
  v_rule    public.event_taxes_and_fees%rowtype;
  v_amount   bigint;
begin
  select * into v_ticket from public.event_tickets where id = p_ticket_id;
  if not found then raise exception 'TICKET_NOT_FOUND'; end if;

  v_subtotal := greatest(
    0,
    (v_ticket.price_cents::bigint * p_quantity) - p_discount_cents
  );

  for v_rule in
    select t.* from public.event_taxes_and_fees t
    join public.event_ticket_taxes_and_fees pivot on pivot.tax_fee_id = t.id
    where pivot.ticket_id = p_ticket_id and t.is_active
    order by t.display_order
  loop
    if v_rule.calculation_type = 'PERCENTAGE' then
      v_amount := round(v_subtotal * v_rule.rate / 100)::bigint;
    else
      v_amount := round(v_rule.rate * p_quantity)::bigint;
    end if;

    if v_rule.type = 'TAX' then
      v_tax := v_tax + v_amount;
    else
      v_fee := v_fee + v_amount;
    end if;
  end loop;

  return jsonb_build_object(
    'subtotal_cents', v_subtotal,
    'tax_cents',      v_tax,
    'fee_cents',      v_fee,
    'total_cents',    v_subtotal + v_tax + v_fee
  );
end;
$function$;

-- The original grant included PUBLIC/anon (ticket-checkout uses the anon path).
revoke all on function public.compute_ticket_total(uuid, integer, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.compute_ticket_total(uuid, integer, bigint)
  to anon, authenticated, service_role;

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
set search_path to 'public', 'pg_temp'
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

  v_short_id := 'MDE-' || upper(substr(
    md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 10));

  update public.event_tickets
     set qty_pending = qty_pending + p_quantity
   where id = p_ticket_id;

  -- bigint cast keeps the Stripe minor-unit total exact for high-price tickets.
  insert into public.event_orders
    (event_id, ticket_id, quantity, buyer_email, buyer_name, total_cents, currency, status, short_id, access_token)
  values
    (p_event_id, p_ticket_id, p_quantity, p_buyer_email, p_buyer_name,
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

-- Refund amounts scale with the widened order totals.
drop function if exists public.ticket_payment_refund_v2(
  uuid, integer, text, text, uuid, text, uuid[]
);

create or replace function public.ticket_payment_refund_v2(
  p_order_id uuid,
  p_amount_cents bigint,
  p_reason text,
  p_stripe_refund_id text,
  p_initiated_by uuid,
  p_initiated_via text,
  p_attendee_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_order public.event_orders%rowtype;
  v_refund_id uuid;
  v_total_refunded bigint;
begin
  select * into v_order from public.event_orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status not in ('paid','partial_refund') then
    raise exception 'ORDER_NOT_REFUNDABLE: %', v_order.status;
  end if;

  insert into public.event_order_refunds
    (order_id, amount_cents, currency, reason, initiated_by, initiated_via,
     stripe_refund_id, attendee_ids, status, completed_at)
  values
    (p_order_id, p_amount_cents, v_order.currency, p_reason, p_initiated_by,
     p_initiated_via, p_stripe_refund_id, p_attendee_ids, 'completed', now())
  returning id into v_refund_id;

  select coalesce(sum(amount_cents), 0) into v_total_refunded
  from public.event_order_refunds
  where order_id = p_order_id and status = 'completed';

  if v_total_refunded >= v_order.total_cents then
    update public.event_orders set status = 'refunded' where id = p_order_id;
  else
    update public.event_orders set status = 'partial_refund' where id = p_order_id;
  end if;

  if p_attendee_ids is null then
    update public.event_attendees
       set status = 'refunded'
     where order_id = p_order_id and status = 'active';
    update public.event_tickets
       set qty_sold = greatest(0, qty_sold - v_order.quantity)
     where id = v_order.ticket_id;
  else
    update public.event_attendees
       set status = 'refunded'
     where id = any(p_attendee_ids) and status = 'active';
    update public.event_tickets
       set qty_sold = greatest(0, qty_sold - array_length(p_attendee_ids, 1))
     where id = v_order.ticket_id;
  end if;

  return v_refund_id;
end;
$function$;

-- This surface was never public/anonymous.
revoke all on function public.ticket_payment_refund_v2(
  uuid, bigint, text, text, uuid, text, uuid[]
) from public, anon;
grant execute on function public.ticket_payment_refund_v2(
  uuid, bigint, text, text, uuid, text, uuid[]
) to authenticated, service_role;

comment on function public.compute_ticket_total(uuid, integer, bigint) is
  'SAN-1285: money in integer minor units; bigint arithmetic prevents high-price overflow.';
comment on function public.ticket_checkout_create_pending(uuid, uuid, integer, text, text, text, jsonb) is
  'SAN-1285: pending order total uses bigint minor-unit arithmetic.';
comment on function public.ticket_payment_refund_v2(uuid, bigint, text, text, uuid, text, uuid[]) is
  'SAN-1285: refund amounts are bigint minor units and reconcile against bigint order totals.';
