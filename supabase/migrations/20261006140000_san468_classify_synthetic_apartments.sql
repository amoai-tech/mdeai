-- =============================================================================
-- Migration: 20261006140000_san468_classify_synthetic_apartments.sql
-- Task:      SAN-468 · REAL-002 — Make Production Rental Inventory Launch-Ready
-- =============================================================================
-- Step 2.1 — classify known synthetic seed apartments as test fixtures.
--
-- Two production rows use deterministic seed UUIDs (750e8400-...-446655440001/2),
-- source 'seed', USD prices, and synthetic host names. They predate the canonical
-- test/fixture marker, so a status change alone could make them look like
-- legitimate supply. Marking them with the existing canonical
-- metadata.is_test_fixture = true key -- the same key
-- e2e/helpers/rental-fixture-marker.ts writes and
-- scripts/sql/san468-inventory-quality-report.sql reads -- excludes them from
-- searchable / map_ready / launch_ready / requestable even if activated.
--
-- No new flag, no schema change. Idempotent, scoped to exactly these two rows.
-- =============================================================================

update public.apartments
   set metadata = coalesce(metadata, '{}'::jsonb)
       || jsonb_build_object(
            'is_test_fixture', true,
            'fixture_source', 'san468_synthetic_seed_classification'
          )
 where id in (
         '750e8400-e29b-41d4-a716-446655440001',
         '750e8400-e29b-41d4-a716-446655440002'
       )
   and coalesce(metadata->>'is_test_fixture', 'false') <> 'true';
