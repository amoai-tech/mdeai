-- SAN-1540 · Restaurant ↔ partner assignment and scoped owner writes
--
-- WHY THIS EXISTS
-- Partner members can UPDATE public.partner_locations.google_place_id (their own
-- location row). That column is therefore client-editable and can never authorize
-- a write to public.restaurants. A Google Place ID match is a reconciliation clue,
-- not proof of authority. This migration adds ONE server-controlled relationship on
-- the restaurant row itself and ONE narrow writer for listing facts.
--
-- PHASE A: no ownership paperwork, verification, approval, publication or booking
-- eligibility gate is introduced. Assignment is a technical row-isolation control.
--
-- WHAT IS PRESERVED
-- * Existing public read (phase-aware) and moderator/admin insert/update/delete
--   policies are untouched.
-- * The Google Place ID stays a plain data column; it grants nothing.
-- * Direct authenticated UPDATE on public.restaurants remains denied by the
--   existing RLS policies, so the RPC below is the only ordinary-operator path.

-- ── 1. Canonical, server-owned assignment ─────────────────────────────────────
alter table public.restaurants
  add column if not exists partner_id uuid references public.partners (id) on delete set null;

comment on column public.restaurants.partner_id is
  'SAN-1540: server-controlled restaurant -> partner assignment. Set only by restaurant_assign_partner (admin) or restaurant_create_for_partner (authorized member). Never writable by a listing edit.';

create index if not exists idx_restaurants_partner_id
  on public.restaurants (partner_id);

-- An assigned partner's members keep seeing their own record even when the
-- launch-phase visibility policy would hide an inactive row. Admins keep their
-- existing full visibility; nothing here widens access for anyone else.
drop policy if exists restaurant_partner_members_can_view on public.restaurants;
create policy restaurant_partner_members_can_view on public.restaurants
  for select to authenticated
  using (
    partner_id in (select public.partner_ids_for_user())
    or public.is_admin()
  );

-- ── 2. Owner listing write (narrow, allowlisted, membership-derived) ──────────
-- The caller is never trusted for the partner identity. p_partner_id is an
-- optional selector only: it must equal the row's assignment AND be a membership
-- of auth.uid(). Assignment, activation, verification, rating, Google Place ID and
-- provenance columns are unreachable from here.
create or replace function public.restaurant_owner_patch(
  p_restaurant_id uuid,
  p_patch jsonb,
  p_partner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.restaurants;
  v_time text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  v_day text;
  v_hours jsonb;
  v_field text;
begin
  if v_uid is null then
    raise exception 'restaurant_owner_patch: authentication required' using errcode = '42501';
  end if;
  if p_restaurant_id is null then
    raise exception 'restaurant_owner_patch: restaurant id required' using errcode = '22023';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'restaurant_owner_patch: listing patch required' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_patch) as key
    where key <> all (array[
      'name', 'description', 'website', 'phone', 'email', 'address',
      'neighborhood', 'city', 'postal_code', 'hours_of_operation',
      'price_level', 'cuisine_types', 'dietary_options', 'ambiance', 'tags',
      'images', 'primary_image_url'
    ])
  ) then
    raise exception 'restaurant_owner_patch: unsupported listing field' using errcode = '22023';
  end if;

  -- PostgREST clients can call this RPC directly, so the same value rules the
  -- Next.js Zod schema enforces are enforced again here.
  if p_patch ? 'name' and (
    jsonb_typeof(p_patch -> 'name') <> 'string'
    or length(btrim(p_patch ->> 'name')) not between 2 and 160
  ) then
    raise exception 'restaurant_owner_patch: invalid restaurant name' using errcode = '22023';
  end if;

  if p_patch ? 'description' and (
    jsonb_typeof(p_patch -> 'description') not in ('string', 'null')
    or length(coalesce(p_patch ->> 'description', '')) > 2000
  ) then
    raise exception 'restaurant_owner_patch: invalid description' using errcode = '22023';
  end if;

  if p_patch ? 'website' and (
    jsonb_typeof(p_patch -> 'website') not in ('string', 'null')
    or length(coalesce(p_patch ->> 'website', '')) > 300
    or (
      coalesce(p_patch ->> 'website', '') <> ''
      and coalesce(p_patch ->> 'website', '') !~* '^https?://[^[:space:]]+$'
    )
  ) then
    raise exception 'restaurant_owner_patch: invalid website' using errcode = '22023';
  end if;

  if p_patch ? 'email' and (
    jsonb_typeof(p_patch -> 'email') not in ('string', 'null')
    or length(coalesce(p_patch ->> 'email', '')) > 160
    or (
      coalesce(p_patch ->> 'email', '') <> ''
      and coalesce(p_patch ->> 'email', '') !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    )
  ) then
    raise exception 'restaurant_owner_patch: invalid email' using errcode = '22023';
  end if;

  if p_patch ? 'phone' and (
    jsonb_typeof(p_patch -> 'phone') not in ('string', 'null')
    or length(coalesce(p_patch ->> 'phone', '')) > 40
  ) then
    raise exception 'restaurant_owner_patch: invalid phone' using errcode = '22023';
  end if;

  if p_patch ? 'address' and (
    jsonb_typeof(p_patch -> 'address') not in ('string', 'null')
    or length(coalesce(p_patch ->> 'address', '')) > 240
  ) then
    raise exception 'restaurant_owner_patch: invalid address' using errcode = '22023';
  end if;

  if p_patch ? 'neighborhood' and (
    jsonb_typeof(p_patch -> 'neighborhood') not in ('string', 'null')
    or length(coalesce(p_patch ->> 'neighborhood', '')) > 120
  ) then
    raise exception 'restaurant_owner_patch: invalid neighborhood' using errcode = '22023';
  end if;

  if p_patch ? 'city' and (
    jsonb_typeof(p_patch -> 'city') not in ('string', 'null')
    or length(coalesce(p_patch ->> 'city', '')) > 120
  ) then
    raise exception 'restaurant_owner_patch: invalid city' using errcode = '22023';
  end if;

  if p_patch ? 'postal_code' and (
    jsonb_typeof(p_patch -> 'postal_code') not in ('string', 'null')
    or length(coalesce(p_patch ->> 'postal_code', '')) > 20
  ) then
    raise exception 'restaurant_owner_patch: invalid postal code' using errcode = '22023';
  end if;

  if p_patch ? 'price_level' then
    if jsonb_typeof(p_patch -> 'price_level') = 'null' then
      -- Clearing an unknown price is allowed; it stores no invented value.
      null;
    elsif jsonb_typeof(p_patch -> 'price_level') <> 'number'
      or (p_patch ->> 'price_level') !~ '^[1-4]$' then
      raise exception 'restaurant_owner_patch: invalid price level' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'hours_of_operation' then
    v_hours := p_patch -> 'hours_of_operation';
    if jsonb_typeof(v_hours) not in ('object', 'null') then
      raise exception 'restaurant_owner_patch: invalid opening hours' using errcode = '22023';
    end if;
    if jsonb_typeof(v_hours) = 'object' then
      if length(v_hours::text) > 4000 then
        raise exception 'restaurant_owner_patch: opening hours too large' using errcode = '22023';
      end if;
      if exists (
        select 1
        from pg_catalog.jsonb_object_keys(v_hours) as day
        where day <> all (array[
          'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
        ])
      ) then
        raise exception 'restaurant_owner_patch: invalid opening-hours day' using errcode = '22023';
      end if;
      for v_day in select pg_catalog.jsonb_object_keys(v_hours) loop
        if pg_catalog.jsonb_typeof(v_hours -> v_day) <> 'object'
          or not ((v_hours -> v_day) ? 'open')
          or not ((v_hours -> v_day) ? 'close')
          or pg_catalog.jsonb_typeof(v_hours -> v_day -> 'open') <> 'string'
          or pg_catalog.jsonb_typeof(v_hours -> v_day -> 'close') <> 'string'
          or (v_hours -> v_day ->> 'open') !~ v_time
          or (v_hours -> v_day ->> 'close') !~ v_time
        then
          raise exception 'restaurant_owner_patch: invalid opening-hours value' using errcode = '22023';
        end if;
      end loop;
    end if;
  end if;

  foreach v_field in array array['cuisine_types', 'dietary_options', 'ambiance', 'tags'] loop
    if p_patch ? v_field then
      if jsonb_typeof(p_patch -> v_field) not in ('array', 'null') then
        raise exception 'restaurant_owner_patch: invalid % list', v_field using errcode = '22023';
      end if;
      if jsonb_typeof(p_patch -> v_field) = 'array' then
        if jsonb_array_length(p_patch -> v_field) > 20 then
          raise exception 'restaurant_owner_patch: too many % values', v_field using errcode = '22023';
        end if;
        if exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_patch -> v_field) as item
          where pg_catalog.jsonb_typeof(item) <> 'string'
            or length(item #>> '{}') > 60
            or length(btrim(item #>> '{}')) = 0
        ) then
          raise exception 'restaurant_owner_patch: invalid % value', v_field using errcode = '22023';
        end if;
      end if;
    end if;
  end loop;

  if p_patch ? 'primary_image_url' and (
    jsonb_typeof(p_patch -> 'primary_image_url') not in ('string', 'null')
    or length(coalesce(p_patch ->> 'primary_image_url', '')) > 1000
    or (
      coalesce(p_patch ->> 'primary_image_url', '') <> ''
      and coalesce(p_patch ->> 'primary_image_url', '') !~* '^https?://[^[:space:]]+$'
    )
  ) then
    raise exception 'restaurant_owner_patch: invalid primary image URL' using errcode = '22023';
  end if;

  if p_patch ? 'images' then
    if jsonb_typeof(p_patch -> 'images') not in ('array', 'null') then
      raise exception 'restaurant_owner_patch: invalid images' using errcode = '22023';
    end if;
    if jsonb_typeof(p_patch -> 'images') = 'array' then
      if jsonb_array_length(p_patch -> 'images') > 20 then
        raise exception 'restaurant_owner_patch: too many images' using errcode = '22023';
      end if;
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_patch -> 'images') as item
        where pg_catalog.jsonb_typeof(item) <> 'object'
          or coalesce(pg_catalog.jsonb_typeof(item -> 'url'), '') <> 'string'
          or exists (
            select 1 from pg_catalog.jsonb_object_keys(
              case when pg_catalog.jsonb_typeof(item) = 'object'
                then item else '{}'::jsonb end
            ) as key
            where key <> all (array['url', 'source', 'sourceUrl', 'alt'])
          )
          or (item ->> 'url') !~* '^https?://[^[:space:]]+$'
          or length(item ->> 'url') > 1000
          or (
            item ? 'source'
            and (
              pg_catalog.jsonb_typeof(item -> 'source') <> 'string'
              or length(item ->> 'source') > 120
            )
          )
          or (
            item ? 'sourceUrl'
            and (
              pg_catalog.jsonb_typeof(item -> 'sourceUrl') <> 'string'
              or ((item ->> 'sourceUrl') <> ''
                  and (item ->> 'sourceUrl') !~* '^https?://[^[:space:]]+$')
            )
          )
          or (
            item ? 'alt'
            and (
              pg_catalog.jsonb_typeof(item -> 'alt') <> 'string'
              or length(item ->> 'alt') > 240
            )
          )
      ) then
        raise exception 'restaurant_owner_patch: invalid image entry' using errcode = '22023';
      end if;
    end if;
  end if;

  -- ── Authorization: assignment + verified membership ─────────────────────────
  select * into v_row
  from public.restaurants
  where id = p_restaurant_id
  for update;

  if not found then
    raise exception 'restaurant_owner_patch: restaurant not found' using errcode = 'P0002';
  end if;
  if v_row.partner_id is not null then
    -- A forged selector, or a partner id chosen from the client, cannot redirect
    -- the write: the submitted value must equal the stored assignment.
    if p_partner_id is not null and p_partner_id <> v_row.partner_id then
      raise exception 'restaurant_owner_patch: partner selection does not match the assignment' using errcode = '42501';
    end if;
    -- MDE Team keeps existing admin control (is_admin is checked in the database),
    -- so an admin can fix any listing without pretending to be a partner member.
    if not public.is_admin()
      and v_row.partner_id not in (select public.partner_ids_for_user()) then
      raise exception 'restaurant_owner_patch: restaurant access denied' using errcode = '42501';
    end if;
  elsif not public.is_admin() then
    raise exception 'restaurant_owner_patch: restaurant is not assigned to a partner' using errcode = '42501';
  end if;

  -- ── Apply only the submitted listing fields ─────────────────────────────────
  update public.restaurants
  set
    name = case when p_patch ? 'name' then btrim(p_patch ->> 'name') else name end,
    description = case when p_patch ? 'description'
      then nullif(btrim(coalesce(p_patch ->> 'description', '')), '') else description end,
    website = case when p_patch ? 'website'
      then nullif(btrim(coalesce(p_patch ->> 'website', '')), '') else website end,
    phone = case when p_patch ? 'phone'
      then nullif(btrim(coalesce(p_patch ->> 'phone', '')), '') else phone end,
    email = case when p_patch ? 'email'
      then nullif(btrim(coalesce(p_patch ->> 'email', '')), '') else email end,
    address = case when p_patch ? 'address'
      then nullif(btrim(coalesce(p_patch ->> 'address', '')), '') else address end,
    neighborhood = case when p_patch ? 'neighborhood'
      then nullif(btrim(coalesce(p_patch ->> 'neighborhood', '')), '') else neighborhood end,
    city = case when p_patch ? 'city'
      then nullif(btrim(coalesce(p_patch ->> 'city', '')), '') else city end,
    postal_code = case when p_patch ? 'postal_code'
      then nullif(btrim(coalesce(p_patch ->> 'postal_code', '')), '') else postal_code end,
    hours_of_operation = case when p_patch ? 'hours_of_operation'
      then nullif(p_patch -> 'hours_of_operation', 'null'::jsonb) else hours_of_operation end,
    price_level = case when p_patch ? 'price_level'
      then nullif(p_patch ->> 'price_level', '')::integer else price_level end,
    cuisine_types = case when p_patch ? 'cuisine_types' then
      case when jsonb_typeof(p_patch -> 'cuisine_types') = 'array'
        then array(select pg_catalog.jsonb_array_elements_text(p_patch -> 'cuisine_types'))
        else '{}'::text[] end
      else cuisine_types end,
    dietary_options = case when p_patch ? 'dietary_options' then
      case when jsonb_typeof(p_patch -> 'dietary_options') = 'array'
        then array(select pg_catalog.jsonb_array_elements_text(p_patch -> 'dietary_options'))
        else '{}'::text[] end
      else dietary_options end,
    ambiance = case when p_patch ? 'ambiance' then
      case when jsonb_typeof(p_patch -> 'ambiance') = 'array'
        then array(select pg_catalog.jsonb_array_elements_text(p_patch -> 'ambiance'))
        else '{}'::text[] end
      else ambiance end,
    tags = case when p_patch ? 'tags' then
      case when jsonb_typeof(p_patch -> 'tags') = 'array'
        then array(select pg_catalog.jsonb_array_elements_text(p_patch -> 'tags'))
        else '{}'::text[] end
      else tags end,
    images = case when p_patch ? 'images'
      then nullif(p_patch -> 'images', 'null'::jsonb) else images end,
    primary_image_url = case when p_patch ? 'primary_image_url'
      then nullif(btrim(coalesce(p_patch ->> 'primary_image_url', '')), '')
      else primary_image_url end
  where id = p_restaurant_id
  returning * into v_row;

  return jsonb_build_object(
    'restaurantId', v_row.id,
    'partnerId', v_row.partner_id,
    'updatedAt', v_row.updated_at,
    'listing', jsonb_build_object(
      'name', v_row.name,
      'description', v_row.description,
      'website', v_row.website,
      'phone', v_row.phone,
      'email', v_row.email,
      'address', v_row.address,
      'neighborhood', v_row.neighborhood,
      'city', v_row.city,
      'postal_code', v_row.postal_code,
      'hours_of_operation', v_row.hours_of_operation,
      'price_level', v_row.price_level,
      'cuisine_types', to_jsonb(v_row.cuisine_types),
      'dietary_options', to_jsonb(v_row.dietary_options),
      'ambiance', to_jsonb(v_row.ambiance),
      'tags', to_jsonb(v_row.tags),
      'images', v_row.images,
      'primary_image_url', v_row.primary_image_url,
      'is_active', v_row.is_active
    )
  );
end;
$$;

revoke all on function public.restaurant_owner_patch(uuid, jsonb, uuid) from public, anon;
grant execute on function public.restaurant_owner_patch(uuid, jsonb, uuid) to authenticated;

comment on function public.restaurant_owner_patch(uuid, jsonb, uuid) is
  'SAN-1540: allowlisted listing facts for a restaurant assigned to an authorized partner member. Never accepts assignment or protected administrative fields.';

-- ── 3. Authorized partner creates a development listing ───────────────────────
create or replace function public.restaurant_create_for_partner(
  p_partner_id uuid,
  p_name text,
  p_google_place_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_place text := nullif(btrim(coalesce(p_google_place_id, '')), '');
begin
  if v_uid is null then
    raise exception 'restaurant_create_for_partner: authentication required' using errcode = '42501';
  end if;
  if p_partner_id is null then
    raise exception 'restaurant_create_for_partner: partner id required' using errcode = '22023';
  end if;
  if p_partner_id not in (select public.partner_ids_for_user()) then
    raise exception 'restaurant_create_for_partner: partner access denied' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 2 and 160 then
    raise exception 'restaurant_create_for_partner: invalid restaurant name' using errcode = '22023';
  end if;
  if v_place is not null and length(v_place) > 256 then
    raise exception 'restaurant_create_for_partner: invalid Google Place ID' using errcode = '22023';
  end if;
  if v_place is not null
    and exists (select 1 from public.restaurants where google_place_id = v_place) then
    raise exception 'restaurant_create_for_partner: a restaurant with this Google Place ID already exists'
      using errcode = '23505';
  end if;

  insert into public.restaurants (name, google_place_id, partner_id, created_by, source)
  values (btrim(p_name), v_place, p_partner_id, v_uid, 'manual')
  returning id into v_id;

  return jsonb_build_object('restaurantId', v_id, 'partnerId', p_partner_id);
end;
$$;

revoke all on function public.restaurant_create_for_partner(uuid, text, text) from public, anon;
grant execute on function public.restaurant_create_for_partner(uuid, text, text) to authenticated;

comment on function public.restaurant_create_for_partner(uuid, text, text) is
  'SAN-1540: authorized partner member creates a restaurant row assigned to their partner. No approval or ownership paperwork.';

-- ── 4. Super Admin assignment (no paperwork, server-authorized) ───────────────
create or replace function public.restaurant_assign_partner(
  p_restaurant_id uuid,
  p_partner_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.restaurants;
begin
  if auth.uid() is null then
    raise exception 'restaurant_assign_partner: authentication required' using errcode = '42501';
  end if;
  -- is_admin() covers admin + super_admin roles. An authenticated non-admin can
  -- reach this function but never pass this check.
  if not public.is_admin() then
    raise exception 'restaurant_assign_partner: admin access denied' using errcode = '42501';
  end if;
  if p_restaurant_id is null then
    raise exception 'restaurant_assign_partner: restaurant id required' using errcode = '22023';
  end if;
  if p_partner_id is not null
    and not exists (select 1 from public.partners where id = p_partner_id) then
    raise exception 'restaurant_assign_partner: partner not found' using errcode = 'P0002';
  end if;

  update public.restaurants
  set partner_id = p_partner_id
  where id = p_restaurant_id
  returning * into v_row;

  if not found then
    raise exception 'restaurant_assign_partner: restaurant not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'restaurantId', v_row.id,
    'partnerId', v_row.partner_id,
    'updatedAt', v_row.updated_at
  );
end;
$$;

revoke all on function public.restaurant_assign_partner(uuid, uuid) from public, anon;
grant execute on function public.restaurant_assign_partner(uuid, uuid) to authenticated;

comment on function public.restaurant_assign_partner(uuid, uuid) is
  'SAN-1540: admin-only restaurant -> partner assignment. Unlike a Google Place ID match, this stored value is the only edit authority.';
