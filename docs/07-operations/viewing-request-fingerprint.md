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

## Connection and privilege policy

- **TLS:** loopback URLs skip TLS (disposable/local). A URL that declares `sslmode` is **validated,
  not blindly trusted**: `disable`, `allow`, `prefer`, `require` and `no-verify` are all refused for a
  non-loopback host, and so is any unrecognised mode. Only `verify-full` (or `verify-ca`) is
  accepted — the others either send the rows in plaintext or encrypt without checking the
  certificate, which a MITM still wins. A bare `ssl=0` / `ssl=false` is also refused: that is not
  an sslmode, it maps to `ssl: false` and would disable TLS entirely.

  **Every `ssl*` URL parameter is stripped** before the explicit `ssl` options are passed. pg merges
  the parsed connection string over the config object, so `sslmode`, `ssl`, `sslrootcert` and
  friends would otherwise win over the verified settings — that is how an explicit `verify-full`
  once ended up failing against Supabase's own root, and how `ssl=0` could have forced plaintext.

  Trust-store precedence, which is easy to get wrong: an explicit `ca` **replaces** Node's default
  trust store, and `NODE_EXTRA_CA_CERTS` only **extends** that default store. So when
  `NODE_EXTRA_CA_CERTS` is set the script deliberately leaves `ca` unset — otherwise your extra root
  would be ignored. Use this when the server is not Supabase; for Supabase, leave it unset and the
  shipped CA is used. `?sslmode=verify-full` against a Supabase URL therefore works.

  If verification fails and the shipped CA could not be loaded, a warning is printed at startup:
  verification then falls back to the system store, which may trust a different root.

  Never disable verification.

- **Role:** run it with a **read-only role**. The script prints `current_user`, and when that role
  bypasses RLS (`postgres`, `service_role`) it says so explicitly. That privilege is why the scan can
  see every row; do not extend it beyond this read.
- **Scope:** the scan is deliberately cross-tenant. The question is "does this reference resolve to
  **any** apartment?", because a cross-tenant or deleted id is one of the failure modes — scoping to a
  landlord would hide exactly the rows that explain the failure. It streams in `id` order with bounded
  memory (`--page-size`, default 500) rather than loading the table in one result set. A `LIMIT` would
  turn a match on a later row into a false "no such apartment", which is a wrong answer, not a safe one.

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
