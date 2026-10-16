-- Phase A: display the existing MDE AI operator on temporary rental records.
-- The authenticated MDE account already owns their landlord-profile assignment.
-- This is an operational development label, not legal property ownership verification.
-- Remove only redundant source-name display metadata; preserve source_url and
-- source_listing_id for truthful provenance and explicit prelaunch cleanup.
-- Do not change verified, availability, broker ownership, publication or booking rules.
-- Data-only and idempotent. Safe as a no-op when the test batch is absent.
do $phase_a$
declare
  v_profile uuid;
begin
  if not public.rental_development_active() then
    return;
  end if;

  select lp.id into v_profile
  from public.landlord_profiles lp
  join auth.users u on u.id = lp.user_id
  where lower(u.email) = 'ai@socialmediaville.ca';

  if v_profile is null then
    return;
  end if;

  update public.apartments a
  set host_name = 'MDE AI (Development)',
      metadata = coalesce(a.metadata, '{}'::jsonb) - 'source_name' - 'source_provider'
  where (a.slug like 'candidate-fincaraiz-%'
         or a.slug like 'candidate-rentberry-%')
    and a.landlord_id = v_profile
    and nullif(a.source_url, '') is not null
    and (a.host_name is distinct from 'MDE AI (Development)'
         or coalesce(a.metadata, '{}'::jsonb) ?| array['source_name','source_provider']);
end
$phase_a$;
