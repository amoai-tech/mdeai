# SAN-790 · MDE AI Search — Show Real Places and Honest Source Labels

## Verified defect

`search-grounded-places` kept the legacy top-level `source: "grounding"`
even when an ADK outage or quota fallback returned MDE's stored catalog.
A card with no matching Google attribution avoided a Google citation, but it
did not identify its catalog origin. The café Details panel also showed a
`Google-verified` badge even when no fresh Google result had succeeded.

The existing `searchRestaurants` "fallback" is an `isDeterministicE2E()`
fixture only; it is not normal production inventory. Do not introduce demo
records into production.

## Minimal correction

- Keep the existing Google Places SDK, ADK invocation, Mastra tool, CopilotKit
  tool envelope and Supabase readers. Do not migrate search transport to MCP.
- Add per-row `sourceMode`: `google_places`, `google_grounding`,
  `saved_catalog`, `demo_fixture`. Preserve the original `source`
  envelope for consumers.
- Carry source from the actual producer through the single grounded parser,
  chat and browse cards, corresponding map pins, and Details panels.
- Explicit fallback suppresses conflicting Google grounding attribution;
  absent or invalid rating/open-now/coordinates remain unknown.
- Show "Saved MDE catalog" for stored rows and "Demo example" for fixtures,
  never "Google-verified" merely because a saved record contains a Place ID.
- Stored venue anchors returned by `/api/venues/search` are catalog records.
- Do not add search engines, provider keys, business eligibility gates, DB
  migrations, or separate Maps state.

## Tests

Focused deterministic suite: 161 passed across 16 Vitest files
after changes at the SAN-790 branch, including catalog vs demo fallback,
inconsistent metadata, provider source, pinned/no-coordinate results,
Google-attribution isolation, mobile-compatible card rendering,
guest venue search and Nearby regression.
Changed-file ESLint and TypeScript passed locally. The full `npm run floor`
and exact-head browser/production proof are required from CI/release before
claiming this task Done.

## Official references — source/data rules

- https://developers.google.com/maps/documentation/places/web-service/policies
  (REFERENCE ONLY: Places attribution, data source separation and storage).
- https://developers.google.com/maps/documentation/places/web-service/nearby-search
  (REFERENCE ONLY: actual `places.id`, `places.location`, field masks).
- https://developers.google.com/maps/ai/agent-skills
  (REFERENCE ONLY; reuse MDE's current Maps skill, no duplicate installation).

## Required live acceptance after merge

On the exact live SHA, search Laureles cafés via Ask MDE and the
`/cafes` public venue search. Confirm provider and saved catalog cards use
different labels; Google source links and attribution remain as provided,
only exact coordinates create pins, and no unknown Wi-Fi/open-now claims
appear. Repeat at 390 px. Record screenshots + version SHA before marking Done.
