-- =============================================================================
-- Migration: 20261016014604_san1502_authorized_test_search.sql
-- Task:      SAN-1502 · MDE Rentals — Enable Full Development Journeys and
--            Defer Real-World Approval Gates (PR 2: authorized test search)
-- =============================================================================
-- PR 1 added the authorization primitive (is_authorized_test_actor(), self
-- scoped to auth.uid()) and the one development-availability predicate
-- (rental_test_listing_is_available()). This migration is the RLS branch they
-- were built for: an authenticated holder of an ACTIVE development grant may
-- read a published test fixture whose publishing and photo rights are not
-- withdrawn. Ordinary authenticated customers and anonymous visitors are
-- unaffected: is_authorized_test_actor() is false without a live grant, and
-- rental_test_listing_is_available() matches only is_test_fixture rows.
--
-- No second search system: the canonical search path keeps its existing
-- filters and simply runs with the tester's own user-scoped client, so RLS is
-- the boundary. The public predicate rental_listing_is_public() is untouched,
-- so fixtures remain invisible to customers.
--
-- Replay-safe: drop policy if exists + create policy.
-- =============================================================================

drop policy if exists apartments_select_authorized_test_actor on public.apartments;
create policy apartments_select_authorized_test_actor
  on public.apartments
  for select
  to authenticated
  using (
    public.is_authorized_test_actor()
    and public.rental_test_listing_is_available(
          status, moderation_status, listing_workflow_status, metadata
        )
  );

comment on policy apartments_select_authorized_test_actor on public.apartments is
  'SAN-1502 PR2: an authorized development test actor may read published test fixtures. is_authorized_test_actor() is self-scoped to auth.uid(); rental_test_listing_is_available() matches only fixtures whose publishing/photo rights are not withdrawn.';
