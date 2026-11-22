# Viewing-request `LISTING_UNAVAILABLE` — correlating a log entry to an apartment

When a renter asks to schedule a viewing and the atomic RPC cannot resolve the listing, the API
responds with safe copy and the server logs:

```
[api/leads/schedule-viewing] upstream failure {
  outcome: "listing_unavailable",
  code: "LISTING_UNAVAILABLE",
  listing: { ref: "9519d028b948", shape: "uuid", length: 36 }
}
```

`ref` is `HMAC-SHA256(trimmed reference, MDE_LOG_FINGERPRINT_KEY)` truncated to 12 hex characters.
It is **keyed on purpose**: apartment slugs are public, so an unkeyed digest could be reversed by
hashing every published slug.

## One-time setup (required for the fingerprint to exist)

Set `MDE_LOG_FINGERPRINT_KEY` to a random server-only secret in **Vercel production and preview**.
Without it the route fails closed and logs no `ref` — only `shape` and `length`.

```bash
openssl rand -hex 32        # value to store; never commit it
```

This variable is registered as optional in `scripts/check-env-contract.mjs`, so it never blocks a
deploy — but the diagnostic is inert until it is set.

## Correlating a failure

```bash
MDE_LOG_FINGERPRINT_KEY=... DATABASE_URL=... \
  node scripts/find-listing-by-fingerprint.mjs --ref 9519d028b948
```

The script recomputes the fingerprint over every stored apartment `id` and `slug` and prints any
match with its status. It is read-only. Exit codes: `0` matched, `2` no match, `1` misconfigured.

## Reading the result

| Result | Meaning | Next step |
|---|---|---|
| `shape: "uuid"`, no match | The reference does not name a stored apartment (deleted, edited, or the wrong project) | Revalidate the selected card before allowing submit |
| `shape: "slug"`, matched | The slug exists but the RPC refused it | Re-read the RPC's unrequestable branch for that row |
| `shape: "uuid"`, matched | The row exists and was still refused | Check `rental_can_request_viewing(a)` for that row |
| `shape: "other"` | The caller sent something that is neither id nor slug | Fix the card → modal identifier mapping |
| no `ref` in the log | `MDE_LOG_FINGERPRINT_KEY` is unset | Apply the one-time setup above |

## Related

- Route: `src/app/api/leads/schedule-viewing/route.ts` (`describeListingRef`)
- RPC: `public.p1_schedule_tour_atomic` — resolves a UUID or an **exact** slug
