-- SAN-1622: Revocation must run with the authenticated caller's identity.
-- Reuse the one canonical staff-link version RPC, now allowing trusted
-- Super Admins to revoke links for ownerless/other-organizer development events.
-- Do not make event publication or business approval a prerequisite.
create or replace function public.bump_staff_link_version(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_new_version integer;
begin
  if v_actor is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  update public.events
     set staff_link_version = coalesce(staff_link_version, 0) + 1
   where id = p_event_id
     and (organizer_id = v_actor or (select public.is_admin()))
   returning staff_link_version into v_new_version;

  if not found then
    raise exception 'NOT_ORGANIZER' using errcode = '42501';
  end if;

  return v_new_version;
end;
$function$;

revoke all on function public.bump_staff_link_version(uuid) from public, anon;
grant execute on function public.bump_staff_link_version(uuid) to authenticated;
