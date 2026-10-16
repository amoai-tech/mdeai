-- SAN-1502 · The MDE AI development operator owns the 19 temporary listings with
-- full rights, and those listings are verified for development.
--
-- Supersedes the SAN-1431 default that development rows stay verified=false. The
-- owner has directed full development access; this is a development-phase operational
-- flag, not a launch verification claim. Ordinary writers still cannot set it.
--
-- 1. In development, an authorized operator (admin / service_role) may set the
--    development verification flag; ordinary writers are still forced to false.
-- 2. The live development batch (Fincaraiz + Rentberry) is assigned to the MDE AI
--    operator (ai@socialmediaville.ca) with full rights and verified=true. Fresh
--    databases never contain the Fincaraiz batch, so the data step is a no-op there
--    and the staged pgTAP fixtures keep verified=false.

create or replace function public.enforce_apartment_initial_state()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if public.rental_development_active() then
    if public.is_admin() or current_user in ('postgres', 'supabase_admin', 'service_role') then
      return new;
    end if;
    new.verified := false;
    return new;
  end if;
  if public.is_admin() or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  new.status := 'inactive';
  new.moderation_status := 'pending';
  new.listing_workflow_status := 'draft';
  new.verified := false;
  new.published_at := null;
  new.published_by := null;
  return new;
end;
$function$;

do $devop$
declare
  v_profile uuid;
begin
  if not public.rental_development_active() then
    return;
  end if;

  -- Live-only sentinel: fresh databases never contain the Fincaraiz production batch.
  if not exists (
    select 1 from public.apartments
    where slug like 'candidate-fincaraiz-%'
      and host_name = 'MDE AI (Development)'
  ) then
    raise notice 'SAN-1502: no live development operator batch in this environment';
    return;
  end if;

  select lp.id into v_profile
  from public.landlord_profiles lp
  join auth.users u on u.id = lp.user_id
  where lower(u.email) = 'ai@socialmediaville.ca';

  if v_profile is null then
    raise notice 'SAN-1502: MDE AI development operator profile not found';
    return;
  end if;

  update public.landlord_profiles
  set display_name = 'MDE AI (Development)',
      verification_status = 'approved',
      verified_at = coalesce(verified_at, now())
  where id = v_profile
    and (display_name is distinct from 'MDE AI (Development)'
      or verification_status is distinct from 'approved'
      or verified_at is null);

  update public.apartments a
  set verified = true,
      landlord_id = v_profile,
      host_name = 'MDE AI (Development)',
      metadata = coalesce(a.metadata, '{}'::jsonb) - 'source_name' - 'source_provider'
  where (a.slug like 'candidate-fincaraiz-%' or a.slug like 'candidate-rentberry-%')
    and nullif(a.source_url, '') is not null
    and (a.verified is distinct from true
      or a.landlord_id is distinct from v_profile
      or a.host_name is distinct from 'MDE AI (Development)'
      or coalesce(a.metadata, '{}'::jsonb) ?| array['source_name', 'source_provider']);

  raise notice 'SAN-1502: development operator rights applied to % listings',
    (select count(*) from public.apartments
      where (slug like 'candidate-fincaraiz-%' or slug like 'candidate-rentberry-%')
        and landlord_id = v_profile);
end
$devop$;
