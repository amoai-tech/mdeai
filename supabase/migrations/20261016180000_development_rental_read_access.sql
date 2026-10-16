-- SAN-1502 · MDE Rentals — Enable Full Development Journeys and Defer Real-World Approval Gates
-- Development read access: a signed-in user can read EVERY apartment (and its search vectors and signals)
-- while the server-owned rental phase is 'development'.
--
-- Why: the AI search and the app read apartments as the SIGNED-IN USER (RLS applies). Two rules still
-- hid listings that were inactive, pending or booked, even though the search functions no longer do:
--   1. apartments_authenticated_development_access required status = 'active';
--   2. rental_enrichment_is_readable() (listing_embeddings and rental_signals) required a publicly eligible
--      listing, or an authorized test actor with a published fixture.
--
-- Unchanged on purpose: ANONYMOUS visitors (auth.uid() is null) get nothing extra, so the public catalog
-- and the SAN-1502 fixture-exclusion boundary are intact; every write rule; and the launch phase, where
-- both rules fall back to exactly the previous behaviour because they depend on rental_development_active().
-- Flipping public.rental_runtime_settings.phase to 'launch' removes this access again.

drop policy if exists apartments_authenticated_development_access on public.apartments;
create policy apartments_authenticated_development_access on public.apartments
  for select to authenticated
  using (auth.uid() is not null and public.rental_development_active());

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
            -- development: any signed-in user, any listing (anonymous callers have no auth.uid())
            or (auth.uid() is not null and public.rental_development_active())
          )
     );
$function$;

comment on function public.rental_enrichment_is_readable(uuid) is
  'SAN-1502: enrichment rows for an apartment may be read when it is publicly eligible, a fixture an authorized test actor may see, or — only in the development phase — to any signed-in user.';
