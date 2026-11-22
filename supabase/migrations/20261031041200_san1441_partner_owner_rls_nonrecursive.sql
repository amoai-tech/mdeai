-- SAN-1441: Remove recursive partner_members owner RLS predicates.
-- An owner must be able to manage members; another partner's members must remain private.
-- The dedicated definer helper reads ONLY the current user's owner memberships and
-- is invoked by RLS and kept out of the exposed public RPC schema.
-- Do not use partner_ids_for_user(): staff/billing members must
-- never receive owner mutation rights.
begin;

create schema if not exists private;

create or replace function private.partner_owner_ids_for_user()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select pm.partner_id
  from public.partner_members as pm
  where pm.profile_id = (select auth.uid())
    and pm.role = 'owner';
$$;

comment on function private.partner_owner_ids_for_user() is
  'SAN-1441: SECURITY DEFINER owner-only membership IDs for recursion-free owner update/delete RLS.';

revoke all on function private.partner_owner_ids_for_user() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.partner_owner_ids_for_user() to authenticated, service_role;

drop policy if exists partner_members_update_owner on public.partner_members;
create policy partner_members_update_owner
  on public.partner_members
  for update to authenticated
  using (partner_id in (select private.partner_owner_ids_for_user()))
  with check (partner_id in (select private.partner_owner_ids_for_user()));

drop policy if exists partner_members_delete_owner on public.partner_members;
create policy partner_members_delete_owner
  on public.partner_members
  for delete to authenticated
  using (partner_id in (select private.partner_owner_ids_for_user()));

-- Remove the obsolete public RPC if an older local/dev attempt created it.
-- It is no longer referenced by the updated RLS policies.
drop function if exists public.partner_owner_ids_for_user();

commit;
