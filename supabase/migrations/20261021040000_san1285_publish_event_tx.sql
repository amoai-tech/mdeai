-- SAN-1285 · one atomic, idempotent host-event publish transaction.
--
-- Problem this replaces: the approval-commit edge function wrote the approval
-- request, the approval decision, the event, its ticket tiers and the receipt as
-- separate service-role calls. A lost response or a failing tier write could
-- leave a published event without tickets, or publish a second event on retry.
--
-- This function owns the whole publish write in ONE transaction and is the ONLY
-- canonical publish writer:
--   1. claim the stable proposal id (unique partial index from SAN-1548),
--   2. revalidate the authenticated owner and the exact reviewed draft,
--   3. reuse a committed receipt/event for any retry (same event, never a second),
--   4. insert the event, its ticket tiers, the approval decision and the receipt,
--   5. roll everything back on any failure.
--
-- User confirmation is a UX action on the exact draft. It is NOT a business
-- approval or publishing-eligibility gate (Phase A).
--
-- Security: SECURITY DEFINER is required because the caller must not be able to
-- write approval_requests / approval_decisions directly. The function derives the
-- actor from auth.uid() (the caller's JWT), forces organizer_id/created_by to
-- that actor, pins search_path, and is executable only by `authenticated`.
--
-- `p_event` is built server-side by `buildEventInsert` in the edge function; only
-- non-identity content fields are read from it. Identity/state fields (organizer,
-- creator, status, source, approval link, slug source) are forced here.

create or replace function public.publish_event_tx(
  p_proposal_id text,
  p_draft jsonb,
  p_event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request_id uuid;
  v_claimed integer;
  v_existing public.approval_requests%rowtype;
  v_existing_event public.events%rowtype;
  v_decision text;
  v_event_id uuid;
  v_event_slug text;
  v_slug text;
  v_name text;
  v_start timestamptz;
  v_price_min numeric;
  v_capacity integer;
  v_tiers jsonb;
  v_details jsonb;
  v_host_name text;
  v_host_avatar text;
  v_receipt jsonb;
  v_receipt_text text;
begin
  ---------------------------------------------------------------------------
  -- 1. Identity and input validation (fail closed, before any write).
  ---------------------------------------------------------------------------
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_proposal_id is null
     or length(p_proposal_id) < 1
     or length(p_proposal_id) > 128 then
    raise exception 'INVALID_PROPOSAL_ID' using errcode = '22023';
  end if;

  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then
    raise exception 'INVALID_EVENT_DRAFT' using errcode = '22023';
  end if;
  if p_event is null or jsonb_typeof(p_event) <> 'object' then
    raise exception 'INVALID_EVENT_DRAFT' using errcode = '22023';
  end if;

  v_name := nullif(btrim(p_event ->> 'name'), '');
  if v_name is null or length(v_name) > 120 then
    raise exception 'INVALID_EVENT_DRAFT' using errcode = '22023';
  end if;

  if jsonb_typeof(p_event -> 'event_start_time') <> 'string' then
    raise exception 'INVALID_EVENT_DRAFT' using errcode = '22023';
  end if;
  begin
    v_start := (p_event ->> 'event_start_time')::timestamptz;
  exception when others then
    raise exception 'INVALID_EVENT_DRAFT' using errcode = '22023';
  end;

  -- The slug comes from the server-side slugifier (title + short suffix), so it
  -- is already URL-safe. A direct RPC caller cannot choose an arbitrary shape.
  v_slug := nullif(btrim(p_event ->> 'slug'), '');
  if v_slug is null
     or length(v_slug) > 80
     or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'INVALID_EVENT_SLUG' using errcode = '22023';
  end if;

  if p_event ? 'ticket_price_min'
     and jsonb_typeof(p_event -> 'ticket_price_min') <> 'null' then
    if jsonb_typeof(p_event -> 'ticket_price_min') <> 'number' then
      raise exception 'INVALID_TICKET_PRICE' using errcode = '22023';
    end if;
    v_price_min := (p_event ->> 'ticket_price_min')::numeric;
    if v_price_min < 0 then
      raise exception 'INVALID_TICKET_PRICE' using errcode = '22023';
    end if;
  end if;

  if p_draft ? 'capacity'
     and jsonb_typeof(p_draft -> 'capacity') <> 'null' then
    if jsonb_typeof(p_draft -> 'capacity') <> 'number' then
      raise exception 'INVALID_CAPACITY' using errcode = '22023';
    end if;
    v_capacity := (p_draft ->> 'capacity')::integer;
    if v_capacity < 0 then
      raise exception 'INVALID_CAPACITY' using errcode = '22023';
    end if;
  end if;

  ---------------------------------------------------------------------------
  -- 2. Ticket tiers. Mirrors the previous edge-side behaviour: explicit tiers
  -- win; otherwise a priced draft gets one General Admission tier at capacity
  -- (the historical fallback of 100 when capacity is absent is preserved).
  ---------------------------------------------------------------------------
  v_tiers := coalesce(p_draft -> 'ticketTiers', '[]'::jsonb);
  if jsonb_typeof(v_tiers) <> 'array' then
    raise exception 'INVALID_TICKET_TIERS' using errcode = '22023';
  end if;
  if jsonb_array_length(v_tiers) > 100 then
    raise exception 'INVALID_TICKET_TIERS' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_tiers) as t
    where not (t ? 'name' and t ? 'priceCop' and t ? 'quantity')
       or nullif(btrim(t ->> 'name'), '') is null
       or jsonb_typeof(t -> 'priceCop') <> 'number'
       or jsonb_typeof(t -> 'quantity') <> 'number'
       or (t ->> 'priceCop')::numeric < 0
       or (t ->> 'quantity')::numeric <= 0
  ) then
    raise exception 'INVALID_TICKET_TIERS' using errcode = '22023';
  end if;

  if jsonb_array_length(v_tiers) = 0 and coalesce(v_price_min, 0) > 0 then
    v_tiers := jsonb_build_array(
      jsonb_build_object(
        'name', 'General Admission',
        'priceCop', v_price_min::integer,
        'quantity', case when v_capacity > 0 then v_capacity else 100 end
      )
    );
  end if;

  ---------------------------------------------------------------------------
  -- 3. Claim the proposal. The SAN-1548 unique partial index is the lock:
  --    - first caller inserts and owns the publish;
  --    - a concurrent caller waits here, then reads the committed row;
  --    - a retry reuses the same row and returns its durable receipt.
  ---------------------------------------------------------------------------
  insert into public.approval_requests (
    agent, action_type, subject, payload, risk_level, requested_by, proposal_id
  )
  values (
    'hostEventAgent', 'publish_event', v_name, p_draft, 'medium',
    v_actor::text, p_proposal_id
  )
  on conflict (proposal_id) where proposal_id is not null do nothing;
  get diagnostics v_claimed = row_count;

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
  -- The approved artifact is the reviewed draft, not whatever is sent later.
  if v_existing.payload is distinct from p_draft then
    raise exception 'DRAFT_CHANGED' using errcode = 'P0001';
  end if;
  v_request_id := v_existing.id;

  ---------------------------------------------------------------------------
  -- 4. Retry path: return the committed event from the durable receipt. Never
  --    create a second event; a changed slug/title on the retry is ignored.
  ---------------------------------------------------------------------------
  if v_existing.notes like 'MDE_RECEIPT:%' then
    begin
      v_receipt := substring(v_existing.notes from 13)::jsonb;
    exception when others then
      v_receipt := null;
    end;
    -- Only a well-formed event id may be cast; a malformed legacy receipt must
    -- not block the recovery path with a cast error.
    if v_receipt is not null
       and (v_receipt ->> 'eventId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select * into v_existing_event
      from public.events
      where id = (v_receipt ->> 'eventId')::uuid
        and organizer_id = v_actor;
      if found then
        return jsonb_build_object(
          'eventId', v_existing_event.id,
          'slug', v_existing_event.slug,
          'proposalId', p_proposal_id,
          'approvalRequestId', v_request_id
        );
      end if;
    end if;
  end if;

  -- Recovery: an event may already exist for this approval (e.g. an interrupted
  -- legacy write). Return it instead of inserting another one.
  select * into v_existing_event
  from public.events
  where approval_request_id = v_request_id
    and organizer_id = v_actor;
  if found then
    v_receipt := jsonb_build_object(
      'eventId', v_existing_event.id,
      'slug', v_existing_event.slug,
      'proposalId', p_proposal_id
    );
    update public.approval_requests
    set notes = 'MDE_RECEIPT:' || v_receipt::text
    where id = v_request_id;
    return v_receipt || jsonb_build_object('approvalRequestId', v_request_id);
  end if;

  -- A previously committed purchase decision that is not "approve" must block
  -- the write (zero mutations; a retry needs a new review).
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

  ---------------------------------------------------------------------------
  -- 5. Event content. Identity and publishing state are forced; host_display is
  --    snapshotted from the host's profile, never trusted from the payload.
  ---------------------------------------------------------------------------
  v_details := coalesce(p_event -> 'details', '{}'::jsonb);
  v_details := (v_details - 'host_display') - 'ticket_tiers';

  select nullif(btrim(full_name), ''), avatar_url
    into v_host_name, v_host_avatar
  from public.profiles
  where id = v_actor;

  if v_host_name is not null then
    v_details := v_details || jsonb_build_object(
      'host_display',
      jsonb_build_object('name', v_host_name, 'avatar_url', v_host_avatar)
    );
  end if;

  -- Keep details.ticket_tiers truthful about what is actually stored below.
  v_details := v_details || jsonb_build_object('ticket_tiers', v_tiers);

  insert into public.events (
    source, name, description, address, city, country, event_start_time,
    ticket_price_min, currency, slug, status, organizer_id, created_by,
    details, approval_request_id
  )
  values (
    'host_wizard',
    v_name,
    p_event ->> 'description',
    p_event ->> 'address',
    coalesce(nullif(p_event ->> 'city', ''), 'Medellín'),
    coalesce(nullif(p_event ->> 'country', ''), 'CO'),
    v_start,
    v_price_min,
    coalesce(nullif(p_event ->> 'currency', ''), 'cop'),
    v_slug,
    'published',
    v_actor,
    v_actor,
    v_details,
    v_request_id
  )
  returning id, slug into v_event_id, v_event_slug;

  if jsonb_array_length(v_tiers) > 0 then
    insert into public.event_tickets (
      event_id, name, price_cents, qty_total, currency, is_active, position
    )
    select
      v_event_id,
      btrim(t.value ->> 'name'),
      (t.value ->> 'priceCop')::integer,
      (t.value ->> 'quantity')::integer,
      'cop',
      true,
      (t.ordinality - 1)::integer
    from jsonb_array_elements(v_tiers) with ordinality as t(value, ordinality);
  end if;

  ---------------------------------------------------------------------------
  -- 6. Durable receipt. Written in the same transaction as the event, so a
  --    retry can never find "approval without event" or duplicate the publish.
  ---------------------------------------------------------------------------
  v_receipt := jsonb_build_object(
    'eventId', v_event_id,
    'slug', v_event_slug,
    'proposalId', p_proposal_id
  );
  v_receipt_text := 'MDE_RECEIPT:' || v_receipt::text;

  update public.approval_requests
  set notes = v_receipt_text
  where id = v_request_id;

  return v_receipt || jsonb_build_object('approvalRequestId', v_request_id);
end;
$$;

comment on function public.publish_event_tx(text, jsonb, jsonb) is
  'SAN-1285: one atomic, idempotent host-event publish (approval claim + decision + event + ticket tiers + durable receipt). User confirmation is a UX action, not a business approval gate.';

-- SECURITY DEFINER is justified because callers must not write approval tables
-- directly. Keep the execution surface explicit and never callable by anon.
revoke all on function public.publish_event_tx(text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_event_tx(text, jsonb, jsonb)
  to authenticated;
