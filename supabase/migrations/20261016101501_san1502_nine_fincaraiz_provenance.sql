-- SAN-1502 · Normalize nine previously imported Fincaraiz listings without changing
-- their real source URLs, 36 gallery URLs, costs, broker assignments or pin geometry.
-- MDE may test the full flow; no provider has confirmed a real-world viewing.
-- This migration follows 20261016101500_san1502_development_rental_gates.sql.
do $check$
declare
  v_expected text[] := array[
    'fincaraiz:194158672', 'fincaraiz:194104380', 'fincaraiz:192658136',
    'fincaraiz:194115640', 'fincaraiz:193811264', 'fincaraiz:194188459',
    'fincaraiz:193522702', 'fincaraiz:194096982', 'fincaraiz:193916988'
  ];
  v_count integer;
  v_changed integer;
begin
  if not public.rental_development_active() then
    raise exception 'SAN-1502 data update is only allowed during development';
  end if;
  select count(*) into v_count from public.apartments a
    where a.source_listing_id = any(v_expected)
      and a.source_url like 'https://www.fincaraiz.com.co/%'
      and cardinality(a.images)=4
      and a.landlord_id is not null
      and a.status='active';
  if v_count <> 9 then
    raise exception 'SAN-1502 expected exactly 9 source-matched photo-backed active apartments; found %', v_count;
  end if;

  -- A user-reported 2026-10-14 move-in date is not a verified inventory opening.
  -- Preserve the original dated attestation in metadata, clear the operational
  -- availability date, and prevent a bogus verified=true claim.
  update public.apartments a
  set available_from = null,
      verified = false,
      metadata = coalesce(a.metadata,'{}'::jsonb)
        || jsonb_build_object(
            'source_name','Fincaraíz',
            'source_provider','Fincaraíz',
            'source_record_type','third_party_advertisement',
            'source_listing_reference',a.source_listing_id,
            'source_original_url',a.source_url,
            'availability_status','unconfirmed',
            'availability_claim_basis','user_attested_2026-10-14_not_independently_confirmed',
            'development_viewing_status','request_recording_only_provider_confirmation_unknown',
            'media_source_status','source_attributed_external_gallery_rights_unverified'
          )
    where a.source_listing_id = any(v_expected)
      and a.source_url like 'https://www.fincaraiz.com.co/%'
      and cardinality(a.images)=4
      and a.landlord_id is not null
      and a.status='active';
  get diagnostics v_changed = row_count;
  if v_changed <> 9 then
    raise exception 'SAN-1502 unexpected write count %', v_changed;
  end if;

  -- No after-update business re-review should demote these nine in Phase A.
  select count(*) into v_count from public.apartments a
    where a.source_listing_id=any(v_expected)
      and a.status='active'
      and a.available_from is null
      and a.verified is false
      and a.metadata->>'availability_status'='unconfirmed';
  if v_count <> 9 then
    raise exception 'SAN-1502 nine listing update not preserved, found %',v_count;
  end if;
end
$check$;
