-- =============================================================================
-- Migration: 20261008090200_san468_public_eligibility_and_photo_rights.sql
-- Task:      SAN-468 · REAL-002 — Make Production Rental Inventory Launch-Ready
-- =============================================================================
-- SAN-468 §4.2 (public/search eligibility), §5.4 (authorized photo evidence) and
-- the real-inventory quarantine of the active-but-unverified Calle 10 row.
--
-- ONE canonical public-eligibility predicate, reused by RLS and the hybrid search
-- RPC. It is the SAN-386 hard-eligibility contract
--     active + approved + published + canonical landlord
-- plus the SAN-468 fail-closed inventory classes
--     not a test fixture, not an unverified external candidate.
-- SAN-386 owns the contract; this migration materializes it exactly once so every
-- public path consumes the same definition instead of inventing a second one.
--
-- WHAT THIS DOES
--   1. Adds public.rental_listing_is_public(...) — a scalar, immutable predicate.
--   2. Repoints the anonymous SELECT policy and the authenticated "catalog" branch
--      at that predicate, so a row that is merely status='active' can no longer be
--      public. Brokers still see their own drafts; admins still see everything.
--   3. Adds rental_listing_images.rights_status (+ rights_evidence) so a usable
--      photo can carry an explicit publishing-rights state. Default is
--      'unverified', so an image without a recorded right never certifies.
--   4. Quarantines (demotes to inactive/paused) the one known active row that has
--      no verified property, owner, photo, freshness or coordinates. It is scoped
--      to that exact id and is a no-op once it is not active.
--
-- REPLAY-SAFE: CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS,
-- and a guarded UPDATE are idempotent.
-- =============================================================================

-- §1 — the canonical public-eligibility contract ------------------------------
create or replace function public.rental_listing_is_public(
  p_status text,
  p_moderation_status text,
  p_listing_workflow_status text,
  p_landlord_id uuid,
  p_metadata jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    p_status = 'active'
    and p_moderation_status = 'approved'
    and p_listing_workflow_status = 'published'
    and p_landlord_id is not null
    and coalesce(lower(p_metadata->>'is_test_fixture'), 'false') <> 'true'
    and coalesce(lower(p_metadata->>'inventory_kind'), '') not in ('test_fixture', 'external_candidate')
    and coalesce(lower(p_metadata->>'inventory_type'), '') <> 'external'
    and coalesce(lower(p_metadata->>'allowed_action'), '') <> 'view_original_listing';
$$;

comment on function public.rental_listing_is_public(text, text, text, uuid, jsonb) is
  'SAN-468 §4.2 / SAN-386 canonical public-eligibility predicate: active + approved + published + canonical landlord, excluding fixtures and unverified external candidates.';

revoke all on function public.rental_listing_is_public(text, text, text, uuid, jsonb) from public;
grant execute on function public.rental_listing_is_public(text, text, text, uuid, jsonb)
  to anon, authenticated, service_role;

-- §2 — anonymous public SELECT now requires the canonical predicate -------------
drop policy if exists anyone_can_view_active_apartments on public.apartments;
create policy anyone_can_view_active_apartments
  on public.apartments
  for select
  to public
  using (
    public.rental_listing_is_public(
      status, moderation_status, listing_workflow_status, landlord_id, metadata
    )
  );

-- §2b — authenticated catalog branch now requires the same predicate -----------
-- Owner and admin branches are unchanged, so a broker keeps its own drafts and an
-- admin keeps full visibility.
drop policy if exists apartments_select_broker_or_catalog on public.apartments;
create policy apartments_select_broker_or_catalog
  on public.apartments
  for select
  to authenticated
  using (
    (landlord_id in (select public.acting_landlord_ids()))
    or (select public.is_admin())
    or public.rental_listing_is_public(
         status, moderation_status, listing_workflow_status, landlord_id, metadata
       )
  );

-- §3 — photo publishing-rights evidence on the existing image table ------------
alter table public.rental_listing_images
  add column if not exists rights_status text not null default 'unverified';
alter table public.rental_listing_images
  add column if not exists rights_evidence text;

alter table public.rental_listing_images
  drop constraint if exists rental_listing_images_rights_status_check;
alter table public.rental_listing_images
  add constraint rental_listing_images_rights_status_check
  check (rights_status in ('unverified', 'authorized', 'revoked'));

comment on column public.rental_listing_images.rights_status is
  'SAN-468 §5.4: whether MDE may publish this photo. Only ''authorized'' counts as usable launch photo evidence.';
comment on column public.rental_listing_images.rights_evidence is
  'SAN-468 §5.4: free-text/URL reference for the recorded photo publishing permission.';

-- §4 — quarantine the active-but-unverified known row -------------------------
update public.apartments a
   set status = 'inactive',
       listing_workflow_status = 'paused',
       metadata = coalesce(a.metadata, '{}'::jsonb)
         || jsonb_build_object(
              'san468_quarantine',
              jsonb_build_object(
                'at', now(),
                'reason', 'active without verified property, owner, photo, freshness or coordinates'
              )
            )
 where a.id = 'd9e96fb4-2adf-4bb3-99d6-70c0692b6bb8'
   and a.status = 'active'
   and coalesce(a.verified, false) = false
   and not exists (
     select 1
       from public.property_verifications pv
      where pv.apartment_id = a.id
        and pv.status = 'verified'
        and pv.verified_at is not null
   );

-- §5 — stop private-candidate verification rows from being publicly readable ---
-- property_verifications_select_all was USING (true), so anon could read the
-- verification status/notes of every apartment, including the private SAN-1431
-- external candidates whose apartment rows are correctly hidden. Public
-- transparency is preserved only for publicly eligible listings; admins and the
-- owning broker keep their own visibility.
drop policy if exists property_verifications_select_all on public.property_verifications;
drop policy if exists property_verifications_select_visible on public.property_verifications;

-- Anonymous/renter visibility: only verifications for publicly eligible listings.
-- Kept separate so anon never evaluates acting_landlord_ids(), which is not granted
-- to the anonymous role.
create policy property_verifications_select_public
  on public.property_verifications
  for select
  to public
  using (
    exists (
      select 1
        from public.apartments a
       where a.id = property_verifications.apartment_id
         and public.rental_listing_is_public(
              a.status, a.moderation_status, a.listing_workflow_status, a.landlord_id, a.metadata
            )
    )
  );

-- Owning broker / admin visibility for their own (including private) listings.
create policy property_verifications_select_owner_or_admin
  on public.property_verifications
  for select
  to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1
        from public.apartments a
       where a.id = property_verifications.apartment_id
         and a.landlord_id in (select public.acting_landlord_ids())
    )
  );
