-- SAN-1502 · Phase A: activate designated development inventory under the MDE
-- development administrator.
--
-- `verified` is NOT changed here. The owner directed full development access, and
-- 20261016140000 ("give the MDE AI development operator full rights and verify the 19
-- test listings") sets `verified = true` for the live development batch as a
-- development-phase operational flag. This migration records operational readiness in
-- metadata (`mde_managed_development`) instead of touching that flag.
--
-- Development-only and idempotent: outside the development phase it is a no-op with a
-- notice, so it can never abort a `db push`.
do $activation$
declare
  v_changed integer;
begin
  if not public.rental_development_active() then
    raise notice 'SAN-1502: phase is not development; activation skipped';
    return;
  end if;
  select public._san1502_activate_development_inventory('ai@socialmediaville.ca') into v_changed;
  raise notice 'SAN-1502: % designated development listing(s) activated', v_changed;
end
$activation$;
