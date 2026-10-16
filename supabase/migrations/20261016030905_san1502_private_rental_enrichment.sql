-- =============================================================================
-- Migration: 20261016030905_san1502_private_rental_enrichment.sql
-- Task:      SAN-1502 · MDE Rentals — Enable Full Development Journeys and
--            Defer Real-World Approval Gates (PR 2 security)
-- =============================================================================
-- Live production allowed anon/authenticated SELECT using(true) on
-- public.listing_embeddings and public.rental_signals. Those tables carry
-- vectors, scores and metadata tied to specific apartments — including
-- non-public and test-fixture listings — so the open policy leaked enrichment
-- about private inventory.
--
-- This tightens both tables to ONE rule, reusing the canonical predicates:
--   * public users may read enrichment only for a publicly eligible apartment
--     (rental_listing_is_public);
--   * an authorized development test actor may additionally read enrichment for
--     a published test fixture they are entitled to see
--     (is_authorized_test_actor() + rental_test_listing_is_available()).
-- The decision lives in a SECURITY DEFINER helper so the policy does not depend
-- on the caller''s (possibly empty) view of public.apartments.
--
-- Forward-only and replay-safe: create or replace + drop policy if exists.
-- =============================================================================

create or replace function public.rental_enrichment_is_readable(p_apartment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_apartment_id is not null
     and exists (
       select 1
         from public.apartments a
        where a.id = p_apartment_id
          and (
            public.rental_listing_is_public(
              a.status, a.moderation_status, a.listing_workflow_status, a.landlord_id, a.metadata
            )
            or (
              public.is_authorized_test_actor()
              and public.rental_test_listing_is_available(
                a.status, a.moderation_status, a.listing_workflow_status, a.metadata
              )
            )
          )
     );
$function$;

comment on function public.rental_enrichment_is_readable(uuid) is
  'SAN-1502 PR2 security: true when enrichment rows for the apartment may be read — publicly eligible, or a development fixture the authenticated test actor is entitled to see.';

revoke all on function public.rental_enrichment_is_readable(uuid) from public;
grant execute on function public.rental_enrichment_is_readable(uuid)
  to anon, authenticated, service_role;

-- listing_embeddings ---------------------------------------------------------
drop policy if exists "Listing embeddings are readable by all" on public.listing_embeddings;
drop policy if exists listing_embeddings_public_select on public.listing_embeddings;
drop policy if exists listing_embeddings_select_anon on public.listing_embeddings;
drop policy if exists listing_embeddings_select_authenticated on public.listing_embeddings;

create policy listing_embeddings_select_anon
  on public.listing_embeddings
  for select
  to anon
  using (public.rental_enrichment_is_readable(listing_id));

create policy listing_embeddings_select_authenticated
  on public.listing_embeddings
  for select
  to authenticated
  using (public.rental_enrichment_is_readable(listing_id));

-- rental_signals --------------------------------------------------------------
drop policy if exists rental_signals_public_select on public.rental_signals;
drop policy if exists rental_signals_select_anon on public.rental_signals;
drop policy if exists rental_signals_select_authenticated on public.rental_signals;

create policy rental_signals_select_anon
  on public.rental_signals
  for select
  to anon
  using (public.rental_enrichment_is_readable(apartment_id));

create policy rental_signals_select_authenticated
  on public.rental_signals
  for select
  to authenticated
  using (public.rental_enrichment_is_readable(apartment_id));
