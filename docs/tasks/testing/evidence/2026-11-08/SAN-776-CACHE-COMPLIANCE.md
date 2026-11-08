# SAN-776 — Places cache compliance fix (2026-11-08)

## Policy evidence

Google Places policy (Maps Code Assist, current):
- only the **Place ID** is exempt from caching restrictions;
- **photo resource names cannot be cached**.

The previous detail path stored the raw response (including `photos` and
`photo_name_primary`) for seven days and served it with public HTTP caching.

## Live baseline (read-only, production `80ebbb37`)

| Metric | Value |
|---|---:|
| `place_details_cache` rows | 94 |
| expired | 94 |
| rows with `photo_name_primary` | 92 |
| `places_search_cache` rows / expired | 33 / 33 |

## Change

- `src/lib/place-details-cache.ts`: removed DB read/write; every Details request calls
  `getPlaceDetails` and returns `cacheHit: false`. Only the existing negative cache (failure
  suppression) and rate limits remain.
- `src/app/api/places/detail/route.ts`: `Cache-Control: no-store`.
- `src/app/api/places/photo/route.ts`: `Cache-Control: private, no-store`.
- Existing `place_details_cache` rows are **not deleted** here; cleanup is the reviewed SAN-105
  migration.

## Tests

- `src/lib/place-details-cache.test.ts` — 2 pass (fresh every call, negative cache).
- `src/__tests__/api/places-detail-route.test.ts` — 4 pass (no-store on success, limits).
- `src/app/api/places/photo/route.test.ts` — 3 pass (private no-store).
- Related Places tests — 10 pass.
- ESLint and `tsc` clean on changed files.

## Cost impact — explicitly unmeasured

Removing the 7-day cache **increases** Place Details calls; no savings are claimed. A Cloud Billing
baseline per method is still required. Narrower masks are a separate optimization and were not
changed because the UI consumes rating, hours, price and photos.
