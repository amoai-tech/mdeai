-- SB-002 · Recover live-only tables and functions (Option 1: defects quarantined)
--
-- Problem this fixes: a database rebuilt from `supabase/migrations/**` did NOT match
-- production. 8 application tables and 32 application functions existed only in the
-- live project. `supabase db reset` replayed 109/109 cleanly, yet the result was an
-- incomplete description of production.
--
-- Provenance: every definition below was read from the live catalogue with
-- `pg_get_functiondef`, `pg_get_constraintdef`, `pg_get_indexdef` and `pg_policies`
-- on 2026-09-17. Nothing here is hand-invented. Evidence:
--   docs/02-architecture/snapshots/sb-002-schema-gap-inventory-2026-09-17.md
--   docs/02-architecture/snapshots/baseline-replay-audit-2026-09-17.md
--
-- Plan tier: Supabase Free. No preview branch, no production write.
--
-- ── Idempotency ───────────────────────────────────────────────────────────────
-- This migration is written to be a NO-OP on production, where every object already
-- exists:
--   * `create table if not exists` skips the table AND all of its inline constraints
--   * `create index if not exists`
--   * `create or replace function`
--   * `drop trigger/policy if exists` before `create`
-- It is therefore safe to apply normally on any environment.
--
-- ── Deliberately EXCLUDED (do not add without a separate decision) ────────────
-- 1. The 7 DEAD functions. They write to objects dropped by
--    `20260524022749_mdeapp_canonical_schema_cleanup.sql` and never restored in ANY
--    environment (`agent_audit_log`, `agent_tool_calls`, `messages`, `conversations`,
--    `outbound_clicks`). Recreating them would reproduce a live production defect:
--      fn_audit_outbox, fn_audit_agent_approval, fn_audit_agent_run,
--      fn_record_tool_call_start, fn_record_tool_call_end,
--      auto_create_landlord_inbox_from_message, fn_record_conversion
-- 2. `tg_audit_outbox` on public.outbox, because it calls the dead fn_audit_outbox().
--    That trigger is why EVERY insert into public.outbox fails in production today.
-- 3. The 3 `hybrid_search_*` functions. They are LANGUAGE sql with string bodies and
--    reference `fts_content`, which exists only in production. With
--    `check_function_bodies = on` (this project's setting) PostgreSQL validates the
--    body at CREATE, so they cannot be created until `fts_content` is recovered.
-- 4. The `marketing` schema (12 tables). NOT covered here — that is SB-002 Option 2.
--    The 3 functions that reference it ARE created below (they are plpgsql, so their
--    bodies are not parsed at CREATE and the migration applies cleanly), but they will
--    raise at call time until `marketing` is recovered. This is intentionally faithful
--    to production, which has the same shape.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. The 8 live-only application tables
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.outbox (
  id uuid default gen_random_uuid() not null,
  channel text not null,
  action text not null,
  idempotency_key text not null,
  payload jsonb not null,
  approval_id uuid,
  status text default 'pending'::text not null,
  attempts integer default 0 not null,
  next_retry_at timestamp with time zone,
  last_error text,
  provider_id text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  constraint outbox_pkey primary key (id),
  constraint outbox_channel_idempotency_key_key unique (channel, idempotency_key),
  constraint outbox_approval_fk foreign key (approval_id) references public.approval_requests(id),
  constraint outbox_channel_check check (channel = any (array['whatsapp'::text, 'email'::text, 'stripe'::text, 'postiz'::text, 'pinterest'::text, 'webhook'::text, 'custom'::text])),
  constraint outbox_status_check check (status = any (array['pending'::text, 'approved'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'cancelled'::text]))
);

create table if not exists public.event_stakeholders (
  id uuid default gen_random_uuid() not null,
  event_id uuid not null,
  user_id uuid,
  full_name text not null,
  email text not null,
  phone_e164 text,
  role text not null,
  organization text,
  is_primary boolean default false not null,
  notes text,
  invited_by uuid,
  invited_at timestamp with time zone default now() not null,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint event_stakeholders_pkey primary key (id),
  constraint event_stakeholders_event_id_email_role_key unique (event_id, email, role),
  constraint event_stakeholders_event_id_fkey foreign key (event_id) references public.events(id) on delete cascade,
  constraint event_stakeholders_invited_by_fkey foreign key (invited_by) references auth.users(id),
  constraint event_stakeholders_user_id_fkey foreign key (user_id) references auth.users(id),
  constraint event_stakeholders_role_check check (role = any (array['organizer'::text, 'planner'::text, 'co_producer'::text, 'mc'::text, 'host'::text, 'judge'::text, 'sponsor_contact'::text, 'vendor_lead'::text, 'security_lead'::text, 'photographer'::text, 'other'::text]))
);

create table if not exists public.event_vendors (
  id uuid default gen_random_uuid() not null,
  event_id uuid not null,
  company_name text not null,
  service_type text not null,
  contact_name text,
  contact_email text,
  contact_phone_e164 text,
  contract_amount_cents integer,
  currency text default 'COP'::text not null,
  amount_paid_cents integer default 0 not null,
  payment_status text default 'unpaid'::text not null,
  contract_url text,
  invoice_url text,
  notes text,
  booked_at timestamp with time zone,
  service_date timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint event_vendors_pkey primary key (id),
  constraint event_vendors_event_id_fkey foreign key (event_id) references public.events(id) on delete cascade,
  constraint event_vendors_amount_paid_cents_check check (amount_paid_cents >= 0),
  constraint event_vendors_check check (amount_paid_cents <= coalesce(contract_amount_cents, 2147483647)),
  constraint event_vendors_contract_amount_cents_check check ((contract_amount_cents is null) or (contract_amount_cents >= 0)),
  constraint event_vendors_payment_status_check check (payment_status = any (array['unpaid'::text, 'partial'::text, 'paid'::text, 'overdue'::text, 'cancelled'::text])),
  constraint event_vendors_service_type_check check (service_type = any (array['photographer'::text, 'videographer'::text, 'av_sound'::text, 'security'::text, 'catering'::text, 'decor'::text, 'transport'::text, 'printing'::text, 'rental'::text, 'venue_supplier'::text, 'other'::text]))
);

create table if not exists public.event_promo_codes (
  id uuid default gen_random_uuid() not null,
  event_id uuid not null,
  code text not null,
  discount_type text not null,
  discount_value numeric(8,2) not null,
  applicable_ticket_ids uuid[],
  max_usages integer,
  usage_count integer default 0 not null,
  starts_at timestamp with time zone,
  expires_at timestamp with time zone,
  unlocks_hidden_tickets boolean default false not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint event_promo_codes_pkey primary key (id),
  constraint event_promo_codes_event_id_code_key unique (event_id, code),
  constraint event_promo_codes_created_by_fkey foreign key (created_by) references auth.users(id),
  constraint event_promo_codes_event_id_fkey foreign key (event_id) references public.events(id) on delete cascade,
  constraint event_promo_codes_check check (usage_count <= coalesce(max_usages, 2147483647)),
  constraint event_promo_codes_check1 check ((expires_at is null) or (starts_at is null) or (expires_at > starts_at)),
  constraint event_promo_codes_discount_type_check check (discount_type = any (array['percent'::text, 'fixed'::text, 'free'::text])),
  constraint event_promo_codes_discount_value_check check (discount_value >= (0)::numeric),
  constraint event_promo_codes_max_usages_check check ((max_usages is null) or (max_usages > 0))
);

create table if not exists public.event_order_refunds (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  amount_cents integer not null,
  currency text default 'COP'::text not null,
  reason text,
  reason_detail text,
  initiated_by uuid,
  initiated_via text not null,
  stripe_refund_id text,
  attendee_ids uuid[],
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  constraint event_order_refunds_pkey primary key (id),
  constraint event_order_refunds_stripe_refund_id_key unique (stripe_refund_id),
  constraint event_order_refunds_initiated_by_fkey foreign key (initiated_by) references auth.users(id),
  constraint event_order_refunds_order_id_fkey foreign key (order_id) references public.event_orders(id) on delete cascade,
  constraint event_order_refunds_amount_cents_check check (amount_cents > 0),
  constraint event_order_refunds_initiated_via_check check (initiated_via = any (array['stripe_dashboard'::text, 'organizer_ui'::text, 'admin_api'::text, 'automated'::text])),
  constraint event_order_refunds_reason_check check (reason = any (array['customer_request'::text, 'duplicate'::text, 'fraudulent'::text, 'event_cancelled'::text, 'organizer_decision'::text, 'chargeback'::text, 'other'::text])),
  constraint event_order_refunds_status_check check (status = any (array['pending'::text, 'completed'::text, 'failed'::text, 'reversed'::text]))
);

create table if not exists public.suppression_list (
  id uuid default gen_random_uuid() not null,
  channel text not null,
  identifier text not null,
  reason text not null,
  source text default 'user'::text not null,
  source_event jsonb,
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone,
  constraint suppression_list_pkey primary key (id),
  constraint suppression_list_channel_identifier_key unique (channel, identifier),
  constraint suppression_list_channel_check check (channel = any (array['whatsapp'::text, 'email'::text, 'sms'::text, 'push'::text, 'voice'::text, 'all'::text])),
  constraint suppression_list_reason_check check (reason = any (array['user_stop'::text, 'unsubscribe'::text, 'bounce'::text, 'complaint'::text, 'admin_block'::text, 'tcpa_holiday'::text, 'manual'::text]))
);

create table if not exists public.event_attendee_profiles (
  attendee_id uuid not null,
  dietary_preference text,
  dietary_detail text,
  accessibility_needs text[],
  accessibility_detail text,
  shirt_size text,
  company text,
  job_title text,
  emergency_contact_name text,
  emergency_contact_phone text,
  marketing_consent boolean default false not null,
  custom_fields jsonb default '{}'::jsonb,
  updated_at timestamp with time zone default now() not null,
  constraint event_attendee_profiles_pkey primary key (attendee_id),
  constraint event_attendee_profiles_attendee_id_fkey foreign key (attendee_id) references public.event_attendees(id) on delete cascade,
  constraint event_attendee_profiles_dietary_preference_check check ((dietary_preference is null) or (dietary_preference = any (array['omnivore'::text, 'vegetarian'::text, 'vegan'::text, 'gluten_free'::text, 'halal'::text, 'kosher'::text, 'none'::text, 'other'::text]))),
  constraint event_attendee_profiles_shirt_size_check check ((shirt_size is null) or (shirt_size = any (array['XS'::text, 'S'::text, 'M'::text, 'L'::text, 'XL'::text, 'XXL'::text])))
);

-- NOTE: `delivery_receipts.outbox_table` CHECK references 'posts_outbox', which exists in
-- NEITHER production NOR a fresh replay. This is a pre-existing production defect carried
-- over verbatim rather than silently "fixed" — the constraint is what production has.
-- Tracked as a separate defect; see the SB-002 inventory §3.
create table if not exists public.delivery_receipts (
  id uuid default gen_random_uuid() not null,
  outbox_table text not null,
  outbox_id uuid not null,
  provider text not null,
  external_id text not null,
  status text not null,
  raw jsonb,
  received_at timestamp with time zone default now() not null,
  constraint delivery_receipts_pkey primary key (id),
  constraint delivery_receipts_outbox_table_check check (outbox_table = any (array['posts_outbox'::text, 'wa_outbox'::text, 'email_outbox'::text]))
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Indexes
-- ═══════════════════════════════════════════════════════════════════════════════

create index if not exists outbox_status_channel on public.outbox using btree (status, channel);
create index if not exists outbox_pending_due on public.outbox using btree (next_retry_at) where ((status = any (array['pending'::text, 'approved'::text])) and (next_retry_at is not null));
create index if not exists idx_outbox_approval_id on public.outbox using btree (approval_id);

create index if not exists event_stakeholders_event_idx on public.event_stakeholders using btree (event_id);
create index if not exists event_stakeholders_role_idx on public.event_stakeholders using btree (event_id, role);
create index if not exists event_stakeholders_user_idx on public.event_stakeholders using btree (user_id) where (user_id is not null);
create index if not exists event_stakeholders_invited_by_idx on public.event_stakeholders using btree (invited_by) where (invited_by is not null);

create index if not exists event_vendors_event_idx on public.event_vendors using btree (event_id);
create index if not exists event_vendors_payment_idx on public.event_vendors using btree (event_id, payment_status);
create index if not exists event_vendors_service_idx on public.event_vendors using btree (event_id, service_type);

create index if not exists event_promo_codes_event_idx on public.event_promo_codes using btree (event_id);
create index if not exists event_promo_codes_created_by_idx on public.event_promo_codes using btree (created_by) where (created_by is not null);

create index if not exists event_order_refunds_order_idx on public.event_order_refunds using btree (order_id);
create index if not exists event_order_refunds_status_idx on public.event_order_refunds using btree (status);
create index if not exists event_order_refunds_initiated_by_idx on public.event_order_refunds using btree (initiated_by) where (initiated_by is not null);

create index if not exists suppression_expires on public.suppression_list using btree (expires_at) where (expires_at is not null);

create index if not exists event_attendee_profiles_dietary_idx on public.event_attendee_profiles using btree (dietary_preference) where (dietary_preference is not null);
create index if not exists event_attendee_profiles_accessibility_idx on public.event_attendee_profiles using gin (accessibility_needs) where (accessibility_needs is not null);

create index if not exists delivery_receipts_outbox_idx on public.delivery_receipts using btree (outbox_table, outbox_id);
create index if not exists delivery_receipts_lookup_idx on public.delivery_receipts using btree (provider, external_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Functions
-- ═══════════════════════════════════════════════════════════════════════════════
-- 22 of the 32 missing functions. The 3 hybrid_search_* and the 7 dead functions are
-- excluded — see the header for why.

-- ── outbox / approval pipeline ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.decide_approval(p_request_id uuid, p_decision text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'decide_approval: must be admin';
  end if;

  insert into public.approval_decisions (request_id, decision, decided_by, reason)
  values (p_request_id, p_decision, (select auth.uid()), p_reason);
end $function$;

CREATE OR REPLACE FUNCTION public.fn_outbox_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.updated_at = pg_catalog.now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_outbox_suppression_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_identifier text;
BEGIN
  -- Only check channels that have a suppression concept
  IF NEW.channel NOT IN ('whatsapp','email','sms') THEN
    RETURN NEW;
  END IF;

  -- Extract identifier from payload: try 'to', then 'identifier', then 'phone', then 'email'
  v_identifier := COALESCE(
    NEW.payload->>'to',
    NEW.payload->>'identifier',
    NEW.payload->>'phone',
    NEW.payload->>'email'
  );

  IF v_identifier IS NOT NULL AND public.is_suppressed(NEW.channel, v_identifier) THEN
    RAISE EXCEPTION 'SUPPRESSED: % identifier % is on the suppression list for channel %',
      NEW.channel, v_identifier, NEW.channel
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.outbox_claim(p_channel text, p_limit integer DEFAULT 10)
 RETURNS SETOF outbox
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from public.outbox
  where channel = p_channel
    and status in ('pending','approved')
    and (next_retry_at is null or next_retry_at <= pg_catalog.now())
  order by created_at asc
  limit p_limit
  for update skip locked;
$function$;

CREATE OR REPLACE FUNCTION public.outbox_enqueue(p_channel text, p_action text, p_idempotency_key text, p_payload jsonb, p_approval_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
begin
  insert into public.outbox (channel, action, idempotency_key, payload, approval_id)
  values (p_channel, p_action, p_idempotency_key, p_payload, p_approval_id)
  on conflict (channel, idempotency_key) do nothing
  returning id into v_id;

  -- on conflict returns nothing; fetch the existing row
  if v_id is null then
    select id into v_id
    from public.outbox
    where channel = p_channel and idempotency_key = p_idempotency_key;
  end if;

  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.outbox_mark_failed(p_id uuid, p_error text, p_next_retry_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.outbox
  set status        = 'failed',
      last_error    = p_error,
      attempts      = attempts + 1,
      next_retry_at = p_next_retry_at,
      updated_at    = pg_catalog.now()
  where id = p_id;
$function$;

CREATE OR REPLACE FUNCTION public.outbox_mark_sent(p_id uuid, p_provider_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.outbox
  set status      = 'sent',
      provider_id = p_provider_id,
      sent_at     = pg_catalog.now(),
      updated_at  = pg_catalog.now()
  where id = p_id;
$function$;

CREATE OR REPLACE FUNCTION public.request_approval(p_agent text, p_action_type text, p_subject text, p_payload jsonb, p_risk_level text DEFAULT 'low'::text, p_requested_by text DEFAULT NULL::text, p_outbox_id uuid DEFAULT NULL::uuid, p_expires_hours integer DEFAULT 24)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
begin
  insert into public.approval_requests (
    agent, action_type, subject, payload, risk_level,
    requested_by, outbox_id, expires_at
  ) values (
    p_agent, p_action_type, p_subject, p_payload, p_risk_level,
    coalesce(p_requested_by, 'system'),
    p_outbox_id,
    pg_catalog.now() + (p_expires_hours || ' hours')::interval
  )
  returning id into v_id;

  return v_id;
end $function$;

-- ── suppression ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_suppressed(p_channel text, p_identifier text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.suppression_list
    WHERE (channel = p_channel OR channel = 'all')
      AND identifier = pg_catalog.lower(p_identifier)
      AND (expires_at IS NULL OR expires_at > pg_catalog.now())
  );
$function$;

-- ── events / ticketing ────────────────────────────────────────────────────────

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
             ORDER BY o.created_at DESC
             LIMIT  p_limit
             OFFSET p_offset
          ) sub
      ),
      '[]'::jsonb
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.event_dashboard_summary(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.events WHERE id = p_event_id AND organizer_id = v_caller
    ) THEN
      RAISE EXCEPTION 'NOT_ORGANIZER' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'event', (
      SELECT jsonb_build_object(
        'id',                 e.id,
        'name',               e.name,
        'status',             e.status,
        'event_start_time',   e.event_start_time,
        'event_end_time',     e.event_end_time,
        'staff_link_version', e.staff_link_version,
        'address',            e.address
      )
      FROM public.events e WHERE e.id = p_event_id
    ),
    'kpis', (
      SELECT jsonb_build_object(
        'tickets_sold',  count(*) FILTER (WHERE status = 'active'),
        'checked_in',    count(*) FILTER (WHERE qr_used_at IS NOT NULL),
        'no_shows',      count(*) FILTER (WHERE status = 'active' AND qr_used_at IS NULL)
      )
      FROM public.event_attendees WHERE event_id = p_event_id
    ),
    'revenue_cents', (
      SELECT coalesce(sum(total_cents), 0)
        FROM public.event_orders
       WHERE event_id = p_event_id AND status IN ('paid', 'partial_refund')
    ),
    'tiers', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id',                 t.id,
            'name',               t.name,
            'qty_total',          t.qty_total,
            'qty_sold',           t.qty_sold,
            'qty_pending',        t.qty_pending,
            'remaining',          t.qty_total - t.qty_sold - t.qty_pending,
            'price_cents',        t.price_cents,
            'currency',           t.currency,
            'tier_revenue_cents', coalesce((
              SELECT sum(o.total_cents)
                FROM public.event_orders o
               WHERE o.ticket_id = t.id AND o.status IN ('paid', 'partial_refund')
            ), 0)
          )
          ORDER BY t.position
        ),
        '[]'::jsonb
      )
      FROM public.event_tickets t WHERE t.event_id = p_event_id
    ),
    'recent_check_ins', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id',         ci.id,
            'result',     ci.result,
            'created_at', ci.created_at,
            'details',    ci.details
          )
          ORDER BY ci.created_at DESC
        ),
        '[]'::jsonb
      )
      FROM (
        SELECT id, result, created_at, details
          FROM public.event_check_ins
         WHERE event_id = p_event_id
         ORDER BY created_at DESC
         LIMIT 10
      ) ci
    ),
    'latest_stripe_pi', (
      SELECT stripe_payment_intent
        FROM public.event_orders
       WHERE event_id = p_event_id
         AND status IN ('paid', 'partial_refund')
         AND stripe_payment_intent IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_join_wait_list(p_ticket_type_id uuid, p_user_id uuid, p_email text, p_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event_id  uuid;
  v_position  integer;
  v_id        uuid;
BEGIN
  -- resolve event_id from ticket type
  SELECT event_id INTO v_event_id
  FROM public.event_tickets
  WHERE id = p_ticket_type_id;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('joined', false, 'error', 'ticket_type_not_found');
  END IF;

  -- check already on list
  IF EXISTS (
    SELECT 1 FROM public.event_wait_list
    WHERE ticket_type_id = p_ticket_type_id AND user_id = p_user_id
      AND status NOT IN ('expired','removed')
  ) THEN
    SELECT position INTO v_position
    FROM public.event_wait_list
    WHERE ticket_type_id = p_ticket_type_id AND user_id = p_user_id
      AND status NOT IN ('expired','removed');
    RETURN jsonb_build_object('joined', false, 'already_on_list', true, 'position', v_position);
  END IF;

  -- assign next position
  SELECT COALESCE(MAX(position), 0) + 1 INTO v_position
  FROM public.event_wait_list
  WHERE ticket_type_id = p_ticket_type_id AND status = 'waiting';

  INSERT INTO public.event_wait_list (event_id, ticket_type_id, user_id, email, phone, position)
  VALUES (v_event_id, p_ticket_type_id, p_user_id, p_email, p_phone, v_position)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('joined', true, 'position', v_position, 'id', v_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_notify_next_in_line(p_ticket_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row   public.event_wait_list%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.event_wait_list
  WHERE ticket_type_id = p_ticket_type_id AND status = 'waiting'
  ORDER BY position ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('notified', false, 'reason', 'empty_queue');
  END IF;

  UPDATE public.event_wait_list SET
    status          = 'notified',
    notified_at     = pg_catalog.now(),
    hold_expires_at = pg_catalog.now() + interval '30 minutes'
  WHERE id = v_row.id;

  -- in-app notification
  INSERT INTO public.notifications (user_id, type, payload)
  VALUES (
    v_row.user_id,
    'wait_list_spot_available',
    jsonb_build_object(
      'ticket_type_id', v_row.ticket_type_id,
      'event_id',       v_row.event_id,
      'expires_at',     (pg_catalog.now() + interval '30 minutes')
    )
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('notified', true, 'user_id', v_row.user_id, 'email', v_row.email);
END;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_promo_code(p_event_id uuid, p_code text, p_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_promo public.event_promo_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_promo FROM public.event_promo_codes WHERE event_id = p_event_id AND code = p_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROMO_NOT_FOUND'; END IF;
  IF v_promo.starts_at IS NOT NULL AND v_promo.starts_at > now() THEN RAISE EXCEPTION 'PROMO_NOT_STARTED'; END IF;
  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now() THEN RAISE EXCEPTION 'PROMO_EXPIRED'; END IF;
  IF v_promo.usage_count >= COALESCE(v_promo.max_usages, 2147483647) THEN RAISE EXCEPTION 'PROMO_EXHAUSTED'; END IF;
  IF v_promo.applicable_ticket_ids IS NOT NULL AND NOT (p_ticket_id = ANY(v_promo.applicable_ticket_ids)) THEN RAISE EXCEPTION 'PROMO_TICKET_MISMATCH'; END IF;
  UPDATE public.event_promo_codes SET usage_count = usage_count + 1 WHERE id = v_promo.id;
  RETURN jsonb_build_object('promo_code_id', v_promo.id, 'discount_type', v_promo.discount_type, 'discount_value', v_promo.discount_value);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ticket_payment_refund_v2(p_order_id uuid, p_amount_cents integer, p_reason text, p_stripe_refund_id text, p_initiated_by uuid, p_initiated_via text, p_attendee_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.event_orders%ROWTYPE;
  v_refund_id uuid;
  v_total_refunded int;
BEGIN
  SELECT * INTO v_order FROM public.event_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status NOT IN ('paid','partial_refund') THEN RAISE EXCEPTION 'ORDER_NOT_REFUNDABLE: %', v_order.status; END IF;
  INSERT INTO public.event_order_refunds (order_id, amount_cents, currency, reason, initiated_by, initiated_via, stripe_refund_id, attendee_ids, status, completed_at)
  VALUES (p_order_id, p_amount_cents, v_order.currency, p_reason, p_initiated_by, p_initiated_via, p_stripe_refund_id, p_attendee_ids, 'completed', now())
  RETURNING id INTO v_refund_id;
  SELECT COALESCE(SUM(amount_cents),0) INTO v_total_refunded FROM public.event_order_refunds WHERE order_id = p_order_id AND status = 'completed';
  IF v_total_refunded >= v_order.total_cents THEN
    UPDATE public.event_orders SET status = 'refunded' WHERE id = p_order_id;
  ELSE
    UPDATE public.event_orders SET status = 'partial_refund' WHERE id = p_order_id;
  END IF;
  IF p_attendee_ids IS NULL THEN
    UPDATE public.event_attendees SET status = 'refunded' WHERE order_id = p_order_id AND status = 'active';
    UPDATE public.event_tickets SET qty_sold = GREATEST(0, qty_sold - v_order.quantity) WHERE id = v_order.ticket_id;
  ELSE
    UPDATE public.event_attendees SET status = 'refunded' WHERE id = ANY(p_attendee_ids) AND status = 'active';
    UPDATE public.event_tickets SET qty_sold = GREATEST(0, qty_sold - array_length(p_attendee_ids, 1)) WHERE id = v_order.ticket_id;
  END IF;
  RETURN v_refund_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_ai_embed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_type text;
  v_embed_url   text;
  v_secret      text;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'apartments'   THEN v_entity_type := 'listing';
    WHEN 'events'       THEN v_entity_type := 'event';
    WHEN 'restaurants'  THEN v_entity_type := 'restaurant';
    ELSE RETURN NEW;
  END CASE;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'ai_embed_secret'
  LIMIT 1;

  v_embed_url := 'https://zkwcbyxiwklihegjhuql.supabase.co/functions/v1/ai-embed';

  PERFORM net.http_post(
    url     := v_embed_url,
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-ai-embed-secret', v_secret
    ),
    body    := jsonb_build_object(
      'entity_type', v_entity_type,
      'entity_id',   NEW.id::text
    ),
    timeout_milliseconds := 55000
  );

  RETURN NEW;
END;
$function$;

-- ── sponsor ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_sponsor_application(p_application_id uuid, p_approved_by uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'sponsor'
AS $function$
DECLARE
  v_caller_id   uuid;
  v_caller_role text;
  v_app         sponsor.applications%ROWTYPE;
  v_surfaces    text[];
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: must be logged in';
  END IF;

  SELECT role::text INTO v_caller_role
    FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required';
  END IF;

  SELECT * INTO v_app
    FROM sponsor.applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPLICATION_NOT_FOUND'; END IF;
  IF v_app.status NOT IN ('submitted', 'under_review') THEN
    RAISE EXCEPTION 'APPLICATION_NOT_APPROVABLE: %', v_app.status;
  END IF;

  v_surfaces := CASE v_app.activation_type
    WHEN 'digital'            THEN ARRAY['contest_header', 'leaderboard_footer']
    WHEN 'title_naming'       THEN ARRAY['contest_header', 'digital_banner']
    WHEN 'category_powered_by'THEN ARRAY['category_header']
    WHEN 'contestant_sponsor' THEN ARRAY['contestant_profile']
    WHEN 'venue_sponsor'      THEN ARRAY['qr_station']
    ELSE                           ARRAY['contest_header']
  END;

  UPDATE sponsor.applications
     SET status      = 'approved',
         approved_at = now(),
         approved_by = v_caller_id
   WHERE id = p_application_id;

  INSERT INTO sponsor.placements
    (application_id, surface, utm_destination, start_at, end_at, weight)
  SELECT
    p_application_id,
    unnest(v_surfaces),
    'https://mdeai.co/sponsor/' || p_application_id,
    now(),
    now() + interval '90 days',
    CASE v_app.tier
      WHEN 'gold'    THEN 150
      WHEN 'premium' THEN 200
      ELSE 100
    END;
END;
$function$;

-- ── rentals ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_landlord_public_profile(landlord_uuid uuid)
 RETURNS TABLE(id uuid, display_name text, avatar_url text, bio text, primary_neighborhood text, languages text[], is_verified boolean, verified_at timestamp with time zone, active_listings integer, total_leads_received integer, median_response_time_minutes integer, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    lp.id,
    lp.display_name,
    lp.avatar_url,
    lp.bio,
    lp.primary_neighborhood,
    lp.languages,
    (lp.verification_status = 'approved') AS is_verified,
    lp.verified_at,
    lp.active_listings,
    lp.total_leads_received,
    lp.median_response_time_minutes,
    lp.created_at
  FROM public.landlord_profiles lp
  WHERE lp.id = landlord_uuid
    AND lp.verification_status IN ('approved', 'pending');
$function$;

-- ── OpenClaw / marketing (see header item 4) ──────────────────────────────────
-- These 3 are plpgsql, so their bodies are NOT parsed at CREATE and this migration
-- applies cleanly. They will RAISE at call time until the `marketing` schema is
-- recovered (SB-002 Option 2). Created here because production has them, and the
-- goal is for the repository to describe production.

CREATE OR REPLACE FUNCTION public.fn_insert_conversation(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
  v_msg_id text;
BEGIN
  v_msg_id := NULLIF(p_data->>'openclaw_message_id', '');

  IF v_msg_id IS NOT NULL THEN
    INSERT INTO marketing.openclaw_conversations (
      contact_phone, direction, channel, body,
      openclaw_message_id, campaign_id, metadata
    ) VALUES (
      p_data->>'contact_phone',
      p_data->>'direction',
      COALESCE(p_data->>'channel', 'whatsapp'),
      p_data->>'body',
      v_msg_id,
      NULLIF(p_data->>'campaign_id', '')::uuid,
      COALESCE((p_data->>'metadata')::jsonb, '{}')
    )
    ON CONFLICT (openclaw_message_id) WHERE openclaw_message_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_id;
  ELSE
    -- outbound reply: no message_id, always insert
    INSERT INTO marketing.openclaw_conversations (
      contact_phone, direction, channel, body,
      campaign_id, metadata
    ) VALUES (
      p_data->>'contact_phone',
      p_data->>'direction',
      COALESCE(p_data->>'channel', 'whatsapp'),
      p_data->>'body',
      NULLIF(p_data->>'campaign_id', '')::uuid,
      COALESCE((p_data->>'metadata')::jsonb, '{}')
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_update_conversation_intent(p_message_id text, p_intent text, p_confidence numeric, p_reply text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE marketing.openclaw_conversations SET
    intent      = p_intent,
    confidence  = p_confidence,
    reply_body  = p_reply,
    replied_at  = pg_catalog.now()
  WHERE openclaw_message_id = p_message_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.fn_upsert_delivery_log(p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_msg_id text := p_data->>'openclaw_message_id';
BEGIN
  IF v_msg_id IS NULL OR v_msg_id = '' THEN
    INSERT INTO marketing.delivery_logs (
      channel, recipient, status, metadata,
      outbox_id, campaign_id, error_code, error_message,
      sent_at, delivered_at, read_at
    ) VALUES (
      p_data->>'channel', p_data->>'recipient', p_data->>'status',
      COALESCE((p_data->>'metadata')::jsonb, '{}'),
      NULLIF(p_data->>'outbox_id', '')::uuid,
      NULLIF(p_data->>'campaign_id', '')::uuid,
      NULLIF(p_data->>'error_code', ''),
      NULLIF(p_data->>'error_message', ''),
      NULLIF(p_data->>'sent_at', '')::timestamptz,
      NULLIF(p_data->>'delivered_at', '')::timestamptz,
      NULLIF(p_data->>'read_at', '')::timestamptz
    );
  ELSE
    INSERT INTO marketing.delivery_logs (
      openclaw_message_id, channel, recipient, status, metadata,
      outbox_id, campaign_id, error_code, error_message,
      sent_at, delivered_at, read_at
    ) VALUES (
      v_msg_id,
      p_data->>'channel', p_data->>'recipient', p_data->>'status',
      COALESCE((p_data->>'metadata')::jsonb, '{}'),
      NULLIF(p_data->>'outbox_id', '')::uuid,
      NULLIF(p_data->>'campaign_id', '')::uuid,
      NULLIF(p_data->>'error_code', ''),
      NULLIF(p_data->>'error_message', ''),
      NULLIF(p_data->>'sent_at', '')::timestamptz,
      NULLIF(p_data->>'delivered_at', '')::timestamptz,
      NULLIF(p_data->>'read_at', '')::timestamptz
    )
    ON CONFLICT (openclaw_message_id) WHERE openclaw_message_id IS NOT NULL
    DO UPDATE SET
      status        = EXCLUDED.status,
      error_code    = EXCLUDED.error_code,
      error_message = EXCLUDED.error_message,
      sent_at       = COALESCE(EXCLUDED.sent_at,      marketing.delivery_logs.sent_at),
      delivered_at  = COALESCE(EXCLUDED.delivered_at, marketing.delivery_logs.delivered_at),
      read_at       = COALESCE(EXCLUDED.read_at,      marketing.delivery_logs.read_at),
      updated_at    = pg_catalog.now();
  END IF;
END; $function$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Triggers
-- ═══════════════════════════════════════════════════════════════════════════════
-- Production has 7 triggers across these tables. Only 6 are created:
-- `tg_audit_outbox` is OMITTED because it calls the dead fn_audit_outbox(), which is
-- what makes every INSERT into public.outbox fail in production today.
-- Omitting it here does NOT fix production — it stops the fresh-replay database from
-- being born broken. The production defect needs its own fix.

drop trigger if exists tg_outbox_updated_at on public.outbox;
create trigger tg_outbox_updated_at before update on public.outbox
  for each row execute function public.fn_outbox_set_updated_at();

drop trigger if exists tg_outbox_suppression_check on public.outbox;
create trigger tg_outbox_suppression_check before insert on public.outbox
  for each row execute function public.fn_outbox_suppression_check();

drop trigger if exists event_stakeholders_set_updated_at on public.event_stakeholders;
create trigger event_stakeholders_set_updated_at before update on public.event_stakeholders
  for each row execute function public.set_updated_at();

drop trigger if exists event_vendors_set_updated_at on public.event_vendors;
create trigger event_vendors_set_updated_at before update on public.event_vendors
  for each row execute function public.set_updated_at();

drop trigger if exists event_promo_codes_set_updated_at on public.event_promo_codes;
create trigger event_promo_codes_set_updated_at before update on public.event_promo_codes
  for each row execute function public.set_updated_at();

drop trigger if exists event_attendee_profiles_set_updated_at on public.event_attendee_profiles;
create trigger event_attendee_profiles_set_updated_at before update on public.event_attendee_profiles
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Row level security
-- ═══════════════════════════════════════════════════════════════════════════════
-- Matches production: RLS enabled, NOT forced, on all 8 tables.
-- Table-level grants are left to the project's default privileges, which already
-- grant anon/authenticated/service_role on new public tables and are what produced
-- production's ACLs. Adding explicit GRANTs here would risk over-granting.

alter table public.outbox enable row level security;
alter table public.event_stakeholders enable row level security;
alter table public.event_vendors enable row level security;
alter table public.event_promo_codes enable row level security;
alter table public.event_order_refunds enable row level security;
alter table public.suppression_list enable row level security;
alter table public.event_attendee_profiles enable row level security;
alter table public.delivery_receipts enable row level security;

-- ── outbox ────────────────────────────────────────────────────────────────────

drop policy if exists outbox_auth_select on public.outbox;
create policy outbox_auth_select on public.outbox
  for select to authenticated using (is_admin());

drop policy if exists outbox_no_anon on public.outbox;
create policy outbox_no_anon on public.outbox
  for all to anon using (false) with check (false);

-- ── suppression_list ──────────────────────────────────────────────────────────

drop policy if exists "admin reads suppression_list" on public.suppression_list;
create policy "admin reads suppression_list" on public.suppression_list
  for select to authenticated using (is_admin());

drop policy if exists "anon blocked" on public.suppression_list;
create policy "anon blocked" on public.suppression_list
  for all to anon using (false) with check (false);

drop policy if exists "service role manages suppression_list" on public.suppression_list;
create policy "service role manages suppression_list" on public.suppression_list
  for all to service_role using (true) with check (true);

-- ── event_stakeholders ────────────────────────────────────────────────────────

drop policy if exists stakeholders_select on public.event_stakeholders;
create policy stakeholders_select on public.event_stakeholders
  for select to public using (
    (exists ( select 1
       from events e
      where ((e.id = event_stakeholders.event_id) and (e.organizer_id = ( select auth.uid() as uid)))))
    or (user_id = ( select auth.uid() as uid))
    or (exists ( select 1
       from event_stakeholders peer
      where ((peer.event_id = event_stakeholders.event_id) and (peer.user_id = ( select auth.uid() as uid)))))
  );

drop policy if exists stakeholders_organizer_write on public.event_stakeholders;
create policy stakeholders_organizer_write on public.event_stakeholders
  for insert to public with check (
    (exists ( select 1
       from events e
      where ((e.id = event_stakeholders.event_id) and (e.organizer_id = ( select auth.uid() as uid)))))
  );

drop policy if exists stakeholders_organizer_update on public.event_stakeholders;
create policy stakeholders_organizer_update on public.event_stakeholders
  for update to public using (
    (exists ( select 1
       from events e
      where ((e.id = event_stakeholders.event_id) and (e.organizer_id = ( select auth.uid() as uid)))))
  );

drop policy if exists stakeholders_organizer_delete on public.event_stakeholders;
create policy stakeholders_organizer_delete on public.event_stakeholders
  for delete to public using (
    (exists ( select 1
       from events e
      where ((e.id = event_stakeholders.event_id) and (e.organizer_id = ( select auth.uid() as uid)))))
  );

-- ── event_vendors ─────────────────────────────────────────────────────────────

drop policy if exists vendors_select on public.event_vendors;
create policy vendors_select on public.event_vendors
  for select to public using (
    (exists ( select 1
       from events e
      where ((e.id = event_vendors.event_id) and (e.organizer_id = ( select auth.uid() as uid)))))
    or (exists ( select 1
       from event_stakeholders s
      where ((s.event_id = event_vendors.event_id) and (s.user_id = ( select auth.uid() as uid))
         and (s.role = any (array['co_producer'::text, 'planner'::text])))))
  );

drop policy if exists vendors_organizer_write on public.event_vendors;
create policy vendors_organizer_write on public.event_vendors
  for insert to public with check (
    (exists ( select 1
       from events e
      where ((e.id = event_vendors.event_id) and (e.organizer_id = ( select auth.uid() as uid)))))
  );

drop policy if exists vendors_organizer_update on public.event_vendors;
create policy vendors_organizer_update on public.event_vendors
  for update to public using (
    (exists ( select 1
       from events e
      where ((e.id = event_vendors.event_id) and (e.organizer_id = ( select auth.uid() as uid)))))
  );

drop policy if exists vendors_organizer_delete on public.event_vendors;
create policy vendors_organizer_delete on public.event_vendors
  for delete to public using (
    (exists ( select 1
       from events e
      where ((e.id = event_vendors.event_id) and (e.organizer_id = ( select auth.uid() as uid)))))
  );

-- ── event_promo_codes ─────────────────────────────────────────────────────────

drop policy if exists promo_codes_organizer_all on public.event_promo_codes;
create policy promo_codes_organizer_all on public.event_promo_codes
  for all to public
  using (
    (exists ( select 1
       from events e
      where ((e.id = event_promo_codes.event_id) and (e.organizer_id = ( select auth.uid() as uid)))))
  )
  with check (
    (exists ( select 1
       from events e
      where ((e.id = event_promo_codes.event_id) and (e.organizer_id = ( select auth.uid() as uid)))))
  );

drop policy if exists promo_codes_public_select on public.event_promo_codes;
create policy promo_codes_public_select on public.event_promo_codes
  for select to public using (
    (exists ( select 1
       from events e
      where ((e.id = event_promo_codes.event_id) and (e.status = any (array['published'::text, 'live'::text])))))
    and ((starts_at is null) or (starts_at <= now()))
    and ((expires_at is null) or (expires_at >= now()))
    and (usage_count < coalesce(max_usages, 2147483647))
  );

-- ── event_order_refunds ───────────────────────────────────────────────────────

drop policy if exists refunds_buyer_select on public.event_order_refunds;
create policy refunds_buyer_select on public.event_order_refunds
  for select to public using (
    (exists ( select 1
       from event_orders o
      where ((o.id = event_order_refunds.order_id) and (o.buyer_user_id = ( select auth.uid() as uid)))))
  );

drop policy if exists refunds_organizer_select on public.event_order_refunds;
create policy refunds_organizer_select on public.event_order_refunds
  for select to public using (
    (exists ( select 1
       from event_orders o
       join events e on ((e.id = o.event_id))
      where ((o.id = event_order_refunds.order_id) and (e.organizer_id = ( select auth.uid() as uid)))))
  );

-- ── event_attendee_profiles ───────────────────────────────────────────────────

drop policy if exists profiles_via_attendee on public.event_attendee_profiles;
create policy profiles_via_attendee on public.event_attendee_profiles
  for select to public using (
    (exists ( select 1
       from event_attendees a
       join event_orders o on ((o.id = a.order_id))
      where ((a.id = event_attendee_profiles.attendee_id)
         and ((o.buyer_user_id = ( select auth.uid() as uid))
           or (exists ( select 1
                 from events e
                where ((e.id = o.event_id) and (e.organizer_id = ( select auth.uid() as uid)))))))))
  );

-- ── delivery_receipts ─────────────────────────────────────────────────────────

drop policy if exists delivery_receipts_service_role_only on public.delivery_receipts;
create policy delivery_receipts_service_role_only on public.delivery_receipts
  for all to service_role using (true) with check (true);
