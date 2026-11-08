# SAN-776 — Places cache compliance fix (2026-11-08)

## Policy evidence

Google Places policy, accessed 2026-11-08:
- https://developers.google.com/maps/documentation/places/web-service/policies — only the **Place ID**
  is exempt from caching restrictions;
- https://developers.google.com/maps/documentation/places/web-service/place-photos — **photo resource
  names cannot be cached**.

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
  `getPlaceDetails` and returns only the fresh payload. The misleading `X-Places-Cache`
  header and `cacheHit` flag were removed. Only the existing negative cache (failure
  suppression) and rate limits remain.
- `src/app/api/places/detail/route.ts`: `Cache-Control: no-store`.
- `src/app/api/places/photo/route.ts`: `Cache-Control: private, no-store`.
- `supabase/migrations/20261108025310_places_cache_policy_cleanup.sql` deletes expired detail and
  search rows (reviewed SAN-105 cleanup, applied before deploy).

## Tests

- `src/lib/place-details-cache.test.ts` — 2 pass (fresh every call, negative cache).
- `src/__tests__/api/places-detail-route.test.ts` — 4 pass (no-store on success, limits).
- `src/app/api/places/photo/route.test.ts` — 3 pass (private no-store).
- Related Places tests — 10 pass.
- ESLint and `tsc` clean on changed files.

## Cost impact — explicitly unmeasured

Removing the 7-day cache **increases** Place Details calls; no savings are claimed. A Cloud Billing
baseline per method is still required.

Place Photo traffic also changes: `private, no-store` means every image render/back-navigation
re-fetches the photo, is billed, and counts toward the 120/min per-IP photo limit. Check list pages
(`/restaurants`, café panels, chat cards) for 429s/broken images after deploy and include Photo calls
in the billing baseline. A bounded client-side exception would need explicit policy review, not a
silent TTL.

Details now also uses the shared `check_rate_limit` RPC (30/min/IP) before provider calls; the
in-process limiter remains a cheap first line.
