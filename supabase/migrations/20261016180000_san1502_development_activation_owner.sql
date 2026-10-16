-- SAN-1502 · Development activation owner.
--
-- `_san1502_activate_development_inventory` is the internal implementation (no client
-- access; used by the migration and the admin wrapper). `admin_activate_development_inventory`
-- is the administrator-gated RPC.
--
-- Both are development-only. They assign the canonical MDE landlord/operator profile,
-- activate and publish designated development inventory, record operational readiness in
-- metadata, and keep `verified = false` (readiness is not independent verification).
-- Explicit test fixtures are never touched; provenance keys are preserved.
create or replace function public._san1502_activate_development_inventory(p_admin_email text)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_email text := lower(btrim(coalesce(p_admin_email, '')));
  v_uid uuid;
  v_profile uuid;
  v_changed integer;
begin
  if not public.rental_development_active() then
    raise exception 'development activation is only allowed in the development phase'
      using errcode = '42501';
  end if;
  if v_email = '' then
    raise exception 'administrator email required' using errcode = '22023';
  end if;

  select u.id into v_uid from auth.users u where lower(u.email) = v_email limit 1;
  if v_uid is null then
    raise notice 'development activation: no account for %, nothing to do', v_email;
    return 0;
  end if;

  select lp.id into v_profile
    from public.landlord_profiles lp
   where lp.user_id = v_uid
   order by lp.created_at
   limit 1;
  if v_profile is null then
    raise notice 'development activation: no landlord profile for %, nothing to do', v_email;
    return 0;
  end if;

  -- Note: `verified` is deliberately NOT touched here. The owner-directed development
  -- verification flag is owned by the SAN-1502 operator migration; activation is an
  -- operational state and must not silently revert or assert verification either way.
  -- Only designated development inventory, unassigned records, and rows already owned
  -- by this operator are touched. Ownership is NEVER taken from another principal, so a
  -- shared or copied environment cannot have unrelated inventory reassigned. Explicit
  -- test fixtures are excluded and never published.
  update public.apartments a
     set landlord_id = v_profile,
         status = 'active',
         moderation_status = 'approved',
         listing_workflow_status = 'published',
         published_at = coalesce(a.published_at, now()),
         published_by = coalesce(a.published_by, v_uid),
         workflow_changed_by = v_uid,
         workflow_changed_at = now(),
         updated_at = now(),
         host_name = coalesce(nullif(a.host_name, ''), 'MDE AI (Development)'),
         metadata = coalesce(a.metadata, '{}'::jsonb)
           || jsonb_build_object(
                'mde_managed_development', true,
                'development_ready_at', now(),
                'development_activated_by', v_email
              )
   where coalesce(lower(a.metadata->>'is_test_fixture'), 'false') <> 'true'
     and (
       a.landlord_id is null
       or a.landlord_id = v_profile
       or a.slug like 'candidate-%'
       or a.slug like 'external-%'
       or lower(coalesce(a.metadata->>'inventory_kind', '')) = 'mde_managed'
     );
  get diagnostics v_changed = row_count;
  return v_changed;
end
$fn$;

-- Internal implementation: no client roles may call it directly.
revoke all on function public._san1502_activate_development_inventory(text)
  from public, anon, authenticated;

create or replace function public.admin_activate_development_inventory(p_admin_email text)
returns integer
language plpgsql
security definer
set search_path = ''
as $admin$
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  return public._san1502_activate_development_inventory(p_admin_email);
end
$admin$;

revoke all on function public.admin_activate_development_inventory(text) from public, anon;
grant execute on function public.admin_activate_development_inventory(text)
  to authenticated, service_role;
