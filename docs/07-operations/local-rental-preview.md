# Rental development preview — no independent approval for UI testing

This uses the **existing MDE rental cards and details**. Candidate metadata comes from the staged
research fixture; the photos are the **real Supabase-hosted files** in the private `partner-assets`
bucket, read through `rental_listing_images.sort_order` by a **server-only** service client. It does
**not** require independent verification to preview, and does not change production publishing,
Supabase RLS, or the viewing RPC. It is not proof that public booking works.

## Start (local Ubuntu only)

Run from the repository root; `MDE_DEV_RENTAL_FIXTURES_DIR` defaults to
`<repo>/photos/medellin_furnished_import` when unset, so any checkout can point at its own copy:

```bash
MDE_DEV_RENTAL_PREVIEW=1 \
MDE_DEV_RENTAL_FIXTURES_DIR="$PWD/photos/medellin_furnished_import" \
npx next dev --webpack --hostname 127.0.0.1 --port 3015
```

The Supabase URL and anon key come from `.env.local`; the photo endpoint additionally needs the
server-only service role there because `partner-assets` is a **private** bucket. The service-role key
is used only inside the server process: the browser receives image bytes from
`/api/dev/rental-photo/<slug>/photo-0N.webp`, never a credential, a storage path, or a Supabase URL.

Visit **http://127.0.0.1:3015/dev/rentals**. The existing rental browse cards show all nine source
listings with advertised COP/month price and the first Storage photo; click each title to view its
four-photo gallery, full details, and unconfirmed availability. Unknown coordinates produce **no map
pin**. Viewing requests are intentionally unavailable for external research copies. A missing or
failed photo request stays blank. In other environments the preview and photo endpoints return
**404**.

The fixture directory is not committed to Git, so point `MDE_DEV_RENTAL_FIXTURES_DIR` at your own
copy. **Bind the server to `127.0.0.1`.**

### Access boundary

The preview serves unverified research photos, so it is guarded in depth and fails closed (404):

1. The flag is server-only and **requires** `NODE_ENV=development`; `production` builds cannot enable
   it even if the flag is set.
2. The `Host` header must be loopback (`127.0.0.1`, `localhost`, `::1`).
3. The proxy/tunnel forwarding values `x-forwarded-for`, `x-forwarded-host`, `x-real-ip`,
   `forwarded`, `cf-connecting-ip` and `cf-ray` must all resolve to loopback. Next dev fills
   `x-forwarded-*` with the loopback peer, so local use passes; a tunnel that forwards the real
   client address or public host is refused even when its `Host` looks local. (`x-forwarded-proto`
   is not used as a signal: Next dev sets it to `http` on every request.)

That combination blocks LAN access and tunnels, but it is deliberately a development boundary, not
authentication. Never expose the server on a publicly accessible dev host, and do not treat it as a
reason to skip the production publishing gates.

To test **real viewing requests**, use the already-existing DB rollback-only pgTAP tests and
owner/renter Playwright tests against **local or isolated test Supabase**, not the live Medellín
Supabase database. Those tests create controlled fixture users and listing verification data and
assert unauthorized access/retries; do not relabel external research listings as independently
verified.

Existing production gates remain mandatory when promoting to real public, searchable and requestable
rentals; do not mistake the preview for completed SAN-1431.
