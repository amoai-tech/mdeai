-- =============================================================================
-- Migration: 20261009090200_san1432_private_evidence_rls.sql
-- Task:      SAN-1432 — Protect private rental evidence from public access
-- =============================================================================
-- Raw verification evidence (freshness log, image source/rights, grounding text)
-- was readable by anon and by every authenticated user through five USING (true)
-- policies. Public rental cards and authorized photos are served from apartments
-- fields and the public listing-photos Storage bucket, so no raw evidence needs a
-- public read policy. Replace all five with admin/owning-broker scope only and
-- remove client write grants that no client path uses.
--
-- The property-verification RLS pattern from 20261008090200 is the reference; the
-- new policies are TO authenticated only (never anon), so acting_landlord_ids()
-- is never evaluated for an anonymous caller.
-- =============================================================================

-- 1 · Drop every permissive SELECT policy.
drop policy if exists anon_select_rental_freshness_log on public.rental_freshness_log;
drop policy if exists authenticated_select_rental_freshness_log on public.rental_freshness_log;
drop policy if exists anon_select_rental_listing_images on public.rental_listing_images;
drop policy if exists authenticated_select_rental_listing_images on public.rental_listing_images;
drop policy if exists rental_grounding_public_select on public.rental_grounding;

-- 2 · Admin or owning broker only, for private and published listings alike.
create policy rental_freshness_log_select_owner_or_admin
  on public.rental_freshness_log for select to authenticated
  using (
    exists (
      select 1 from public.apartments a
       where a.id = rental_freshness_log.listing_id
         and (public.is_admin() or a.landlord_id in (select public.acting_landlord_ids()))
    )
  );

create policy rental_listing_images_select_owner_or_admin
  on public.rental_listing_images for select to authenticated
  using (
    exists (
      select 1 from public.apartments a
       where a.id = rental_listing_images.listing_id
         and (public.is_admin() or a.landlord_id in (select public.acting_landlord_ids()))
    )
  );

create policy rental_grounding_select_owner_or_admin
  on public.rental_grounding for select to authenticated
  using (
    exists (
      select 1 from public.apartments a
       where a.id = rental_grounding.apartment_id
         and (public.is_admin() or a.landlord_id in (select public.acting_landlord_ids()))
    )
  );

-- 3 · No client writes; anon no longer reads. service_role keeps full access.
revoke insert, update, delete, truncate on table public.rental_freshness_log from anon, authenticated;
revoke insert, update, delete, truncate on table public.rental_listing_images from anon, authenticated;
revoke insert, update, delete, truncate on table public.rental_grounding from anon, authenticated;
revoke select on table public.rental_freshness_log from anon;
revoke select on table public.rental_listing_images from anon;
revoke select on table public.rental_grounding from anon;
