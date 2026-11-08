# SAN-368 — real Google café results from the existing Mastra tool (2026-11-08)

## Change

- New `src/mastra/lib/google-places-cafe-search.ts` uses the installed
  `@googlemaps/places` SDK (`searchText`) with an explicit field mask:
  `places.id`, `displayName`, `googleMapsLinks`, `location`, `primaryType`.
- `search-grounded-places` calls it for café intent **before** ADK/MCP.
- Rows use `sourceMode: "google_places"`, stable Place IDs, real coordinates and
  Google Maps links; bars/clubs are dropped; no ratings/hours/Wi-Fi are invented.
- Existing quota check, ADK path and saved-catalog fallback remain unchanged.

## Live proof (production credentials, local exact code)

`searchGoogleCafes({ query: "quiet cafés in Laureles, Medellín", pageSize: 5 })`:

| Café | Place ID |
|---|---|
| Café Euge - Specialty Coffee, Gluten Free & Coworking | `ChIJ96hO8RApRI4RMqeJJBZUY_I` |
| Proyecto Café | `ChIJ64V6bTMpRI4RdkpN_2trwzQ` |
| Café Primavera | `ChIJXUCqDNQpRI4RKLeAcaPhClA` |
| Azul Compañía de Café | `ChIJ37LiXqopRI4RggACxiF_03I` |
| Rituales Compañía de Café | `ChIJQ-PPmKEpRI4RhZKQdct4w6Q` |

All rows had finite coordinates and `sourceMode=google_places`; 5 attributions.

The actual `searchGroundedPlacesTool.execute({query:"quiet cafés in Laureles",intent:"cafe"})`
returned 5 rows including Café Euge, Proyecto Café, Café Primavera, Amelier and Rituales, all
`google_places` with real Place IDs/coordinates and 5 attributions.

## Tests

- `google-places-cafe-search.test.ts`: 4 pass (IDs/coords/links, brand-only café, no coords,
  bar/malformed dropped).
- `search-grounded-places-fallback.test.ts`: 7 pass (Google-first, saved labels, ADK fallback).
- Related tool tests: 18 total pass.
- ESLint/TypeScript clean for changed files.

Not claimed: hosted MCP/ADK completion, production deployment, UI screenshots. Those follow.

## Review hardening (same PR)

- Default Medellín scope: city/neighborhood is added when absent; a 5 km Medellín bias is always sent.
- `places.types` requested; non-café/bar rows are rejected by provider types, not title words.
- Direct results still pass the shared café filter; brand-only cafés with `primaryType=cafe` survive.
- Maps links accept only HTTPS Google Maps hosts; a row without a valid place URI is dropped.
- `requirePlacesApiKey` trims each candidate and uses the first non-empty key.
- Café search uses **one** provider: Google first, then saved catalog; ADK is not called after a
  direct café attempt, so two billable searches cannot run for one user request.
- Daily cap is now atomic via `reserve_places_grounding_quota` (migration
  `20261108082148_atomic_places_grounding_quota.sql`); DB errors fail closed with `quota_unavailable`.
- Café Places call uses `maxAttempts=1`, so a timeout cannot trigger hidden retries. The in-flight
  request is still bounded by the client timeout; no abort signal is claimed.

Tests: mapper 5, tool 7, atomic quota 3, related 17 total.

## Second review pass

- Google receives `withMedellinScope(rawQuery)`, not the ADK instruction sentence; test asserts the
  exact query and absence of “Exclude bar”/“Prefer cafés”.
- Attribution is aligned to the filtered rows with `alignGroundedAttribution`; dropped rows no longer
  leave orphan credit.
- Metadata distinguishes `google_places_empty` (provider answered zero) from
  `google_places_unavailable` (provider error).
