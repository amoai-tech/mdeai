-- SAN-1416 · Development unblock for the nine Fincaraíz test advertisements
--
-- These nine listings were imported from a third-party site (Fincaraíz) purely for
-- development and testing. They are removed before launch. While the database is in
-- the `development` phase they must behave as ordinary MDE listings that an
-- administrator can fully manage and that a renter can request, with no third-party
-- read-only or "not independently verified" treatment.
--
-- This removes only the metadata keys that drive that treatment. The origin facts
-- (`source_provider`, `source_original_url`, `source_listing_reference`,
-- `source_checked_at`) and the photo-permission attestation are preserved so the
-- batch can still be identified and removed before launch. `verified` is untouched
-- (still false): nothing here claims independent verification.
--
-- Guarded and idempotent: it does nothing outside the development phase and does
-- nothing on an environment that does not contain the one-time live batch.
do $unrestrict$
declare
  v_slugs text[] := array[
    'candidate-fincaraiz-193916988',
    'candidate-fincaraiz-192658136',
    'candidate-fincaraiz-194158672',
    'candidate-fincaraiz-194188459',
    'candidate-fincaraiz-193811264',
    'candidate-fincaraiz-194104380',
    'candidate-fincaraiz-194115640',
    'candidate-fincaraiz-194096982',
    'candidate-fincaraiz-193522702'
  ];
  v_batch integer;
  v_changed integer;
begin
  if not public.rental_development_active() then
    raise exception 'SAN-1416 third-party unrestrict is only allowed during development';
  end if;

  select count(*) into v_batch from public.apartments where slug = any(v_slugs);
  if v_batch = 0 then
    raise notice 'SAN-1416: no Fincaraíz test batch in this environment';
    return;
  end if;

  update public.apartments a
  set metadata = a.metadata
      - 'source_record_type'
      - 'external_discovery_type'
      - 'external_discovery_publication'
  where a.slug = any(v_slugs)
    and (a.metadata ? 'source_record_type'
      or a.metadata ? 'external_discovery_type'
      or a.metadata ? 'external_discovery_publication');
  get diagnostics v_changed = row_count;
  raise notice 'SAN-1416: cleared third-party markers on % development listings', v_changed;
end
$unrestrict$;
