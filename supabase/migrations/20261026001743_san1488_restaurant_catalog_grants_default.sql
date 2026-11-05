-- SAN-1488 · MDE Restaurants — Secure Supabase Before Adding New Listings
--
-- Least-privilege app catalog: public readers do not need TRIGGER, REFERENCES,
-- MAINTAIN or anonymous DML. SQL privileges are independent of RLS.
-- TRUNCATE is already addressed for all app-owned tables by merged SAN-1287;
-- do not duplicate or weaken its canonical migration.
--
-- A new catalog row defaults to inactive (a reversible draft), never to
-- verified. Existing rows are not updated. Phase A has NO approval, ownership
-- or verification prerequisite: authorized moderators/admins and service code
-- can explicitly set is_active=true on insertion or update immediately.
-- The application_phase runtime setting and existing restaurant RLS policies
-- remain unchanged. Launch certification is a separate owner decision.

revoke trigger, references, maintain on table public.restaurants
  from public, anon, authenticated;

-- Current application RLS grants anonymous users only SELECT; remove
-- misleading DML privileges that cannot succeed under those policies.
revoke insert, update, delete on table public.restaurants from anon;

alter table public.restaurants alter column is_active set default false;
