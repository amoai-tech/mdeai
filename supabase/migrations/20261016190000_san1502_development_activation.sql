-- SAN-1502 · Phase A: activate designated development inventory under the MDE
-- development administrator, without claiming real-world verification.
--
-- Imported development listings (the Fincaraíz/Rentberry candidates and the
-- MDE-managed imports) must be fully operable for Phase A testing, and 19 of them
-- currently carry `verified = true`, which asserts verification that never happened.
-- `verified` stays `false`; operational readiness is recorded in metadata instead.
--
-- Development-only, idempotent, and a no-op on any environment without the account.
-- Provenance (`source_*`) is preserved; nothing here is asserted as launch truth.
do $activation$
declare
  v_changed integer;
begin
  if not public.rental_development_active() then
    raise exception 'SAN-1502 development activation is only allowed during development';
  end if;
  select public._san1502_activate_development_inventory('ai@socialmediaville.ca') into v_changed;
  raise notice 'SAN-1502: % designated development listing(s) activated', v_changed;
end
$activation$;
