-- SAN-1502 · MDE Rentals — Enable Full Development Journeys and Defer Real-World Approval Gates
-- Development read access to search vectors and signals: while the server-owned rental phase is
-- 'development', a signed-in user can read the listing_embeddings / rental_signals rows of every apartment
-- THEY CAN ALREADY READ.
--
-- Why: the AI search reads as the SIGNED-IN USER (RLS applies). The semantic half of hybrid search joins
-- listing_embeddings, whose authenticated policy only admitted publicly eligible listings (or an authorized
-- test actor's fixture). A development apartment the user may already open was therefore found by keyword
-- but invisible to the vector search.
--
-- Deliberately NOT changed here: public.apartments policies. They belong to the development-activation work
-- (apartments_authenticated_development_access is rewritten by 20261016180000_san1502_development_activation_owner
-- in PR #342), and two migrations rewriting one policy would overwrite each other. This migration only says
-- "enrichment follows apartment visibility": the exists() subquery runs under the caller's own row security,
-- so whatever the apartment rules hide (another owner's draft, private/internal listings, inactive rows)
-- stays hidden here too, now and after any later change to those rules.
--
-- Unchanged: anonymous visitors (the anon policies and rental_enrichment_is_readable are not touched), every
-- write rule, and the launch phase (the new branch depends on rental_development_active(), so flipping
-- public.rental_runtime_settings.phase to 'launch' restores the previous behaviour exactly).

drop policy if exists listing_embeddings_select_authenticated on public.listing_embeddings;
create policy listing_embeddings_select_authenticated on public.listing_embeddings
  for select to authenticated
  using (
    public.rental_enrichment_is_readable(listing_id)
    or (auth.uid() is not null and public.rental_development_active()
        and exists (select 1 from public.apartments a where a.id = listing_id))
  );

drop policy if exists rental_signals_select_authenticated on public.rental_signals;
create policy rental_signals_select_authenticated on public.rental_signals
  for select to authenticated
  using (
    public.rental_enrichment_is_readable(apartment_id)
    or (auth.uid() is not null and public.rental_development_active()
        and exists (select 1 from public.apartments a where a.id = apartment_id))
  );
