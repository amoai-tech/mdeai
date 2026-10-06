/**
 * SAN-468 §5.5 — explicit marker for apartments created by production E2E specs.
 *
 * The SAN-468 inventory-quality report classifies any apartment whose
 * `metadata->>'is_test_fixture'` resolves to `true` as a test fixture, and never counts
 * it toward searchable / map-ready / launch-ready supply. Production specs must stamp
 * this marker at the row-creation boundary; fixtures are never inferred from titles.
 *
 * The literal JSON boolean `true` matters: the report reads it with `->>`, which
 * renders JSON `true` as the string `'true'`.
 */
export const E2E_FIXTURE_SOURCE = "e2e";

export const E2E_FIXTURE_METADATA: { is_test_fixture: boolean; fixture_source: string } = {
  is_test_fixture: true,
  fixture_source: E2E_FIXTURE_SOURCE,
};
