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
