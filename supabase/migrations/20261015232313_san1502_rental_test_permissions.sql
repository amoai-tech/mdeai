-- =============================================================================
-- Migration: 20261015232313_san1502_rental_test_permissions.sql
-- Task:      SAN-1502 · MDE Rentals — Enable Full Development Journeys and
--            Defer Real-World Approval Gates (PR 1: development authorization)
-- =============================================================================
-- PR 1 of SAN-1502. It adds the missing *development authorization primitive*
-- and an *append-only audit trail*, then exposes administrator-only RPCs that
-- assign development ownership/responsibility, grant or revoke development
-- photo/publishing rights, and move a test listing through approve / reject /
-- reopen. It deliberately does NOT widen public visibility: fixtures stay
-- excluded by public.rental_listing_is_public(), and PR 2/PR 3 consume the
-- predicate below to expose fixtures only to authorized test actors.
--
-- WHY THIS EXISTS (verified gap, 2026-10-15)
--   * The only fixture authorization today is public.is_admin(); there is no
--     per-user tester grant and no append-only history. Every test-mode
--     transition is recorded only as last-writer metadata on the row.
--   * public.rental_test_access is the new, narrowly scoped per-user grant.
--   * public.rental_test_events is append-only: UPDATE/DELETE raise.
--
-- BOUNDARY: development authorization is NOT proof of ownership or copyright.
-- A grant here authorizes *application testing* only; it never sets
-- apartments.verified = true and never makes a fixture customer-visible.
--
-- REPLAY-SAFE: create table if not exists / create or replace / drop policy if
-- exists / guarded inserts are idempotent.
-- =============================================================================

-- §1 — per-user development grants ------------------------------------------
create table if not exists public.rental_test_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  access_role text not null,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_test_access_role_check
    check (access_role in ('owner', 'broker', 'renter')),
  constraint rental_test_access_user_role_key unique (user_id, access_role),
  constraint rental_test_access_expiry_check
    check (expires_at is null or expires_at > granted_at)
);

comment on table public.rental_test_access is
  'SAN-1502: per-user authorization to act inside MDE-controlled development rental journeys. Authorizes testing only; it is not ownership, verification or copyright.';
comment on column public.rental_test_access.access_role is
  'owner | broker | renter — the development role granted to this user.';
comment on column public.rental_test_access.expires_at is
  'Optional expiry. An expired grant is inactive without a write.';

create index if not exists rental_test_access_active_user_idx
  on public.rental_test_access (user_id)
  where revoked_at is null;

alter table public.rental_test_access enable row level security;

-- §1b — RLS: administrators manage every row; a user may read only their own.
-- There is intentionally no anon policy and no self-write policy: grants are
-- only ever created by the SECURITY DEFINER RPCs below.
drop policy if exists rental_test_access_select_admin on public.rental_test_access;
create policy rental_test_access_select_admin
  on public.rental_test_access
  for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists rental_test_access_select_self on public.rental_test_access;
create policy rental_test_access_select_self
  on public.rental_test_access
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists rental_test_access_insert_admin on public.rental_test_access;
create policy rental_test_access_insert_admin
  on public.rental_test_access
  for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists rental_test_access_update_admin on public.rental_test_access;
create policy rental_test_access_update_admin
  on public.rental_test_access
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists rental_test_access_delete_admin on public.rental_test_access;
create policy rental_test_access_delete_admin
  on public.rental_test_access
  for delete
  to authenticated
  using ((select public.is_admin()));

-- §2 — append-only development audit trail ----------------------------------
create table if not exists public.rental_test_events (
  id bigint generated always as identity primary key,
  apartment_id uuid references public.apartments (id) on delete set null,
  actor_id uuid,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  snapshot jsonb,
  created_at timestamptz not null default now()
);

comment on table public.rental_test_events is
  'SAN-1502: append-only history of development authorization and test-listing transitions. UPDATE and DELETE are blocked by trigger.';

create index if not exists rental_test_events_apartment_created_idx
  on public.rental_test_events (apartment_id, created_at desc);
create index if not exists rental_test_events_actor_created_idx
  on public.rental_test_events (actor_id, created_at desc);

alter table public.rental_test_events enable row level security;

-- Administrators read the history; nobody can write it directly (only the
-- SECURITY DEFINER RPCs, which run as the table owner and bypass RLS).
drop policy if exists rental_test_events_select_admin on public.rental_test_events;
create policy rental_test_events_select_admin
  on public.rental_test_events
  for select
  to authenticated
  using ((select public.is_admin()));

create or replace function public.rental_test_events_block_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'rental_test_events is append-only'
    using errcode = '42501';
end;
$function$;

comment on function public.rental_test_events_block_mutation() is
  'SAN-1502: trigger body that refuses UPDATE/DELETE on the append-only development audit trail.';

revoke all on function public.rental_test_events_block_mutation() from public, anon, authenticated;
grant execute on function public.rental_test_events_block_mutation() to service_role;

drop trigger if exists rental_test_events_no_update on public.rental_test_events;
create trigger rental_test_events_no_update
  before update on public.rental_test_events
  for each row execute function public.rental_test_events_block_mutation();

drop trigger if exists rental_test_events_no_delete on public.rental_test_events;
create trigger rental_test_events_no_delete
  before delete on public.rental_test_events
  for each row execute function public.rental_test_events_block_mutation();

-- Defence in depth for append-only: even a future permissive RLS policy could
-- not let an end-user role rewrite history, because the privilege is gone too.
-- The SECURITY DEFINER RPCs run as the table owner and keep INSERT.
revoke update, delete on public.rental_test_events from anon, authenticated;

-- §3 — the authorization predicate ------------------------------------------
-- SECURITY DEFINER so RLS on rental_test_access cannot recurse or hide the
-- deciding row from the policy that calls this. It returns only a boolean about
-- the supplied user, so exposing it to authenticated leaks nothing.
create or replace function public.is_authorized_test_actor(
  p_user_id uuid,
  p_access_role text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_user_id is not null
     and exists (
       select 1
         from public.rental_test_access a
        where a.user_id = p_user_id
          and a.revoked_at is null
          and (a.expires_at is null or a.expires_at > now())
          and (p_access_role is null or a.access_role = p_access_role)
     );
$function$;

comment on function public.is_authorized_test_actor(uuid, text) is
  'SAN-1502: true when the user holds an active (not revoked, not expired) development grant, optionally limited to one role.';

revoke all on function public.is_authorized_test_actor(uuid, text) from public, anon;
grant execute on function public.is_authorized_test_actor(uuid, text) to authenticated, service_role;

-- §4 — one canonical "can an authorized tester be offered this fixture?" -----
-- Materialized once so PR 2 search/RLS and PR 3 viewing consume the same rule.
-- Absent rights keys default to *available* so existing published fixtures are
-- unchanged; an explicit rejected/revoked state withdraws the listing.
create or replace function public.rental_test_listing_is_available(
  p_status text,
  p_moderation_status text,
  p_listing_workflow_status text,
  p_metadata jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $function$
  select
    lower(coalesce(p_metadata ->> 'is_test_fixture', 'false')) = 'true'
    and p_status = 'active'
    and p_moderation_status = 'approved'
    and p_listing_workflow_status = 'published'
    and lower(coalesce(p_metadata ->> 'admin_test_publish_state', 'approved'))
        not in ('rejected', 'revoked')
    and lower(coalesce(p_metadata ->> 'admin_test_photo_rights', 'test_image_only'))
        <> 'revoked';
$function$;

comment on function public.rental_test_listing_is_available(text, text, text, jsonb) is
  'SAN-1502: the single development-availability predicate. True only for a published test fixture whose publishing and photo rights are not withdrawn.';

revoke all on function public.rental_test_listing_is_available(text, text, text, jsonb) from public;
grant execute on function public.rental_test_listing_is_available(text, text, text, jsonb)
  to authenticated, service_role;

-- §5 — internal audit writer (no end-user EXECUTE) ---------------------------
create or replace function public.rental_test_record_event(
  p_apartment_id uuid,
  p_actor_id uuid,
  p_event_type text,
  p_details jsonb default '{}'::jsonb,
  p_snapshot jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.rental_test_events (apartment_id, actor_id, event_type, details, snapshot)
  values (
    p_apartment_id,
    p_actor_id,
    nullif(btrim(p_event_type), ''),
    coalesce(p_details, '{}'::jsonb),
    p_snapshot
  );
end;
$function$;

comment on function public.rental_test_record_event(uuid, uuid, text, jsonb, jsonb) is
  'SAN-1502: internal append-only audit writer. Not executable by end-user roles.';

revoke all on function public.rental_test_record_event(uuid, uuid, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.rental_test_record_event(uuid, uuid, text, jsonb, jsonb)
  to service_role;

-- §6 — admin: grant / revoke development access ------------------------------
create or replace function public.admin_grant_rental_test_access(
  p_user_id uuid,
  p_access_role text,
  p_expires_at timestamptz default null,
  p_note text default null
)
returns public.rental_test_access
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := lower(btrim(coalesce(p_access_role, '')));
  v_row public.rental_test_access;
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'target user required' using errcode = '22004';
  end if;
  if v_role not in ('owner', 'broker', 'renter') then
    raise exception 'access_role must be owner, broker or renter' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'expires_at must be in the future' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'target user not found' using errcode = 'P0002';
  end if;

  insert into public.rental_test_access as a (
    user_id, access_role, granted_by, granted_at, expires_at,
    revoked_at, revoked_by, note, updated_at
  ) values (
    p_user_id, v_role, v_uid, now(), p_expires_at,
    null, null, nullif(btrim(coalesce(p_note, '')), ''), now()
  )
  on conflict (user_id, access_role) do update
    set granted_by = excluded.granted_by,
        granted_at = excluded.granted_at,
        expires_at = excluded.expires_at,
        revoked_at = null,
        revoked_by = null,
        note = excluded.note,
        updated_at = now()
  returning a.* into v_row;

  perform public.rental_test_record_event(
    null, v_uid, 'access_granted',
    jsonb_build_object(
      'user_id', p_user_id,
      'access_role', v_role,
      'expires_at', p_expires_at
    ),
    to_jsonb(v_row)
  );

  return v_row;
end;
$function$;

comment on function public.admin_grant_rental_test_access(uuid, text, timestamptz, text) is
  'SAN-1502: administrator grants (or re-grants) a development role. Audited. Authorizes testing only.';

create or replace function public.admin_revoke_rental_test_access(
  p_user_id uuid,
  p_access_role text
)
returns public.rental_test_access
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := lower(btrim(coalesce(p_access_role, '')));
  v_row public.rental_test_access;
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_user_id is null or v_role not in ('owner', 'broker', 'renter') then
    raise exception 'target user and valid access_role required' using errcode = '22023';
  end if;

  update public.rental_test_access a
     set revoked_at = now(),
         revoked_by = v_uid,
         updated_at = now()
   where a.user_id = p_user_id
     and a.access_role = v_role
     and a.revoked_at is null
  returning a.* into v_row;

  if not found then
    raise exception 'no active grant for that user and role'
      using errcode = 'P0002';
  end if;

  perform public.rental_test_record_event(
    null, v_uid, 'access_revoked',
    jsonb_build_object('user_id', p_user_id, 'access_role', v_role),
    to_jsonb(v_row)
  );

  return v_row;
end;
$function$;

comment on function public.admin_revoke_rental_test_access(uuid, text) is
  'SAN-1502: administrator revokes a development role. Takes effect immediately (the predicate stops matching). Audited.';

-- §7 — admin: assign development owner / responsible broker ------------------
create or replace function public.admin_assign_test_listing_owner(
  p_apartment_id uuid,
  p_owner_user_id uuid
)
returns public.apartments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.apartments;
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_apartment_id is null or p_owner_user_id is null then
    raise exception 'apartment and owner required' using errcode = '22004';
  end if;
  if not exists (
    select 1 from public.rental_test_access a
     where a.user_id = p_owner_user_id
       and a.access_role = 'owner'
       and a.revoked_at is null
       and (a.expires_at is null or a.expires_at > now())
  ) then
    raise exception 'owner must hold an active test owner grant' using errcode = '42501';
  end if;

  update public.apartments a
     set metadata = coalesce(a.metadata, '{}'::jsonb)
           || jsonb_build_object(
                'is_test_fixture', 'true',
                'admin_test_owner_user_id', p_owner_user_id,
                'admin_test_owner_assigned_by', v_uid,
                'admin_test_owner_assigned_at', now()
              ),
         workflow_changed_by = v_uid,
         workflow_changed_at = now(),
         updated_at = now()
   where a.id = p_apartment_id
     and lower(coalesce(a.metadata ->> 'is_test_fixture', 'false')) = 'true'
  returning a.* into v_row;

  if not found then
    raise exception 'test fixture not found' using errcode = 'P0002';
  end if;

  perform public.rental_test_record_event(
    p_apartment_id, v_uid, 'owner_assigned',
    jsonb_build_object('owner_user_id', p_owner_user_id),
    null
  );

  return v_row;
end;
$function$;

comment on function public.admin_assign_test_listing_owner(uuid, uuid) is
  'SAN-1502: records the development owner of a test fixture. Development ownership is not legal ownership. Audited.';

create or replace function public.admin_assign_test_listing_broker(
  p_apartment_id uuid,
  p_broker_user_id uuid
)
returns public.apartments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_landlord uuid;
  v_previous uuid;
  v_row public.apartments;
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_apartment_id is null or p_broker_user_id is null then
    raise exception 'apartment and broker required' using errcode = '22004';
  end if;
  if not exists (
    select 1 from public.rental_test_access a
     where a.user_id = p_broker_user_id
       and a.access_role in ('broker', 'owner')
       and a.revoked_at is null
       and (a.expires_at is null or a.expires_at > now())
  ) then
    raise exception 'broker must hold an active test broker or owner grant'
      using errcode = '42501';
  end if;

  -- In the current schema the party who receives a fixture's viewings is the
  -- acting landlord: showings_select_visible and leads_select_broker_listing
  -- both key on apartments.landlord_id in acting_landlord_ids(). Assigning the
  -- test broker therefore repoints landlord_id at the broker's profile.
  select lp.id into v_landlord
    from public.landlord_profiles lp
   where lp.user_id = p_broker_user_id
   order by lp.created_at
   limit 1;
  if v_landlord is null then
    raise exception 'broker has no landlord profile' using errcode = 'P0002';
  end if;

  select a.landlord_id into v_previous
    from public.apartments a
   where a.id = p_apartment_id
     and lower(coalesce(a.metadata ->> 'is_test_fixture', 'false')) = 'true';
  if not found then
    raise exception 'test fixture not found' using errcode = 'P0002';
  end if;

  update public.apartments a
     set landlord_id = v_landlord,
         metadata = coalesce(a.metadata, '{}'::jsonb)
           || jsonb_build_object(
                'is_test_fixture', 'true',
                'admin_test_broker_user_id', p_broker_user_id,
                'admin_test_broker_assigned_by', v_uid,
                'admin_test_broker_assigned_at', now()
              ),
         workflow_changed_by = v_uid,
         workflow_changed_at = now(),
         updated_at = now()
   where a.id = p_apartment_id
  returning a.* into v_row;

  perform public.rental_test_record_event(
    p_apartment_id, v_uid, 'broker_assigned',
    jsonb_build_object(
      'broker_user_id', p_broker_user_id,
      'landlord_profile_id', v_landlord,
      'previous_landlord_profile_id', v_previous
    ),
    null
  );

  return v_row;
end;
$function$;

comment on function public.admin_assign_test_listing_broker(uuid, uuid) is
  'SAN-1502: points a test fixture at the responsible test broker (acting landlord) so that broker alone sees its leads/showings. Audited.';

-- §8 — admin: grant / revoke development rights ------------------------------
create or replace function public.admin_set_test_rights(
  p_apartment_id uuid,
  p_right text,
  p_state text
)
returns public.apartments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_right text := lower(btrim(coalesce(p_right, '')));
  v_state text := lower(btrim(coalesce(p_state, '')));
  v_key text;
  v_allowed text[];
  v_row public.apartments;
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  if v_right = 'photo' then
    v_key := 'admin_test_photo_rights';
    v_allowed := array['authorized', 'revoked', 'test_image_only'];
  elsif v_right = 'publishing' then
    v_key := 'admin_test_publish_state';
    v_allowed := array['approved', 'rejected', 'revoked'];
  else
    raise exception 'right must be photo or publishing' using errcode = '22023';
  end if;

  if not (v_state = any (v_allowed)) then
    raise exception 'invalid state % for % right', v_state, v_right
      using errcode = '22023';
  end if;

  update public.apartments a
     set metadata = coalesce(a.metadata, '{}'::jsonb)
           || jsonb_build_object(
                'is_test_fixture', 'true',
                v_key, v_state,
                'admin_test_rights_updated_by', v_uid,
                'admin_test_rights_updated_at', now()
              ),
         workflow_changed_by = v_uid,
         workflow_changed_at = now(),
         updated_at = now()
   where a.id = p_apartment_id
     and lower(coalesce(a.metadata ->> 'is_test_fixture', 'false')) = 'true'
  returning a.* into v_row;

  if not found then
    raise exception 'test fixture not found' using errcode = 'P0002';
  end if;

  perform public.rental_test_record_event(
    p_apartment_id, v_uid,
    case when v_right = 'photo' then 'photo_rights_set' else 'publishing_rights_set' end,
    jsonb_build_object('right', v_right, 'state', v_state),
    null
  );

  return v_row;
end;
$function$;

comment on function public.admin_set_test_rights(uuid, text, text) is
  'SAN-1502: grants or revokes development photo/publishing rights for a test fixture. Withdrawing publishing removes the listing from the development-offer predicate. Audited.';

-- §9 — admin: approve / reject / reopen --------------------------------------
create or replace function public.admin_approve_test_listing(p_apartment_id uuid)
returns public.apartments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.apartments;
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_apartment_id is null then
    raise exception 'apartment required' using errcode = '22004';
  end if;
  if not exists (
    select 1 from public.apartments a
     where a.id = p_apartment_id
       and lower(coalesce(a.metadata ->> 'is_test_fixture', 'false')) = 'true'
  ) then
    raise exception 'test fixture not found' using errcode = 'P0002';
  end if;

  -- Reuse the canonical test publish path (never sets verified, never public).
  v_row := public.admin_publish_test_rental(p_apartment_id);

  update public.apartments a
     set metadata = coalesce(a.metadata, '{}'::jsonb)
           || jsonb_build_object(
                'admin_test_publish_state', 'approved',
                'admin_test_approved_by', v_uid,
                'admin_test_approved_at', now()
              ),
         updated_at = now()
   where a.id = p_apartment_id
  returning a.* into v_row;

  perform public.rental_test_record_event(
    p_apartment_id, v_uid, 'listing_approved',
    jsonb_build_object('publish_state', 'approved'),
    null
  );

  return v_row;
end;
$function$;

comment on function public.admin_approve_test_listing(uuid) is
  'SAN-1502: approves and test-publishes a fixture. verified stays false; customers never see it. Audited.';

create or replace function public.admin_reject_test_listing(
  p_apartment_id uuid,
  p_reason text default null
)
returns public.apartments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_row public.apartments;
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_apartment_id is null then
    raise exception 'apartment required' using errcode = '22004';
  end if;

  update public.apartments a
     set status = 'inactive',
         moderation_status = 'rejected',
         listing_workflow_status = 'rejected',
         rejection_reason = v_reason,
         workflow_changed_by = v_uid,
         workflow_changed_at = now(),
         updated_at = now(),
         metadata = coalesce(a.metadata, '{}'::jsonb)
           || jsonb_build_object(
                'is_test_fixture', 'true',
                'admin_test_publish_state', 'rejected',
                'admin_test_rejected_by', v_uid,
                'admin_test_rejected_at', now()
              )
   where a.id = p_apartment_id
     and lower(coalesce(a.metadata ->> 'is_test_fixture', 'false')) = 'true'
  returning a.* into v_row;

  if not found then
    raise exception 'test fixture not found' using errcode = 'P0002';
  end if;

  perform public.rental_test_record_event(
    p_apartment_id, v_uid, 'listing_rejected',
    jsonb_build_object('reason', v_reason),
    null
  );

  return v_row;
end;
$function$;

comment on function public.admin_reject_test_listing(uuid, text) is
  'SAN-1502: rejects a development listing (inactive + rejected) and withdraws its publishing right. Audited.';

create or replace function public.admin_reopen_test_listing(p_apartment_id uuid)
returns public.apartments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.apartments;
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_apartment_id is null then
    raise exception 'apartment required' using errcode = '22004';
  end if;

  update public.apartments a
     set status = 'inactive',
         moderation_status = 'pending',
         listing_workflow_status = 'draft',
         rejection_reason = null,
         workflow_changed_by = v_uid,
         workflow_changed_at = now(),
         updated_at = now(),
         metadata = coalesce(a.metadata, '{}'::jsonb)
           || jsonb_build_object(
                'is_test_fixture', 'true',
                'admin_test_publish_state', 'pending',
                'admin_test_reopened_by', v_uid,
                'admin_test_reopened_at', now()
              )
   where a.id = p_apartment_id
     and lower(coalesce(a.metadata ->> 'is_test_fixture', 'false')) = 'true'
  returning a.* into v_row;

  if not found then
    raise exception 'test fixture not found' using errcode = 'P0002';
  end if;

  perform public.rental_test_record_event(
    p_apartment_id, v_uid, 'listing_reopened',
    jsonb_build_object('publish_state', 'pending'),
    null
  );

  return v_row;
end;
$function$;

comment on function public.admin_reopen_test_listing(uuid) is
  'SAN-1502: returns a rejected/paused fixture to draft for re-review. Audited.';

-- §9b — keep administrator test-mode bookkeeping non-material ----------------
-- SAN-1431 (§4.2) demotes a published listing to review on any material change,
-- including an unrecognized metadata key. The development RPCs above write
-- administrative bookkeeping onto an already-published fixture (owner/broker
-- assignment, rights grant/revoke, approve/reject/reopen). Those writes are not
-- content edits, so this replaces the guard in place to exempt exactly the
-- administrative keys — and a test-fixture landlord_id transfer — for an
-- administrator only. Every real content/photo/source/ownership change still
-- fails closed, and no non-admin gains anything.
create or replace function public.apartments_material_edit_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_material boolean := false;
  v_already_safe boolean;
  v_reason text;
begin
  -- Only OLD live rows need re-review. Initial publishing/republishing starts
  -- from a non-live OLD row, so publish_verified_rental() remains untouched.
  -- Never skip a material edit merely because the UPDATE also changes workflow.
  if OLD.listing_workflow_status = 'published'
     or (OLD.status = 'active' and OLD.moderation_status = 'approved') then
    v_material :=
         (NEW.price_monthly is distinct from OLD.price_monthly)
      or (NEW.price_weekly is distinct from OLD.price_weekly)
      or (NEW.price_daily is distinct from OLD.price_daily)
      or (NEW.currency is distinct from OLD.currency)
      or (NEW.deposit_amount is distinct from OLD.deposit_amount)
      or (NEW.utilities_included is distinct from OLD.utilities_included)
      or (NEW.available_from is distinct from OLD.available_from)
      or (NEW.available_to is distinct from OLD.available_to)
      or (NEW.minimum_stay_days is distinct from OLD.minimum_stay_days)
      or (NEW.maximum_stay_days is distinct from OLD.maximum_stay_days)
      or (NEW.address is distinct from OLD.address)
      or (NEW.neighborhood is distinct from OLD.neighborhood)
      or (NEW.city is distinct from OLD.city)
      or (NEW.latitude is distinct from OLD.latitude)
      or (NEW.longitude is distinct from OLD.longitude)
      -- A null owner is left to the SAN-1349 CHECK, which rejects it outright;
      -- a non-null ownership transfer is material and re-enters review — except
      -- for an administrator repointing a TEST fixture at its responsible
      -- broker, which is development bookkeeping, not a real ownership transfer.
      or (NEW.landlord_id is distinct from OLD.landlord_id
          and NEW.landlord_id is not null
          and not (
            public.is_admin()
            and lower(coalesce(OLD.metadata ->> 'is_test_fixture', 'false')) = 'true'
          ))
      or (NEW.bedrooms is distinct from OLD.bedrooms)
      or (NEW.bathrooms is distinct from OLD.bathrooms)
      or (NEW.size_sqm is distinct from OLD.size_sqm)
      or (NEW.floor_number is distinct from OLD.floor_number)
      or (NEW.total_floors is distinct from OLD.total_floors)
      or (NEW.wifi_speed is distinct from OLD.wifi_speed)
      or (NEW.building_amenities is distinct from OLD.building_amenities)
      or (NEW.video_url is distinct from OLD.video_url)
      or (NEW.virtual_tour_url is distinct from OLD.virtual_tour_url)
      or (NEW.source_url is distinct from OLD.source_url)
      or (NEW.source_listing_id is distinct from OLD.source_listing_id)
      or (NEW.furnished is distinct from OLD.furnished)
      or (NEW.pet_friendly is distinct from OLD.pet_friendly)
      or (NEW.smoking_allowed is distinct from OLD.smoking_allowed)
      or (NEW.parking_included is distinct from OLD.parking_included)
      or (NEW.images is distinct from OLD.images)
      -- Only real administrators may change the internal TEST-operator and
      -- SAN-1502 development keys without reopening an otherwise unchanged
      -- published rental. Other metadata, photo, ownership and material changes
      -- still fail closed.
      or (
        case when public.is_admin() then
          (coalesce(NEW.metadata, '{}'::jsonb)
            - 'internal_note'
            - 'admin_test_operator_active'
            - 'admin_test_operator_user_id'
            - 'admin_test_operator_updated_by'
            - 'admin_test_operator_updated_at'
            - 'admin_test_owner_user_id'
            - 'admin_test_owner_assigned_by'
            - 'admin_test_owner_assigned_at'
            - 'admin_test_broker_user_id'
            - 'admin_test_broker_assigned_by'
            - 'admin_test_broker_assigned_at'
            - 'admin_test_photo_rights'
            - 'admin_test_publish_state'
            - 'admin_test_rights_updated_by'
            - 'admin_test_rights_updated_at'
            - 'admin_test_approved_by'
            - 'admin_test_approved_at'
            - 'admin_test_rejected_by'
            - 'admin_test_rejected_at'
            - 'admin_test_reopened_by'
            - 'admin_test_reopened_at')
          is distinct from
          (coalesce(OLD.metadata, '{}'::jsonb)
            - 'internal_note'
            - 'admin_test_operator_active'
            - 'admin_test_operator_user_id'
            - 'admin_test_operator_updated_by'
            - 'admin_test_operator_updated_at'
            - 'admin_test_owner_user_id'
            - 'admin_test_owner_assigned_by'
            - 'admin_test_owner_assigned_at'
            - 'admin_test_broker_user_id'
            - 'admin_test_broker_assigned_by'
            - 'admin_test_broker_assigned_at'
            - 'admin_test_photo_rights'
            - 'admin_test_publish_state'
            - 'admin_test_rights_updated_by'
            - 'admin_test_rights_updated_at'
            - 'admin_test_approved_by'
            - 'admin_test_approved_at'
            - 'admin_test_rejected_by'
            - 'admin_test_rejected_at'
            - 'admin_test_reopened_by'
            - 'admin_test_reopened_at')
        else
          (coalesce(NEW.metadata, '{}'::jsonb) - 'internal_note')
          is distinct from (coalesce(OLD.metadata, '{}'::jsonb) - 'internal_note')
        end
      );
  end if;

  if v_material then
    -- The evidence AFTER triggers intentionally update the parent to a safe
    -- draft and provide a specific reason. Preserve that reason; do not turn
    -- it into the generic apartment-edit reason on the nested BEFORE trigger.
    v_already_safe := NEW.listing_workflow_status = 'draft'
                  and NEW.status = 'inactive'
                  and NEW.moderation_status = 'pending'
                  and NEW.verified = false
                  and NEW.published_at is null
                  and NEW.published_by is null;
    v_reason := case
      when v_already_safe
       and nullif(NEW.metadata->>'review_required_reason', '') is distinct from
           nullif(OLD.metadata->>'review_required_reason', '')
      then NEW.metadata->>'review_required_reason'
      else 'material edit after publication'
    end;

    NEW.listing_workflow_status := 'draft';
    NEW.status := 'inactive';
    NEW.moderation_status := 'pending';
    NEW.verified := false;
    NEW.published_at := null;
    NEW.published_by := null;
    -- A missing JWT must never be replaced by a fabricated human UUID.
    NEW.workflow_changed_by := auth.uid();
    NEW.workflow_changed_at := now();
    NEW.updated_at := now();
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'review_required_reason', v_reason,
      'review_required_at', now(),
      'review_actor_kind', case
        when auth.uid() is not null then 'authenticated_user'
        when current_setting('role', true) = 'service_role' then 'service_role'
        else 'database_operation'
      end,
      'review_actor_db_role', coalesce(
        nullif(current_setting('role', true), ''), current_user
      )
    );
  end if;
  return NEW;
end;
$$;

-- §10 — classify EXECUTE on every new RPC --------------------------------
revoke all on function public.admin_grant_rental_test_access(uuid, text, timestamptz, text) from public, anon;
revoke all on function public.admin_revoke_rental_test_access(uuid, text) from public, anon;
revoke all on function public.admin_assign_test_listing_owner(uuid, uuid) from public, anon;
revoke all on function public.admin_assign_test_listing_broker(uuid, uuid) from public, anon;
revoke all on function public.admin_set_test_rights(uuid, text, text) from public, anon;
revoke all on function public.admin_approve_test_listing(uuid) from public, anon;
revoke all on function public.admin_reject_test_listing(uuid, text) from public, anon;
revoke all on function public.admin_reopen_test_listing(uuid) from public, anon;

grant execute on function public.admin_grant_rental_test_access(uuid, text, timestamptz, text) to authenticated, service_role;
grant execute on function public.admin_revoke_rental_test_access(uuid, text) to authenticated, service_role;
grant execute on function public.admin_assign_test_listing_owner(uuid, uuid) to authenticated, service_role;
grant execute on function public.admin_assign_test_listing_broker(uuid, uuid) to authenticated, service_role;
grant execute on function public.admin_set_test_rights(uuid, text, text) to authenticated, service_role;
grant execute on function public.admin_approve_test_listing(uuid) to authenticated, service_role;
grant execute on function public.admin_reject_test_listing(uuid, text) to authenticated, service_role;
grant execute on function public.admin_reopen_test_listing(uuid) to authenticated, service_role;
