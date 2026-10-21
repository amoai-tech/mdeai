-- SAN-814: merge partner profile fields atomically.
-- A whole-JSONB read/modify/write in the route can silently lose a concurrent
-- update. This function locks the partner row, verifies membership from auth.uid(),
-- and merges only reviewed fields after verifying auth.uid() membership.
-- Keep the privileged RPC narrow: no direct client UPDATE grant on partners.

create or replace function public.partner_profile_patch(
  p_patch jsonb,
  p_partner_id uuid default null
)
returns jsonb
language plpgsql
-- authenticated callers do not have direct partners UPDATE privileges.
-- Run with narrow definer authority and re-check membership explicitly below.
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_partner_id uuid;
  v_membership_count integer;
  v_settings jsonb;
  v_allowed text[] := array['businessName', 'category', 'neighborhood', 'description', 'website'];
begin
  if v_uid is null then
    raise exception 'partner_profile_patch: authentication required' using errcode = '42501';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'partner_profile_patch: profile patch required' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_patch) as key
    where key <> all(v_allowed)
  ) then
    raise exception 'partner_profile_patch: unsupported profile field' using errcode = '22023';
  end if;

  -- PostgREST clients can call this RPC directly, bypassing the Next.js Zod
  -- schema. Enforce the same allowlisted value types and lengths here.
  if exists (
    select 1
    from pg_catalog.jsonb_each(p_patch) as item(field_name, field_value)
    where pg_catalog.jsonb_typeof(item.field_value) <> 'string'
       or case item.field_name
         when 'businessName' then pg_catalog.length(pg_catalog.btrim(item.field_value #>> '{}')) not between 2 and 160
         when 'category' then pg_catalog.length(pg_catalog.btrim(item.field_value #>> '{}')) not between 2 and 80
         when 'neighborhood' then pg_catalog.length(pg_catalog.btrim(item.field_value #>> '{}')) not between 2 and 80
         when 'description' then pg_catalog.length(item.field_value #>> '{}') > 1000
         when 'website' then pg_catalog.length(item.field_value #>> '{}') > 300
           or (item.field_value #>> '{}') !~* '^https?://[^[:space:]]+$' and (item.field_value #>> '{}') <> ''
         else true
       end
  ) then
    raise exception 'partner_profile_patch: invalid profile value' using errcode = '22023';
  end if;

  if p_partner_id is null then
    select count(*) into v_membership_count
    from public.partner_members
    where profile_id = v_uid;

    if v_membership_count = 0 then
      raise exception 'partner_profile_patch: no partner membership' using errcode = 'P0002';
    end if;
    if v_membership_count > 1 then
      raise exception 'partner_profile_patch: multiple partner memberships require a selection' using errcode = 'P0003';
    end if;

    select partner_id into v_partner_id
    from public.partner_members
    where profile_id = v_uid;
  else
    select partner_id into v_partner_id
    from public.partner_members
    where profile_id = v_uid and partner_id = p_partner_id;

    if v_partner_id is null then
      raise exception 'partner_profile_patch: partner access denied' using errcode = '42501';
    end if;
  end if;

  update public.partners
  set settings = coalesce(settings, '{}'::jsonb) || p_patch
  where id = v_partner_id
  returning settings into v_settings;

  if not found then
    raise exception 'partner_profile_patch: partner not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('partnerId', v_partner_id, 'settings', v_settings);
end;
$$;

revoke all on function public.partner_profile_patch(jsonb, uuid) from public, anon;
grant execute on function public.partner_profile_patch(jsonb, uuid) to authenticated;

comment on function public.partner_profile_patch(jsonb, uuid) is
  'SAN-814: atomically merge reviewed partner settings fields for the signed-in member.';
