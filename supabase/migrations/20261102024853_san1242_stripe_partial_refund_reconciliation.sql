-- SAN-1242: refund amounts must match Stripe. A partial refund is not automatically an admission cancellation.
-- Replace existing canonical refund_v2; no additional payment engine.
create or replace function public.ticket_payment_refund_v2(
  p_order_id uuid, p_amount_cents bigint, p_reason text,
  p_stripe_refund_id text, p_initiated_by uuid, p_initiated_via text,
  p_attendee_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  v_order public.event_orders%rowtype;
  v_existing public.event_order_refunds%rowtype;
  v_refund_id uuid;
  v_total_refunded bigint;
  v_revoked integer := 0;
  v_expected integer := 0;
begin
  select * into v_order from public.event_orders
    where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if p_stripe_refund_id is null or p_stripe_refund_id !~ '^re_[A-Za-z0-9]+$' then
    raise exception 'INVALID_STRIPE_REFUND_ID';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or
      v_order.total_cents is null or v_order.total_cents <= 0 then
    raise exception 'INVALID_REFUND_AMOUNT';
  end if;
  select * into v_existing from public.event_order_refunds
    where stripe_refund_id = p_stripe_refund_id;
  if found then
    if v_existing.order_id is distinct from p_order_id or
        v_existing.amount_cents is distinct from p_amount_cents or
        v_existing.status <> 'completed' then
      raise exception 'STRIPE_REFUND_ID_CONFLICT';
    end if;
    return v_existing.id;
  end if;
  if v_order.status not in ('paid', 'partial_refund') then
    raise exception 'ORDER_NOT_REFUNDABLE: %', v_order.status;
  end if;
  select coalesce(sum(amount_cents), 0) into v_total_refunded
    from public.event_order_refunds
    where order_id = p_order_id and status = 'completed';
  if v_total_refunded + p_amount_cents > v_order.total_cents then
    raise exception 'REFUND_EXCEEDS_ORDER_TOTAL';
  end if;
  if p_attendee_ids is not null then
    v_expected := cardinality(p_attendee_ids);
    if v_expected <> (select count(distinct selected.id)
      from unnest(p_attendee_ids) as selected(id)) then
      raise exception 'DUPLICATE_REFUND_ATTENDEE';
    end if;
    if exists (select 1 from unnest(p_attendee_ids) as selected(id)
      where not exists (
        select 1 from public.event_attendees a
        where a.id = selected.id and a.order_id = p_order_id
          and a.status = 'active')) then
      raise exception 'REFUND_ATTENDEE_NOT_ACTIVE_OR_FOREIGN';
    end if;
  end if;
  insert into public.event_order_refunds
    (order_id, amount_cents, currency, reason, initiated_by,
     initiated_via, stripe_refund_id, attendee_ids, status, completed_at)
  values
    (p_order_id, p_amount_cents, v_order.currency, p_reason, p_initiated_by,
     p_initiated_via, p_stripe_refund_id, p_attendee_ids, 'completed', now())
  returning id into v_refund_id;
  v_total_refunded := v_total_refunded + p_amount_cents;
  update public.event_orders set status =
    case when v_total_refunded = v_order.total_cents then
      'refunded' else 'partial_refund' end
  where id = p_order_id;
  -- An amount-only partial refund does not revoke tickets.
  if p_attendee_ids is not null then
    with changed as (
      update public.event_attendees
         set status = 'refunded'
       where order_id = p_order_id and id = any(p_attendee_ids)
         and status = 'active'
      returning id
    ) select count(*) into v_revoked from changed;
    if v_revoked <> v_expected then
      raise exception 'REFUND_ATTENDEE_UPDATE_RACE';
    end if;
  elsif v_total_refunded = v_order.total_cents then
    with changed as (
      update public.event_attendees
         set status = 'refunded'
       where order_id = p_order_id and status = 'active'
      returning id
    ) select count(*) into v_revoked from changed;
  end if;
  if v_revoked > 0 then
    update public.event_tickets
       set qty_sold = greatest(0, qty_sold - v_revoked)
     where id = v_order.ticket_id;
  end if;
  return v_refund_id;
end;
$function$;

revoke all on function public.ticket_payment_refund_v2(
  uuid, bigint, text, text, uuid, text, uuid[]
) from public, anon, authenticated;
grant execute on function public.ticket_payment_refund_v2(
  uuid, bigint, text, text, uuid, text, uuid[]
) to service_role;
