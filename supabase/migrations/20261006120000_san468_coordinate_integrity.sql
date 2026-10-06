-- =============================================================================
-- Migration: 20261006120000_san468_coordinate_integrity.sql
-- Task:      SAN-468 · REAL-002 — Make Production Rental Inventory Launch-Ready
-- =============================================================================
-- Implements SAN-468 Step 2.2 and Step 2.3 on public.apartments.
--
--   §2.2  Enforce the coordinate invariant:
--           (latitude is null and longitude is null)
--           OR (both present, latitude -90..90, longitude -180..180)
--         and keep PostGIS `location geography(Point,4326)` synchronized from
--         longitude/latitude via a BEFORE trigger, so the two representations
--         cannot silently drift.
--
--   §2.3  Fail closed: default `status` to 'inactive' (was 'active') so a new
--         apartment cannot become publicly active by omission. No row is updated.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   * No mass update / backfill. The one production row with latitude/longitude
--     but a null `location` is ownerless, inactive, paused, and has no provenance
--     for its coordinates; §2.2 says backfill only when trusted, so it is left
--     untouched and surfaced by `npm run verify:inventory-quality`. The trigger
--     synchronizes it on its next coordinate/location write.
--   * No RLS, grant, index, other table, or unrelated data change.
--
-- SAFETY / REPLAY
--   * The CHECK predicate already holds for every existing row (measured
--     2026-10-06: 0 half pairs, 0 out-of-range pairs).
--   * DROP ... IF EXISTS + ADD makes constraint/trigger replay-safe; CREATE OR
--     REPLACE and ALTER ... SET DEFAULT are idempotent.
--   * PostGIS is installed in schema `public` on this project, so the ST_* calls
--     resolve under `search_path = public, pg_temp`.
-- =============================================================================

-- §2.2a — coordinate pair invariant -----------------------------------------
alter table public.apartments
  drop constraint if exists apartments_coordinate_pair_check;

alter table public.apartments
  add constraint apartments_coordinate_pair_check
  check (
    (latitude is null and longitude is null)
    or (
      latitude is not null
      and longitude is not null
      and latitude between -90 and 90
      and longitude between -180 and 180
    )
  );

-- §2.2b — single source of truth for `location` -----------------------------
create or replace function public.sync_apartment_location()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.latitude is null or new.longitude is null then
    new.location := null;
  else
    new.location := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  end if;
  return new;
end;
$$;

comment on function public.sync_apartment_location() is
  'SAN-468 §2.2: derive apartments.location from longitude/latitude so the pair cannot drift.';

drop trigger if exists trg_sync_apartment_location on public.apartments;

create trigger trg_sync_apartment_location
  before insert or update of latitude, longitude, location
  on public.apartments
  for each row
  execute function public.sync_apartment_location();

-- Trigger functions are not reachable through the Data API, and PostgreSQL checks
-- EXECUTE at trigger creation rather than fire time (SAN-1284 batch 0C), so removing
-- end-user EXECUTE avoids adding a public RPC surface without disabling the trigger.
revoke execute on function public.sync_apartment_location() from public, anon, authenticated;
-- SAN-1284 batch 0C contract: app-owned trigger functions keep service_role EXECUTE.
grant execute on function public.sync_apartment_location() to service_role;

-- §2.3 — fail closed by default ---------------------------------------------
alter table public.apartments
  alter column status set default 'inactive';
