-- SAN-1502 · MDE Rentals — Enable Full Development Journeys and Defer Real-World Approval Gates
-- Development discovery excludes explicit test fixtures WITHOUT a second copy of the rule.
--
-- `apartments_authenticated_development_access` let any signed-in user read active apartments
-- whenever the server-owned rental phase was 'development'. PostgreSQL permissive policies combine
-- with OR, so that policy also exposed explicitly marked TEST FIXTURES — test data, not inventory.
--
-- It is redundant. `anyone_can_view_active_apartments` already grants discovery through the
-- canonical `rental_listing_is_public()` predicate, which is phase-aware and already excludes
-- `is_test_fixture` / `inventory_kind = 'test_fixture'` in development and `private` /
-- `internal` records in every phase. Fixtures keep their own untouched policies (authorized test
-- actor, creator, broker, administrator).
--
-- The smallest correct fix is therefore to DROP the duplicate policy rather than restate the
-- canonical rule in a second place. No business gate is added or removed: ordinary development
-- listings — including imported external candidates and `test_mode` MDE-managed development
-- inventory — stay readable without moderation, ownership verification, publishing approval or
-- photo-rights checks.
--
-- Forward-only and idempotent. Launch behaviour is unchanged: the canonical predicate applies the
-- full gate outside the development phase.
drop policy if exists apartments_authenticated_development_access on public.apartments;

comment on policy anyone_can_view_active_apartments on public.apartments is
  'SAN-1502: canonical apartment discovery via rental_listing_is_public(); development exposes active non-fixture, non-private listings and launch applies the full gate. Explicit test fixtures stay with their own policies.';
