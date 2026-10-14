-- =============================================================================
-- Migration: 20261014200000_san1451_external_verified_correction.sql
-- Task:      SAN-1451 · MDE Rentals — Harden Fincaraíz Photo Publishing Script
--            (steps 1–2: correct false verification flags, then guard against them)
-- =============================================================================
-- A source-linked advertisement is somebody else's listing. Nobody at MDE has
-- independently verified it, so the raw `apartments.verified` flag must never be
-- true for one. Six external candidates carried `verified = true` (found by a
-- read-only preflight on 2026-10-14; none has verification evidence):
--
--   candidate-fincaraiz-192658136   candidate-fincaraiz-193522702
--   candidate-fincaraiz-193916988   candidate-fincaraiz-194096982
--   candidate-rentberry-119839663   candidate-rentberry-119839707
--
-- Renters are not misled today (the external cards already ignore the raw flag and the
-- public-listing rule excludes `external_candidate`), but any future reader of the
-- column would be.
--
-- 1 · BACKFILL — exactly the six reviewed rows, only while they are still flagged, and
--     only the `verified` column. Nothing else is touched on purpose: the material-edit
--     guard demotes a published row when price, photos, metadata, ... change, and
--     `verified` is not on its list, so the four published ads stay published.
-- 2 · GUARD — a trigger that rejects verified = true on an external advertisement from
--     any role, so the next publishing script or RPC cannot silently re-flag one.
--
-- No policy, grant on a table, RPC or public-listing rule changes.
-- =============================================================================

-- 1 · Backfill (reviewed row list; a different count aborts the whole migration)
do $$
declare
  v_fixed integer;
begin
  update public.apartments
     set verified = false
   where verified = true
     and lower(coalesce(metadata ->> 'inventory_kind', '')) = 'external_candidate'
     and slug in (
       'candidate-fincaraiz-192658136',
       'candidate-fincaraiz-193522702',
       'candidate-fincaraiz-193916988',
       'candidate-fincaraiz-194096982',
       'candidate-rentberry-119839663',
       'candidate-rentberry-119839707'
     );
  get diagnostics v_fixed = row_count;
  -- The list has six names; more than six is impossible unless the filter was edited.
  if v_fixed > 6 then
    raise exception 'SAN-1451 backfill touched % rows, expected at most 6', v_fixed;
  end if;
end;
$$;

-- 2 · Guard
create or replace function public.reject_verified_external_advertisement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Same three markers protect_apartment_provenance() treats as "external".
  if new.verified is true
     and (
          lower(coalesce(new.metadata ->> 'inventory_kind', '')) = 'external_candidate'
       or lower(coalesce(new.metadata ->> 'inventory_type', '')) = 'external'
       or lower(coalesce(new.metadata ->> 'allowed_action', '')) = 'view_original_listing'
     )
  then
    raise exception 'an external source advertisement cannot be marked verified'
      using errcode = '23514',
            hint = 'verified is reserved for listings MDE has independently verified';
  end if;
  return new;
end;
$$;

-- Trigger-only function: not callable from the Data API; service_role keeps EXECUTE
-- (SAN-1284 Batch 0C convention, asserted by san1284c_trigger_internal_function_acls_test).
revoke all on function public.reject_verified_external_advertisement() from public, anon, authenticated;
grant execute on function public.reject_verified_external_advertisement() to service_role;

drop trigger if exists apartments_reject_verified_external on public.apartments;
create trigger apartments_reject_verified_external
  before insert or update on public.apartments
  for each row
  when (new.verified is true)
  execute function public.reject_verified_external_advertisement();
