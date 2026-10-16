-- SAN-1416 · Development unblock for the ten Rentberry test advertisements
--
-- The Rentberry listings were staged from a third-party source purely for development
-- and testing. While the database is in the `development` phase they must behave as
-- ordinary MDE listings: fully searchable, manageable and requestable, with no
-- third-party read-only, verification or publication-eligibility treatment.
--
-- This clears the staging markers (`inventory_kind`, `inventory_type`,
-- `allowed_action`) that drive the external exclusion, sets every row to the normal
-- active/approved/published state, and clears the two legacy `verified = true` flags.
-- Original source facts (`source_name`, `source_checked_at`,
-- `source_neighborhood_claim`, `coordinates_status`, `coordinate_evidence`,
-- `availability_status`, `owner_control_status`, `photo_rights_status`) and the
-- `source_url` / `source_listing_id` columns are preserved so the batch can be found
-- and removed before launch. Nothing here claims independent verification.
--
-- Guarded and idempotent: it raises outside the development phase and does nothing
-- unless the one-time live batch is present (legacy verified=true rows).
do $unrestrict$
declare
  v_slugs text[] := array[
    'candidate-rentberry-118796331',
    'candidate-rentberry-119388617',
    'candidate-rentberry-119390518',
    'candidate-rentberry-119391131',
    'candidate-rentberry-119839663',
    'candidate-rentberry-119839707',
    'candidate-rentberry-119839712',
    'candidate-rentberry-119840596',
    'candidate-rentberry-el-laurel-201',
    'candidate-rentberry-telaviv-1204'
  ];
  v_batch integer;
  v_changed integer;
begin
  if not public.rental_development_active() then
    raise exception 'SAN-1416 Rentberry unrestrict is only allowed during development';
  end if;

  -- The live development batch is the only one that carries legacy verified=true
  -- flags left by a one-time live correction. Fresh databases and their pgTAP
  -- fixtures never do, so this migration is a no-op there and cannot promote the
  -- staged seed batch (which san1433_candidate_coordinates_test.sql pins).
  select count(*) into v_batch
    from public.apartments
   where slug = any(v_slugs) and verified = true;
  if v_batch = 0 then
    raise notice 'SAN-1416: no legacy verified Rentberry batch in this environment';
    return;
  end if;

  update public.apartments a
  set verified = false,
      status = 'active',
      moderation_status = 'approved',
      listing_workflow_status = 'published',
      metadata = a.metadata
        - 'inventory_kind'
        - 'inventory_type'
        - 'allowed_action'
        - 'external_discovery_type'
        - 'external_discovery_publication'
  where a.slug = any(v_slugs)
    and (a.verified is distinct from false
      or a.status is distinct from 'active'
      or a.moderation_status is distinct from 'approved'
      or a.listing_workflow_status is distinct from 'published'
      or a.metadata ? 'inventory_kind'
      or a.metadata ? 'inventory_type'
      or a.metadata ? 'allowed_action'
      or a.metadata ? 'external_discovery_type'
      or a.metadata ? 'external_discovery_publication');
  get diagnostics v_changed = row_count;
  raise notice 'SAN-1416: normalized % Rentberry development listings', v_changed;
end
$unrestrict$;
