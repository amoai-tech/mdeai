-- SAN-1285: one authenticated, repeatable host-event publish transaction.
-- Phase A development: no business approval/verification prerequisite.
-- Depends on SAN-1548 approval_requests.proposal_id unique partial index.
-- SAN-1548 migration 20261021030000 owns events.approval_request_id + uniqueness.
create or replace function public.publish_event_tx(
  p_proposal_id text,
  p_draft jsonb,
  p_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request_id uuid;
  v_existing public.approval_requests%rowtype;
  v_new_count integer;
  v_event_id uuid;
  v_slug text;
  v_tiers jsonb;
  v_capacity integer;
  v_price_min integer;
  v_price_max integer;
  v_total_tier_qty integer;
  v_host_name text;
  v_host_avatar text;
  v_receipt jsonb;
  v_decision text;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if p_proposal_id is null or length(p_proposal_id) > 80
    or p_proposal_id !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'INVALID_PROPOSAL_ID' using errcode = '22023';
  end if;
  if p_draft is null or jsonb_typeof(p_draft) <> 'object'
    or nullif(trim(p_draft->>'title'), '') is null
    or nullif(trim(p_draft->>'dateIso'), '') is null
    or p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'INVALID_EVENT_DRAFT' using errcode = '22023';
  end if;

  v_tiers := coalesce(p_draft->'ticketTiers', '[]'::jsonb);
  if jsonb_typeof(v_tiers) <> 'array' or jsonb_array_length(v_tiers) > 100 then
    raise exception 'INVALID_TICKET_TIERS' using errcode = '22023';
  end if;

  -- Use the existing SAN-1548 unique key to synchronize parallel requests.
  -- DO NOTHING waits on a competing uncommitted insert. The later SELECT
  -- sees the winning committed row and its durable receipt.
  insert into public.approval_requests (
    agent, action_type, subject, payload, risk_level,
    requested_by, proposal_id
  )
  values (
    'hostEventAgent', 'publish_event', p_draft->>'title', p_draft,
    'medium', v_actor::text, p_proposal_id
  )
  on conflict (proposal_id) where proposal_id is not null do nothing;
  get diagnostics v_new_count = row_count;

  select * into v_existing
  from public.approval_requests
  where proposal_id = p_proposal_id
  for update;
  if not found then
    raise exception 'PROPOSAL_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_existing.requested_by <> v_actor::text
    or v_existing.action_type <> 'publish_event' then
    raise exception 'FOREIGN_PROPOSAL' using errcode = '42501';
  end if;
  if v_existing.payload is distinct from p_draft then
    raise exception 'DRAFT_CHANGED' using errcode = 'P0001';
  end if;
  v_request_id := v_existing.id;

  if v_new_count = 0 then
    -- Return only an existing, real event belonging to this caller. A malformed
    -- or missing receipt must not abort the transaction or block recovery.
    if v_existing.notes like 'MDE_RECEIPT:%' then
      begin
        v_receipt := substring(v_existing.notes from length('MDE_RECEIPT:') + 1)::jsonb;
      exception when others then
        v_receipt := null;
      end;
      if v_receipt is not null
         and (v_receipt ->> 'eventId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select id, slug into v_event_id, v_slug
        from public.events
        where id = (v_receipt->>'eventId')::uuid
          and organizer_id = v_actor;
        if found then
          return jsonb_build_object(
            'eventId', v_event_id, 'slug', v_slug,
            'proposalId', p_proposal_id, 'approvalRequestId', v_request_id
          );
        end if;
      end if;
    end if;

    -- Recovery: an event may already exist for this approval even if the receipt
    -- is missing (legacy/interrupted write). Return it and repair the receipt.
    select id, slug into v_event_id, v_slug
    from public.events
    where approval_request_id = v_request_id
      and organizer_id = v_actor;
    if found then
      v_receipt := jsonb_build_object(
        'eventId', v_event_id, 'slug', v_slug, 'proposalId', p_proposal_id
      );
      update public.approval_requests
      set notes = 'MDE_RECEIPT:' || v_receipt::text
      where id = v_request_id;
      return v_receipt || jsonb_build_object('approvalRequestId', v_request_id);
    end if;
  end if;

  -- A prior decision is honoured before any event write. "reject" and
  -- "request_changes" are conflicts; an already-approved or undecided proposal
  -- continues (recovery of a legacy approval that never wrote its event).
  select decision into v_decision
  from public.approval_decisions
  where request_id = v_request_id;
  if found then
    if v_decision <> 'approve' then
      raise exception 'DECISION_CONFLICT' using errcode = 'P0001';
    end if;
  else
    insert into public.approval_decisions (request_id, decision, decided_by)
    values (v_request_id, 'approve', v_actor);
  end if;

  if p_draft ? 'priceMinCop' and p_draft->'priceMinCop' <> 'null'::jsonb then
    if jsonb_typeof(p_draft->'priceMinCop') <> 'number'
       or (p_draft->>'priceMinCop')::numeric < 0
       or (p_draft->>'priceMinCop')::numeric > 2147483647
       or (p_draft->>'priceMinCop')::numeric <> trunc((p_draft->>'priceMinCop')::numeric) then
      raise exception 'INVALID_TICKET_PRICE' using errcode = '22023';
    end if;
  end if;

  v_capacity := nullif(p_draft->>'capacity', '')::integer;
  if v_capacity is not null and v_capacity <= 0 then
    raise exception 'INVALID_CAPACITY' using errcode = '22023';
  end if;
  if jsonb_array_length(v_tiers) = 0
    and coalesce((p_draft->>'priceMinCop')::integer, 0) > 0 then
    -- No invented 100-ticket fallback. Quantity must be supplied.
    if v_capacity is null then
      raise exception 'TICKET_QUANTITY_REQUIRED' using errcode = '22023';
    end if;
    v_tiers := jsonb_build_array(jsonb_build_object(
      'name', 'General Admission',
      'priceCop', (p_draft->>'priceMinCop')::integer,
      'quantity', v_capacity
    ));
  end if;

  if jsonb_array_length(v_tiers) > 0 then
    if exists (
      select 1 from jsonb_array_elements(v_tiers) t
      where nullif(trim(t->>'name'), '') is null
        or jsonb_typeof(t->'priceCop') <> 'number'
        or jsonb_typeof(t->'quantity') <> 'number'
        or (t->>'priceCop')::numeric < 0
        or (t->>'priceCop')::numeric > 2147483647
        or (t->>'priceCop')::numeric <> trunc((t->>'priceCop')::numeric)
        or (t->>'quantity')::numeric <= 0
        or (t->>'quantity')::numeric > 2147483647
        or (t->>'quantity')::numeric <> trunc((t->>'quantity')::numeric)
    ) then
      raise exception 'INVALID_TICKET_TIERS' using errcode = '22023';
    end if;
    select min((t->>'priceCop')::integer), max((t->>'priceCop')::integer),
           sum((t->>'quantity')::integer)::integer
    into v_price_min, v_price_max, v_total_tier_qty
    from jsonb_array_elements(v_tiers) t;
    if v_capacity is not null and v_total_tier_qty > v_capacity then
      raise exception 'TICKET_CAPACITY_EXCEEDED' using errcode = '22023';
    end if;
  else
    v_price_min := coalesce((p_draft->>'priceMinCop')::integer, 0);
    v_price_max := v_price_min;
  end if;

  select full_name, avatar_url into v_host_name, v_host_avatar
  from public.profiles
  where id = v_actor;

  insert into public.events (
    source, name, description, address, city, country,
    event_start_time, ticket_price_min, ticket_price_max, currency,
    slug, status, organizer_id, created_by, total_capacity, details, approval_request_id
  )
  values (
    'host_wizard', trim(p_draft->>'title'), p_draft->>'description',
    p_draft->>'venue', 'Medellín', 'CO',
    (p_draft->>'dateIso')::timestamptz,
    v_price_min, v_price_max, 'cop',
    p_slug, 'published', v_actor, v_actor, v_capacity,
    jsonb_build_object(
      'neighborhood', p_draft->>'neighborhood',
      'capacity', v_capacity, 'ticket_tiers', v_tiers,
      'host_display', case when nullif(trim(v_host_name), '') is null
        then null
        else jsonb_build_object('name', trim(v_host_name), 'avatar_url', v_host_avatar)
      end
    ),
    v_request_id
  )
  returning id, slug into v_event_id, v_slug;

  insert into public.event_tickets (
    event_id, name, price_cents, qty_total, currency, is_active, position
  )
  select v_event_id, t.value->>'name', (t.value->>'priceCop')::integer,
         (t.value->>'quantity')::integer, 'cop', true, (t.ordinality - 1)::integer
  from jsonb_array_elements(v_tiers) with ordinality as t(value, ordinality);

  v_receipt := jsonb_build_object(
    'eventId', v_event_id, 'slug', v_slug, 'proposalId', p_proposal_id
  );
  update public.approval_requests
  set notes = 'MDE_RECEIPT:' || v_receipt::text
  where id = v_request_id;

  return v_receipt || jsonb_build_object('approvalRequestId', v_request_id);
end;
$$;

-- A definer RPC is only safe when the execution surface is explicit.
revoke execute on function public.publish_event_tx(text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.publish_event_tx(text, jsonb, text)
  to authenticated;

comment on function public.publish_event_tx(text, jsonb, text) is
  'SAN-1285: authenticated atomic event + ticket tiers + audit + durable receipt. Business approval is NOT a development prerequisite.';
