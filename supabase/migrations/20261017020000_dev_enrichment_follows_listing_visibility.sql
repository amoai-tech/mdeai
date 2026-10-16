-- =============================================================================
-- Migration: 20261017020000_dev_enrichment_follows_listing_visibility.sql
-- Task:      SAN-1502 · MDE Rentals — Enable Full Development Journeys and
--            Defer Real-World Approval Gates
-- Also unblocks SAN-1523 · MDE AI — Process Embedding Jobs Reliably and Keep
--            Semantic Search Current
-- =============================================================================
-- Problem. Semantic rental search runs as the caller, so it can only see a
-- listing's search fingerprint (public.listing_embeddings) and score row
-- (public.rental_signals) when the RLS policies on those tables allow it.
-- Both policies call public.rental_enrichment_is_readable(), and 20261016101500
-- gave that helper its own copy of the strict launch rule (approved + published
-- + has a landlord). In development an ordinary active listing is visible in the
-- catalog (public.rental_listing_is_public()), but its fingerprint was not, so
-- a visitor could browse it and never find it by meaning.
--
-- Fix. One rule instead of two: enrichment is readable exactly when the listing
-- itself is publicly eligible, as decided by rental_listing_is_public(). That
-- predicate already
--   * relaxes the approval gates only while rental_development_active();
--   * always hides listings marked private/internal;
--   * always hides test fixtures from the public;
--   * returns to the strict launch rule when the phase flips to launch.
-- The authorized-test-actor path (a tester may read a fixture they are entitled
-- to) is kept unchanged.
--
-- Nothing is fabricated: this changes who may READ derived search data. It does
-- not approve, publish, verify or assign ownership to any listing.
--
-- Forward-only and replay-safe: create or replace; the policies that call the
-- helper are untouched.
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
  'SAN-1502: enrichment (search fingerprints, scores) is readable exactly when the listing is publicly eligible under the current phase (rental_listing_is_public), or when an authorized test actor may see the test fixture. Private and fixture listings stay hidden from the public in both phases.';

revoke all on function public.rental_enrichment_is_readable(uuid) from public;
grant execute on function public.rental_enrichment_is_readable(uuid)
  to anon, authenticated, service_role;
