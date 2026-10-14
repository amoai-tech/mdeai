-- Prevent a public/guest viewing RPC (which runs as service_role) from writing
-- leads or showings against administrator-only development fixtures.
-- This guard installs before the new admin viewing RPC and applies to every
-- write path, not just the Next.js admin panel.
create or replace function public.block_nonadmin_test_viewing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if NEW.apartment_id is not null
     and exists (
       select 1 from public.apartments a
       where a.id = NEW.apartment_id
         and lower(coalesce(a.metadata->>'is_test_fixture','false')) = 'true'
     )
     and not coalesce(public.is_admin(), false) then
    raise exception 'test rental viewing requires administrator'
      using errcode = '42501';
  end if;
  return NEW;
end;
$function$;

revoke all on function public.block_nonadmin_test_viewing() from public, anon, authenticated;

drop trigger if exists block_nonadmin_test_lead on public.leads;
create trigger block_nonadmin_test_lead
before insert or update of apartment_id on public.leads
for each row execute function public.block_nonadmin_test_viewing();

drop trigger if exists block_nonadmin_test_showing on public.showings;
create trigger block_nonadmin_test_showing
before insert or update of apartment_id on public.showings
for each row execute function public.block_nonadmin_test_viewing();
