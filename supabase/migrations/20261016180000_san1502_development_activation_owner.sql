-- SAN-1502 · Development activation owner.
--
-- One idempotent, development-only operation that makes designated development
-- inventory fully operable under the MDE development administrator:
--   * assigns the canonical MDE landlord/operator profile,
--   * activates and publishes it,
--   * records operational readiness in metadata (`mde_managed_development`).
--
-- Ownership is NEVER taken from another principal: a row is only claimed when it is
-- unassigned or already owned by the operator. `verified` is not touched here — the
-- owner-directed development verification flag is owned by 20261016140000.
--
-- End users cannot execute it (service_role / migration owner only), and outside the
-- development phase it is a no-op rather than an error.
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
    raise notice 'development activation skipped: phase is not development';
    return 0;
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
       a.slug like 'candidate-%'
       or a.slug like 'external-%'
       or lower(coalesce(a.metadata->>'inventory_kind', '')) = 'mde_managed'
       or a.landlord_id = v_profile
     )
     -- Never claim a record that belongs to another principal.
     and (a.landlord_id is null or a.landlord_id = v_profile)
     -- Idempotent: skip rows already active/owned/marked, so repeat runs do not rewrite
     -- the update or audit timestamps.
     and (
       a.status <> 'active'
       or a.moderation_status <> 'approved'
       or a.listing_workflow_status <> 'published'
       or a.landlord_id is distinct from v_profile
       or coalesce(a.metadata->>'mde_managed_development', '') <> 'true'
     );
  get diagnostics v_changed = row_count;
  return v_changed;
end
$fn$;

-- Internal operation: no end-user role may execute it.
revoke all on function public._san1502_activate_development_inventory(text)
  from public, anon, authenticated;
grant execute on function public._san1502_activate_development_inventory(text)
  to service_role;
