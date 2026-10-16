-- SAN-1502 · MDE Rentals — Enable Full Development Journeys and Defer Real-World Approval Gates
-- Development discovery excludes explicit test fixtures.
--
-- apartments_authenticated_development_access lets any signed-in user read active apartments while the
-- server-owned rental phase is 'development' and the record is not private/internal. It did not exclude
-- explicitly marked TEST FIXTURES, so activating one would have made it readable to unrelated signed-in
-- users. Fixtures are test data, not inventory: they stay available to the people who manage them through
-- their own policies (authorized test actor, creator, broker, administrator), which are NOT touched here.
--
-- Everything else is unchanged and nothing is added as a business gate: ordinary development listings,
-- including imported external candidates, stay readable without moderation, ownership verification,
-- publishing approval or photo-rights checks. The phase and private/internal conditions already in production
-- are kept as they are, so this replaces the policy with the same rule plus the fixture exclusion.
--
-- Forward-only and idempotent (drop policy if exists + create). Launch is a no-op: the policy still depends on
-- rental_development_active(), so outside development it grants nothing.

drop policy if exists apartments_authenticated_development_access on public.apartments;
create policy apartments_authenticated_development_access on public.apartments
  for select to authenticated
  using (
    auth.uid() is not null
    and public.rental_development_active()
    and status = 'active'
    and coalesce(lower(metadata ->> 'visibility'), '') not in ('private', 'internal')
    and coalesce(lower(metadata ->> 'is_test_fixture'), 'false') <> 'true'
    and coalesce(lower(metadata ->> 'inventory_kind'), '') <> 'test_fixture'
  );

comment on policy apartments_authenticated_development_access on public.apartments is
  'SAN-1502: in the development phase any signed-in user may read active, non-private, non-fixture apartments. Test fixtures stay with their own policies (authorized tester, creator, broker, admin).';
