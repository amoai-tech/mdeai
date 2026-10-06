-- =============================================================================
-- Migration: 20261006130200_new_projects_conversion.sql
-- Task:      SAN-1385 · Build the Safe Data Foundation for New Condo Projects,
--            Leads, and Commissions
-- =============================================================================
-- Commercial truth for the New Projects conversion loop:
--   * partner_commission_agreements   — versioned, project-scoped terms (never a
--                                       hard-coded universal percentage)
--   * developer_lead_registrations    — immutable attribution snapshot + sale
--                                       progression (decision D3)
--   * commission_claims               — earned/due/paid workflow on top of the
--                                       one canonical revenue_ledger
--   * leads.listing_kind fail-closed + New Projects ownership alignment
--   * generic bookings support for new_project_consultation
--   * four deterministic, idempotent transactions
--
-- Depends on: 20261006130000_new_projects_enums.sql (committed),
--             20261006130100_new_projects_core.sql
-- Replay-safe: create ... if not exists; create or replace; drop ... if exists.
-- =============================================================================

begin;

-- ── partner_commission_agreements ────────────────────────────────────────────
create table if not exists public.partner_commission_agreements (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete restrict,
  project_id uuid references public.development_projects (id) on delete set null,
  version integer not null default 1 check (version >= 1),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'superseded', 'expired', 'canceled')),
  effective_from date,
  effective_to date,
  commission_type text not null check (commission_type in ('percentage', 'fixed')),
  commission_value numeric(14, 4) not null check (commission_value >= 0),
  currency text not null default 'COP' check (char_length(currency) = 3),
  calculation_basis text,
  registration_required boolean not null default true,
  protection_days integer check (protection_days is null or protection_days >= 0),
  existing_client_rule text,
  commission_trigger text,
  payment_delay_days integer check (payment_delay_days is null or payment_delay_days >= 0),
  vat_terms text,
  cancellation_terms text,
  clawback_terms text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_commission_agreements_dates_check check (
    effective_to is null or effective_from is null or effective_to >= effective_from
  ),
  constraint partner_commission_agreements_percentage_check check (
    commission_type <> 'percentage' or commission_value <= 100
  )
);

comment on table public.partner_commission_agreements is
  'SAN-1385: versioned developer commission terms. The accepted registration snapshots the exact version; never assume a universal percentage or trigger.';

-- One active agreement per partner + project scope (global scope keyed by the nil uuid).
create unique index if not exists partner_commission_agreements_one_active
  on public.partner_commission_agreements (
    partner_id,
    coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'active';

create index if not exists idx_partner_commission_agreements_partner
  on public.partner_commission_agreements (partner_id, status);
create index if not exists idx_partner_commission_agreements_project
  on public.partner_commission_agreements (project_id)
  where project_id is not null;

drop trigger if exists partner_commission_agreements_set_updated_at
  on public.partner_commission_agreements;
create trigger partner_commission_agreements_set_updated_at
  before update on public.partner_commission_agreements
  for each row execute function public.set_updated_at();

-- ── developer_lead_registrations ─────────────────────────────────────────────
create table if not exists public.developer_lead_registrations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  project_id uuid not null references public.development_projects (id) on delete restrict,
  partner_id uuid not null references public.partners (id) on delete restrict,
  agreement_id uuid references public.partner_commission_agreements (id) on delete restrict,
  agreement_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'expired', 'canceled')),
  sales_stage text
    check (sales_stage is null or sales_stage in (
      'contacted', 'appointment_completed', 'interested', 'reserved',
      'promesa', 'financing_closing', 'deed_closed_won', 'lost', 'canceled'
    )),
  registered_at timestamptz not null default now(),
  accepted_at timestamptz,
  rejected_at timestamptz,
  protection_expires_at timestamptz,
  developer_reference text,
  rejection_reason text,
  rejection_evidence jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint developer_lead_registrations_lead_project_key unique (lead_id, project_id),
  constraint developer_lead_registrations_lead_idem_key unique (lead_id, idempotency_key),
  constraint developer_lead_registrations_stage_requires_acceptance_check check (
    sales_stage is null or status in ('accepted', 'canceled')
  )
);

comment on table public.developer_lead_registrations is
  'SAN-1385: accepted attribution is immutable and carries the exact agreement snapshot. sales_stage is the canonical property-sale progression (D3), separate from leads.status.';

create index if not exists idx_developer_lead_registrations_partner
  on public.developer_lead_registrations (partner_id, status, created_at desc);
create index if not exists idx_developer_lead_registrations_project
  on public.developer_lead_registrations (project_id);
create index if not exists idx_developer_lead_registrations_lead
  on public.developer_lead_registrations (lead_id);

drop trigger if exists developer_lead_registrations_set_updated_at
  on public.developer_lead_registrations;
create trigger developer_lead_registrations_set_updated_at
  before update on public.developer_lead_registrations
  for each row execute function public.set_updated_at();

-- ── commission_claims ────────────────────────────────────────────────────────
create table if not exists public.commission_claims (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.developer_lead_registrations (id) on delete restrict,
  agreement_id uuid references public.partner_commission_agreements (id) on delete restrict,
  partner_id uuid not null references public.partners (id) on delete restrict,
  project_id uuid references public.development_projects (id) on delete set null,
  sale_price_cents bigint check (sale_price_cents is null or sale_price_cents >= 0),
  currency text not null default 'COP' check (char_length(currency) = 3),
  commission_cents bigint check (commission_cents is null or commission_cents >= 0),
  calculation_basis text,
  claim_state text not null default 'pending_trigger'
    check (claim_state in (
      'pending_trigger', 'earned', 'invoiced', 'due', 'paid', 'disputed', 'canceled'
    )),
  trigger_evidence jsonb not null default '{}'::jsonb,
  trigger_reached_at timestamptz,
  invoiced_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  revenue_ledger_id uuid references public.revenue_ledger (id) on delete set null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_claims_one_per_registration unique (registration_id)
);

comment on table public.commission_claims is
  'SAN-1385: mutable commission/payment workflow. commission_cents is calculated server-side from the captured agreement; revenue_ledger remains the only financial ledger.';

create index if not exists idx_commission_claims_partner
  on public.commission_claims (partner_id, claim_state, created_at desc);
create index if not exists idx_commission_claims_registration
  on public.commission_claims (registration_id);

-- ── developer_lead_registration_stage_events (sale-stage audit) ──────────────
create table if not exists public.developer_lead_registration_stage_events (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null
    references public.developer_lead_registrations (id) on delete cascade,
  from_stage text,
  to_stage text not null,
  actor_id uuid,
  evidence jsonb not null default '{}'::jsonb,
  -- clock_timestamp(), not now(): now() is constant within a transaction, so two
  -- stage changes in one transaction would not be orderable.
  created_at timestamptz not null default clock_timestamp()
);

comment on table public.developer_lead_registration_stage_events is
  'SAN-1385: append-only audit of every sale-stage change (actor, from/to stage, evidence). Written by advance_developer_registration_stage().';

create index if not exists idx_stage_events_registration
  on public.developer_lead_registration_stage_events (registration_id, created_at desc);

drop trigger if exists commission_claims_set_updated_at on public.commission_claims;
create trigger commission_claims_set_updated_at
  before update on public.commission_claims
  for each row execute function public.set_updated_at();

-- ── sale progression + attribution immutability ──────────────────────────────
create or replace function public.validate_developer_registration_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_allowed_statuses text[];
  v_allowed_stages text[];
begin
  if new.lead_id is distinct from old.lead_id
    or new.project_id is distinct from old.project_id
    or new.partner_id is distinct from old.partner_id then
    raise exception 'developer registration attribution is immutable' using errcode = 'check_violation';
  end if;

  if old.status = 'accepted'
    and (new.agreement_id is distinct from old.agreement_id
      or new.agreement_snapshot is distinct from old.agreement_snapshot
      or new.accepted_at is distinct from old.accepted_at) then
    raise exception 'accepted registration commercial snapshot is immutable' using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status then
    v_allowed_statuses := case old.status
      when 'pending' then array['accepted', 'rejected', 'expired', 'canceled']
      when 'accepted' then array['canceled']
      else array[]::text[]
    end;
    if not (new.status = any (v_allowed_statuses)) then
      raise exception 'invalid developer registration transition: % -> %', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;

  if new.sales_stage is distinct from old.sales_stage then
    if new.status <> 'accepted' then
      raise exception 'sale progression requires an accepted registration' using errcode = 'check_violation';
    end if;
    v_allowed_stages := case
      when old.sales_stage is null then array['contacted', 'lost', 'canceled']
      when old.sales_stage = 'contacted' then array['appointment_completed', 'interested', 'lost', 'canceled']
      when old.sales_stage = 'appointment_completed' then array['interested', 'lost', 'canceled']
      when old.sales_stage = 'interested' then array['reserved', 'lost', 'canceled']
      when old.sales_stage = 'reserved' then array['promesa', 'lost', 'canceled']
      when old.sales_stage = 'promesa' then array['financing_closing', 'deed_closed_won', 'lost', 'canceled']
      when old.sales_stage = 'financing_closing' then array['deed_closed_won', 'lost', 'canceled']
      else array[]::text[]
    end;
    if not (new.sales_stage = any (v_allowed_stages)) then
      raise exception 'invalid sale stage transition: % -> %', coalesce(old.sales_stage, '(none)'), new.sales_stage
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_developer_registration_transition
  on public.developer_lead_registrations;
create trigger validate_developer_registration_transition
  before update on public.developer_lead_registrations
  for each row execute function public.validate_developer_registration_transition();

create or replace function public.validate_commission_claim_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_allowed text[];
begin
  if old.revenue_ledger_id is not null
    and new.revenue_ledger_id is distinct from old.revenue_ledger_id then
    raise exception 'commission claim ledger link is immutable' using errcode = 'check_violation';
  end if;
  if old.claim_state = 'paid' and new.claim_state is distinct from old.claim_state then
    raise exception 'paid commission claim is terminal' using errcode = 'check_violation';
  end if;
  if new.claim_state is distinct from old.claim_state then
    v_allowed := case old.claim_state
      when 'pending_trigger' then array['earned', 'canceled']
      when 'earned' then array['invoiced', 'disputed', 'canceled']
      when 'invoiced' then array['due', 'paid', 'disputed']
      when 'due' then array['paid', 'disputed']
      when 'disputed' then array['earned', 'invoiced', 'due', 'paid', 'canceled']
      when 'paid' then array[]::text[]
      else array[]::text[]
    end;
    if not (new.claim_state = any (v_allowed)) then
      raise exception 'invalid commission claim transition: % -> %', old.claim_state, new.claim_state
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_commission_claim_transition on public.commission_claims;
create trigger validate_commission_claim_transition
  before update on public.commission_claims
  for each row execute function public.validate_commission_claim_transition();

-- ── leads: fail-closed listing kind + New Projects ownership alignment ───────
alter table public.leads drop constraint if exists leads_listing_kind_check;
alter table public.leads add constraint leads_listing_kind_check
  check (listing_kind is null or listing_kind in ('apartment', 'development_project'));

create or replace function public.lead_listing_owner_aligned(
  p_partner_id uuid,
  p_listing_kind text,
  p_listing_id uuid,
  p_apartment_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when p_listing_kind is null then public.lead_partner_listing_aligned(p_partner_id, p_apartment_id)
    when p_listing_kind = 'apartment' then public.lead_partner_listing_aligned(p_partner_id, p_apartment_id)
    when p_listing_kind = 'development_project' then (
      p_apartment_id is null
      and exists (
        select 1
        from public.development_projects dp
        where dp.id = p_listing_id
          and dp.partner_id = p_partner_id
          and dp.ownership_status = 'claimed'
      )
    )
    else false
  end;
$$;

comment on function public.lead_listing_owner_aligned(uuid, text, uuid, uuid) is
  'SAN-1385 §4.2: partner/listing alignment. apartment and legacy null kinds use the apartment bridge; development_project requires a claimed project owned by the same partner; any other kind fails closed.';

drop policy if exists leads_select_partner_member on public.leads;
create policy leads_select_partner_member
  on public.leads for select to authenticated
  using (
    partner_id in (select public.partner_ids_for_user())
    and public.lead_listing_owner_aligned(partner_id, listing_kind, listing_id, apartment_id)
  );

drop policy if exists leads_update_partner_member on public.leads;
create policy leads_update_partner_member
  on public.leads for update to authenticated
  using (
    partner_id in (select public.partner_ids_for_user())
    and public.lead_listing_owner_aligned(partner_id, listing_kind, listing_id, apartment_id)
  )
  with check (
    partner_id in (select public.partner_ids_for_user())
    and public.lead_listing_owner_aligned(partner_id, listing_kind, listing_id, apartment_id)
  );

-- ── bookings: New Projects consultation validation + idempotency ─────────────
create or replace function public.bookings_validate_event_resource()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.booking_type = 'event' then
    if new.resource_id is null then
      raise exception 'event booking requires resource_id';
    end if;
    if new.partner_id is null then
      raise exception 'event booking requires partner_id';
    end if;
    if not exists (
      select 1
      from public.partner_locations pl
      join public.partners p on p.id = pl.partner_id
      where pl.id = new.resource_id
        and pl.accepts_event_bookings
        and pl.is_verified
        and p.status = 'active'
        and p.id = new.partner_id
    ) then
      raise exception
        'bookings.resource_id % must be a verified event-capable partner_location for active partner %',
        new.resource_id, new.partner_id;
    end if;
  elsif new.booking_type = 'new_project_consultation' then
    if new.resource_id is null then
      raise exception 'new project consultation requires resource_id';
    end if;
    if new.partner_id is null then
      raise exception 'new project consultation requires partner_id';
    end if;
    if not exists (
      select 1
      from public.development_projects dp
      where dp.id = new.resource_id
        and dp.partner_id = new.partner_id
        and dp.ownership_status = 'claimed'
        and dp.publish_state = 'published'
    ) then
      raise exception
        'new project consultation requires a published, claimed development_project owned by partner %',
        new.partner_id;
    end if;
  end if;
  return new;
end;
$$;

create unique index if not exists idx_bookings_idempotency_user_new_project
  on public.bookings (user_id, idempotency_key)
  where idempotency_key is not null and booking_type = 'new_project_consultation';

-- ── revenue_ledger: allow the canonical commission source kind ───────────────
alter table public.revenue_ledger drop constraint if exists revenue_ledger_source_kind_check;
alter table public.revenue_ledger add constraint revenue_ledger_source_kind_check
  check (source_kind in ('ticket', 'lead_fee', 'booking', 'subscription', 'sponsorship', 'commission'));

-- ── RPC 1: register buyer atomically ─────────────────────────────────────────
create or replace function public.register_new_project_buyer(
  p_project_id uuid,
  p_idempotency_key text,
  p_qualification jsonb default '{}'::jsonb,
  p_email text default null,
  p_phone text default null,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_project public.development_projects%rowtype;
  v_lead public.leads%rowtype;
  v_reg public.developer_lead_registrations%rowtype;
  v_key text := nullif(btrim(p_idempotency_key), '');
begin
  if v_uid is null then
    raise exception 'register_new_project_buyer: authentication required' using errcode = 'P0001';
  end if;
  if v_key is null or length(v_key) < 8 then
    raise exception 'register_new_project_buyer: idempotency_key required (min 8 chars)' using errcode = 'P0001';
  end if;

  -- Idempotency is stronger than eligibility: a committed request stays replayable.
  select l.* into v_lead
  from public.leads l
  where l.user_id = v_uid and l.idempotency_key = v_key;

  if v_lead.id is not null then
    select r.* into v_reg
    from public.developer_lead_registrations r
    where r.lead_id = v_lead.id and r.project_id = p_project_id;
    if v_reg.id is null then
      raise exception 'register_new_project_buyer: idempotency key reused for a different project'
        using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'lead_id', v_lead.id,
      'registration_id', v_reg.id,
      'status', v_reg.status,
      'idempotent_replay', true
    );
  end if;

  select dp.* into v_project
  from public.development_projects dp
  where dp.id = p_project_id
    and dp.publish_state = 'published'
    and dp.ownership_status = 'claimed'
    and dp.partner_id is not null;

  if v_project.id is null then
    raise exception 'register_new_project_buyer: project is not eligible for registration'
      using errcode = 'P0001';
  end if;

  insert into public.leads (
    user_id, source, email, phone, name, apartment_id,
    listing_kind, listing_id, partner_id, intent, status, pipeline_stage,
    metadata, idempotency_key
  ) values (
    v_uid,
    'new_projects',
    nullif(lower(btrim(p_email)), ''),
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_name), ''),
    null,
    'development_project',
    v_project.id,
    v_project.partner_id,
    'purchase',
    'new',
    'new',
    jsonb_build_object(
      'new_project', jsonb_build_object(
        'project_id', v_project.id,
        'qualification', coalesce(p_qualification, '{}'::jsonb)
      )
    ),
    v_key
  )
  returning * into v_lead;

  -- The agreement is intentionally resolved at acceptance, not registration: a
  -- pending registration may legitimately have no commission terms yet.
  insert into public.developer_lead_registrations (
    lead_id, project_id, partner_id, agreement_id, agreement_snapshot, status, idempotency_key
  ) values (
    v_lead.id,
    v_project.id,
    v_project.partner_id,
    null,
    '{}'::jsonb,
    'pending',
    v_key
  )
  returning * into v_reg;

  return jsonb_build_object(
    'lead_id', v_lead.id,
    'registration_id', v_reg.id,
    'status', v_reg.status,
    'idempotent_replay', false
  );
end;
$$;

-- ── RPC 2: developer accept/reject attribution ───────────────────────────────
create or replace function public.decide_developer_registration(
  p_registration_id uuid,
  p_decision text,
  p_reason text default null,
  p_developer_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_reg public.developer_lead_registrations%rowtype;
  v_agreement public.partner_commission_agreements%rowtype;
  v_days integer;
  v_target text := nullif(btrim(p_decision), '');
begin
  if v_target not in ('accepted', 'rejected') then
    raise exception 'decide_developer_registration: decision must be accepted or rejected'
      using errcode = 'P0001';
  end if;

  select r.* into v_reg
  from public.developer_lead_registrations r
  where r.id = p_registration_id
  for update;

  if v_reg.id is null then
    raise exception 'decide_developer_registration: registration not found' using errcode = 'P0001';
  end if;

  if not (
    (select public.is_admin())
    or exists (
      select 1 from public.partner_members pm
      where pm.partner_id = v_reg.partner_id and pm.profile_id = v_uid
    )
  ) then
    raise exception 'decide_developer_registration: not authorized' using errcode = 'P0001';
  end if;

  -- Retry-safe: an identical repeated decision returns the committed result
  -- instead of erroring; a different decision on a decided registration is invalid.
  if v_reg.status <> 'pending' then
    if v_reg.status = v_target then
      return jsonb_build_object(
        'registration_id', v_reg.id,
        'status', v_reg.status,
        'protection_expires_at', v_reg.protection_expires_at,
        'idempotent_replay', true
      );
    end if;
    raise exception 'decide_developer_registration: registration is not pending' using errcode = 'P0001';
  end if;

  if v_target = 'accepted' then
    -- Freeze the exact active agreement at acceptance. A pending registration may
    -- have had no terms; acceptance resolves and snapshots them exactly once.
    select a.* into v_agreement
    from public.partner_commission_agreements a
    where a.partner_id = v_reg.partner_id
      and a.status = 'active'
      and (a.project_id is null or a.project_id = v_reg.project_id)
      and (a.effective_from is null or a.effective_from <= current_date)
      and (a.effective_to is null or a.effective_to >= current_date)
    order by (a.project_id is not null) desc, a.version desc
    limit 1;

    if v_agreement.id is null then
      raise exception 'decide_developer_registration: no active commission agreement to freeze'
        using errcode = 'P0001';
    end if;

    v_days := v_agreement.protection_days;

    update public.developer_lead_registrations
    set status = 'accepted',
        accepted_at = now(),
        agreement_id = v_agreement.id,
        agreement_snapshot = to_jsonb(v_agreement),
        developer_reference = coalesce(nullif(btrim(p_developer_reference), ''), developer_reference),
        protection_expires_at = case
          when v_days is not null then now() + make_interval(days => v_days)
          else null
        end
    where id = v_reg.id
    returning * into v_reg;
  else
    update public.developer_lead_registrations
    set status = 'rejected',
        rejected_at = now(),
        rejection_reason = nullif(btrim(p_reason), ''),
        rejection_evidence = jsonb_build_object('reason', nullif(btrim(p_reason), ''))
    where id = v_reg.id
    returning * into v_reg;
  end if;

  return jsonb_build_object(
    'registration_id', v_reg.id,
    'status', v_reg.status,
    'protection_expires_at', v_reg.protection_expires_at,
    'idempotent_replay', false
  );
end;
$$;

-- ── sales-stage ordering + dedicated progression RPC ─────────────────────────
create or replace function public.sales_stage_at_least(p_stage text, p_min_stage text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select array_position(
    array['contacted', 'appointment_completed', 'interested', 'reserved',
          'promesa', 'financing_closing', 'deed_closed_won'],
    p_stage
  ) >= array_position(
    array['contacted', 'appointment_completed', 'interested', 'reserved',
          'promesa', 'financing_closing', 'deed_closed_won'],
    p_min_stage
  );
$$;

comment on function public.sales_stage_at_least(text, text) is
  'SAN-1385: true when p_stage is at or beyond p_min_stage in the canonical sale progression.';

create or replace function public.advance_developer_registration_stage(
  p_registration_id uuid,
  p_sales_stage text,
  p_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_reg public.developer_lead_registrations%rowtype;
  v_old_stage text;
  v_target text := nullif(btrim(p_sales_stage), '');
begin
  select r.* into v_reg
  from public.developer_lead_registrations r
  where r.id = p_registration_id
  for update;

  if v_reg.id is null then
    raise exception 'advance_developer_registration_stage: registration not found' using errcode = 'P0001';
  end if;

  if not (
    (select public.is_admin())
    or exists (
      select 1 from public.partner_members pm
      where pm.partner_id = v_reg.partner_id and pm.profile_id = v_uid
    )
  ) then
    raise exception 'advance_developer_registration_stage: not authorized' using errcode = 'P0001';
  end if;

  if v_reg.status <> 'accepted' then
    raise exception 'advance_developer_registration_stage: registration is not accepted' using errcode = 'P0001';
  end if;

  v_old_stage := v_reg.sales_stage;

  update public.developer_lead_registrations
  set sales_stage = v_target
  where id = v_reg.id
  returning * into v_reg;

  insert into public.developer_lead_registration_stage_events (
    registration_id, from_stage, to_stage, actor_id, evidence
  ) values (
    v_reg.id, v_old_stage, v_reg.sales_stage, v_uid, coalesce(p_evidence, '{}'::jsonb)
  );

  return jsonb_build_object(
    'registration_id', v_reg.id,
    'from_stage', v_old_stage,
    'sales_stage', v_reg.sales_stage
  );
end;
$$;

-- ── RPC 3: book one sales consultation ───────────────────────────────────────
create or replace function public.book_new_project_consultation(
  p_project_id uuid,
  p_registration_id uuid,
  p_start_date date,
  p_start_time time,
  p_idempotency_key text,
  p_end_time time default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_project public.development_projects%rowtype;
  v_reg public.developer_lead_registrations%rowtype;
  v_booking public.bookings%rowtype;
  v_key text := nullif(btrim(p_idempotency_key), '');
begin
  if v_uid is null then
    raise exception 'book_new_project_consultation: authentication required' using errcode = 'P0001';
  end if;
  if v_key is null or length(v_key) < 8 then
    raise exception 'book_new_project_consultation: idempotency_key required (min 8 chars)'
      using errcode = 'P0001';
  end if;
  if p_start_date is null or p_start_time is null then
    raise exception 'book_new_project_consultation: start date and time required' using errcode = 'P0001';
  end if;

  -- Idempotent replay first.
  select b.* into v_booking
  from public.bookings b
  where b.user_id = v_uid
    and b.idempotency_key = v_key
    and b.booking_type = 'new_project_consultation';

  if v_booking.id is not null then
    return jsonb_build_object(
      'booking_id', v_booking.id,
      'status', v_booking.status,
      'idempotent_replay', true
    );
  end if;

  select r.* into v_reg
  from public.developer_lead_registrations r
  join public.leads l on l.id = r.lead_id
  where r.id = p_registration_id
    and r.project_id = p_project_id
    and l.user_id = v_uid
    and r.status = 'accepted';

  if v_reg.id is null then
    raise exception 'book_new_project_consultation: an accepted registration for this buyer and project is required'
      using errcode = 'P0001';
  end if;

  select dp.* into v_project
  from public.development_projects dp
  where dp.id = p_project_id
    and dp.publish_state = 'published'
    and dp.ownership_status = 'claimed'
    and dp.partner_id = v_reg.partner_id;

  if v_project.id is null then
    raise exception 'book_new_project_consultation: project is not eligible for a consultation'
      using errcode = 'P0001';
  end if;

  insert into public.bookings (
    user_id, booking_type, resource_id, resource_title, status,
    start_date, start_time, end_time, partner_id, partner_status,
    notes, metadata, idempotency_key
  ) values (
    v_uid,
    'new_project_consultation',
    v_project.id,
    v_project.name,
    'pending',
    p_start_date,
    p_start_time,
    p_end_time,
    v_project.partner_id,
    'pending',
    nullif(btrim(p_notes), ''),
    jsonb_build_object('registration_id', v_reg.id, 'project_id', v_project.id),
    v_key
  )
  returning * into v_booking;

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'status', v_booking.status,
    'idempotent_replay', false
  );
end;
$$;

-- ── RPC 4: post a commission claim + one ledger entry ────────────────────────
create or replace function public.post_new_project_commission(
  p_registration_id uuid,
  p_sale_price_cents bigint,
  p_idempotency_key text,
  p_trigger_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_reg public.developer_lead_registrations%rowtype;
  v_claim public.commission_claims%rowtype;
  v_ledger public.revenue_ledger%rowtype;
  v_key text := nullif(btrim(p_idempotency_key), '');
  v_type text;
  v_value numeric;
  v_currency text;
  v_basis text;
  v_trigger text;
  v_min_stage text;
  v_cents bigint;
begin
  if not (v_uid is null or (select public.is_admin())) then
    raise exception 'post_new_project_commission: admin or service role required' using errcode = 'P0001';
  end if;
  if p_sale_price_cents is null or p_sale_price_cents < 0 then
    raise exception 'post_new_project_commission: non-negative sale price required' using errcode = 'P0001';
  end if;
  if v_key is null or length(v_key) < 8 then
    raise exception 'post_new_project_commission: idempotency_key required (min 8 chars)'
      using errcode = 'P0001';
  end if;

  select r.* into v_reg
  from public.developer_lead_registrations r
  where r.id = p_registration_id
  for update;

  if v_reg.id is null then
    raise exception 'post_new_project_commission: registration not found' using errcode = 'P0001';
  end if;
  if v_reg.status <> 'accepted' then
    raise exception 'post_new_project_commission: registration is not accepted' using errcode = 'P0001';
  end if;

  select c.* into v_claim
  from public.commission_claims c
  where c.registration_id = v_reg.id;

  if v_claim.id is not null and v_claim.revenue_ledger_id is not null then
    return jsonb_build_object(
      'claim_id', v_claim.id,
      'claim_state', v_claim.claim_state,
      'commission_cents', v_claim.commission_cents,
      'revenue_ledger_id', v_claim.revenue_ledger_id,
      'idempotent_replay', true
    );
  end if;

  -- Frozen terms only: never fall back to today's agreement. An accepted
  -- registration must carry the exact snapshot frozen by decide_developer_registration.
  if v_reg.agreement_id is null
    or v_reg.agreement_snapshot is null
    or v_reg.agreement_snapshot = '{}'::jsonb then
    raise exception 'post_new_project_commission: accepted registration has no frozen commission agreement'
      using errcode = 'P0001';
  end if;

  v_type := v_reg.agreement_snapshot ->> 'commission_type';
  v_value := nullif(v_reg.agreement_snapshot ->> 'commission_value', '')::numeric;
  v_currency := coalesce(v_reg.agreement_snapshot ->> 'currency', 'COP');
  v_basis := v_reg.agreement_snapshot ->> 'calculation_basis';

  if v_type is null or v_value is null then
    raise exception 'post_new_project_commission: frozen agreement is missing commission terms'
      using errcode = 'P0001';
  end if;

  -- Enforce the agreement's configured earning trigger against the canonical
  -- sale stage. Arbitrary JSON evidence is never proof that the trigger happened.
  v_trigger := lower(coalesce(v_reg.agreement_snapshot ->> 'commission_trigger', ''));
  v_min_stage := case
    when v_trigger in ('reservation', 'reserved', 'reserve', 'reserva') then 'reserved'
    when v_trigger in ('promesa', 'promise') then 'promesa'
    when v_trigger in ('financing', 'closing', 'financing_closing') then 'financing_closing'
    when v_trigger in ('deed', 'deed_closed_won', 'escritura', 'closed_won') then 'deed_closed_won'
    else null
  end;
  if v_min_stage is null then
    raise exception 'post_new_project_commission: frozen agreement has no supported commission_trigger'
      using errcode = 'P0001';
  end if;
  if v_reg.sales_stage is null
    or not public.sales_stage_at_least(v_reg.sales_stage, v_min_stage) then
    raise exception 'post_new_project_commission: commission trigger % not reached (stage %)',
      v_trigger, coalesce(v_reg.sales_stage, '(none)')
      using errcode = 'P0001';
  end if;

  if v_type = 'percentage' then
    v_cents := round(p_sale_price_cents * v_value / 100)::bigint;
  else
    v_cents := round(v_value * 100)::bigint;
  end if;

  if v_claim.id is null then
    insert into public.commission_claims (
      registration_id, agreement_id, partner_id, project_id,
      sale_price_cents, currency, commission_cents, calculation_basis,
      claim_state, trigger_evidence, trigger_reached_at, idempotency_key
    ) values (
      v_reg.id, v_reg.agreement_id, v_reg.partner_id, v_reg.project_id,
      p_sale_price_cents, v_currency, v_cents, v_basis,
      'earned', coalesce(p_trigger_evidence, '{}'::jsonb), now(), v_key
    )
    returning * into v_claim;
  else
    update public.commission_claims
    set sale_price_cents = p_sale_price_cents,
        currency = v_currency,
        commission_cents = v_cents,
        calculation_basis = v_basis,
        claim_state = 'earned',
        trigger_evidence = coalesce(p_trigger_evidence, '{}'::jsonb),
        trigger_reached_at = now()
    where id = v_claim.id
    returning * into v_claim;
  end if;

  insert into public.revenue_ledger (
    partner_id, source_kind, source_id, amount_cents, currency,
    platform_fee_cents, idempotency_key, metadata
  ) values (
    v_reg.partner_id, 'commission', v_claim.id, v_cents, v_currency,
    0, 'new_project_commission:' || v_claim.id::text,
    jsonb_build_object('registration_id', v_reg.id, 'claim_id', v_claim.id, 'project_id', v_reg.project_id)
  )
  on conflict (idempotency_key) do nothing
  returning * into v_ledger;

  if v_ledger.id is null then
    select l.* into v_ledger
    from public.revenue_ledger l
    where l.idempotency_key = 'new_project_commission:' || v_claim.id::text;
  end if;

  update public.commission_claims
  set revenue_ledger_id = v_ledger.id
  where id = v_claim.id and revenue_ledger_id is null
  returning * into v_claim;

  return jsonb_build_object(
    'claim_id', v_claim.id,
    'claim_state', v_claim.claim_state,
    'commission_cents', v_claim.commission_cents,
    'revenue_ledger_id', v_ledger.id,
    'idempotent_replay', false
  );
end;
$$;

-- ── RLS for conversion tables ────────────────────────────────────────────────
alter table public.partner_commission_agreements enable row level security;
alter table public.developer_lead_registrations enable row level security;
alter table public.commission_claims enable row level security;

-- agreements: partner members read/manage their own; admin all.
drop policy if exists partner_commission_agreements_select_partner_member on public.partner_commission_agreements;
create policy partner_commission_agreements_select_partner_member
  on public.partner_commission_agreements for select to authenticated
  using (partner_id in (select public.partner_ids_for_user()));

drop policy if exists partner_commission_agreements_insert_partner_member on public.partner_commission_agreements;
create policy partner_commission_agreements_insert_partner_member
  on public.partner_commission_agreements for insert to authenticated
  with check (partner_id in (select public.partner_ids_for_user()));

drop policy if exists partner_commission_agreements_update_partner_member on public.partner_commission_agreements;
create policy partner_commission_agreements_update_partner_member
  on public.partner_commission_agreements for update to authenticated
  using (partner_id in (select public.partner_ids_for_user()))
  with check (partner_id in (select public.partner_ids_for_user()));

drop policy if exists partner_commission_agreements_admin on public.partner_commission_agreements;
create policy partner_commission_agreements_admin
  on public.partner_commission_agreements for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists partner_commission_agreements_service_role on public.partner_commission_agreements;
create policy partner_commission_agreements_service_role
  on public.partner_commission_agreements for all to service_role
  using (true) with check (true);

-- registrations: buyer reads own; partner member reads/updates own; admin all.
drop policy if exists developer_lead_registrations_select_buyer on public.developer_lead_registrations;
create policy developer_lead_registrations_select_buyer
  on public.developer_lead_registrations for select to authenticated
  using (exists (
    select 1 from public.leads l
    where l.id = developer_lead_registrations.lead_id
      and l.user_id = (select auth.uid())
  ));

drop policy if exists developer_lead_registrations_select_partner_member on public.developer_lead_registrations;
create policy developer_lead_registrations_select_partner_member
  on public.developer_lead_registrations for select to authenticated
  using (partner_id in (select public.partner_ids_for_user()));

-- Direct UPDATE is intentionally not exposed. Decisions and sale-stage changes go
-- through decide_developer_registration() / advance_developer_registration_stage(),
-- which enforce authorization and write the audit trail. authenticated has SELECT
-- only, so a forged direct UPDATE is denied at the object gate.
drop policy if exists developer_lead_registrations_update_partner_member on public.developer_lead_registrations;

drop policy if exists developer_lead_registrations_admin on public.developer_lead_registrations;
create policy developer_lead_registrations_admin
  on public.developer_lead_registrations for select to authenticated
  using ((select public.is_admin()));

drop policy if exists developer_lead_registrations_service_role on public.developer_lead_registrations;
create policy developer_lead_registrations_service_role
  on public.developer_lead_registrations for all to service_role
  using (true) with check (true);

-- claims: partner members and admin read; writes go through the RPC only.
drop policy if exists commission_claims_select_partner_member on public.commission_claims;
create policy commission_claims_select_partner_member
  on public.commission_claims for select to authenticated
  using (partner_id in (select public.partner_ids_for_user()));

drop policy if exists commission_claims_admin on public.commission_claims;
create policy commission_claims_admin
  on public.commission_claims for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists commission_claims_service_role on public.commission_claims;
create policy commission_claims_service_role
  on public.commission_claims for all to service_role
  using (true) with check (true);

-- stage events: partner members read their own registrations' history; writes only
-- through advance_developer_registration_stage() (SECURITY DEFINER).
alter table public.developer_lead_registration_stage_events enable row level security;

drop policy if exists stage_events_select_partner_member on public.developer_lead_registration_stage_events;
create policy stage_events_select_partner_member
  on public.developer_lead_registration_stage_events for select to authenticated
  using (exists (
    select 1 from public.developer_lead_registrations r
    where r.id = developer_lead_registration_stage_events.registration_id
      and r.partner_id in (select public.partner_ids_for_user())
  ));

drop policy if exists stage_events_admin on public.developer_lead_registration_stage_events;
create policy stage_events_admin
  on public.developer_lead_registration_stage_events for select to authenticated
  using ((select public.is_admin()));

drop policy if exists stage_events_service_role on public.developer_lead_registration_stage_events;
create policy stage_events_service_role
  on public.developer_lead_registration_stage_events for all to service_role
  using (true) with check (true);

-- ── grants ───────────────────────────────────────────────────────────────────
-- Revoke the broad schema-default privileges first, then grant only what the app
-- exposes. RLS is the row gate; these grants are the object gate.
revoke all on table public.partner_commission_agreements from anon, authenticated;
grant select, insert, update on table public.partner_commission_agreements to authenticated;
grant all on table public.partner_commission_agreements to service_role;

revoke all on table public.developer_lead_registrations from anon, authenticated;
grant select on table public.developer_lead_registrations to authenticated;
grant all on table public.developer_lead_registrations to service_role;

revoke all on table public.commission_claims from anon, authenticated;
grant select on table public.commission_claims to authenticated;
grant all on table public.commission_claims to service_role;

revoke all on table public.developer_lead_registration_stage_events from anon, authenticated;
grant select on table public.developer_lead_registration_stage_events to authenticated;
grant all on table public.developer_lead_registration_stage_events to service_role;

-- ── function ACLs ────────────────────────────────────────────────────────────
revoke execute on function public.lead_listing_owner_aligned(uuid, text, uuid, uuid) from public;
grant execute on function public.lead_listing_owner_aligned(uuid, text, uuid, uuid) to anon, authenticated, service_role;

revoke execute on function public.validate_developer_registration_transition() from public, anon, authenticated;
grant execute on function public.validate_developer_registration_transition() to service_role;
revoke execute on function public.validate_commission_claim_transition() from public, anon, authenticated;
grant execute on function public.validate_commission_claim_transition() to service_role;

revoke execute on function public.register_new_project_buyer(uuid, text, jsonb, text, text, text) from public, anon;
grant execute on function public.register_new_project_buyer(uuid, text, jsonb, text, text, text) to authenticated, service_role;

revoke execute on function public.decide_developer_registration(uuid, text, text, text) from public, anon;
grant execute on function public.decide_developer_registration(uuid, text, text, text) to authenticated, service_role;

revoke execute on function public.book_new_project_consultation(uuid, uuid, date, time, text, time, text) from public, anon;
grant execute on function public.book_new_project_consultation(uuid, uuid, date, time, text, time, text) to authenticated, service_role;

revoke execute on function public.post_new_project_commission(uuid, bigint, text, jsonb) from public, anon;
grant execute on function public.post_new_project_commission(uuid, bigint, text, jsonb) to authenticated, service_role;

revoke execute on function public.sales_stage_at_least(text, text) from public, anon, authenticated;
grant execute on function public.sales_stage_at_least(text, text) to service_role;

revoke execute on function public.advance_developer_registration_stage(uuid, text, jsonb) from public, anon;
grant execute on function public.advance_developer_registration_stage(uuid, text, jsonb) to authenticated, service_role;

commit;
