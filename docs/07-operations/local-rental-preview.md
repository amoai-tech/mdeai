# Rental development preview — no independent approval for UI testing

This uses the **existing MDE rental cards and details**, plus local research images. It does **not** require independent verification to preview them, and does not change production publishing, Supabase RLS, or the viewing RPC. It is not proof that public booking works.

## Start (local Ubuntu only)

Use the 9 Fincaraíz candidates and 36 already downloaded files (they remain outside Git):

```bash
cd /home/sk/mdeai-worktrees/san-1431-dev-preview
MDE_DEV_RENTAL_PREVIEW=1 \
MDE_DEV_RENTAL_FIXTURES_DIR=/home/sk/mdeai/photos/medellin_furnished_import \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54621 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_preview \
npx next dev --webpack --hostname 127.0.0.1 --port 3015
```

Visit **http://127.0.0.1:3015/dev/rentals**. The existing rental browse cards show all nine source listings with advertised COP/month price and first local photo; click each title to view its local gallery, full details, and unconfirmed availability. Unknown coordinates produce **no map pin**. Viewing requests are intentionally unavailable for external research copies. Missing photos stay blank. In other environments the preview and photo endpoints return **404**.

The `MDE_DEV_RENTAL_FIXTURES_DIR` points at the original checkout because the local research photos are not committed to Git. Bind the server to `127.0.0.1` so these copies are not offered to other devices on your network. Never enable this on a publicly accessible development host or tunnel: the image endpoint serves local research copies to visitors of the development host. The flag is server-only and **requires** `NODE_ENV=development`; `production` builds cannot enable it even if the flag is set.

To test **real viewing requests**, use the already-existing DB rollback-only pgTAP tests and owner/renter Playwright tests against **local or isolated test Supabase**, not the live Medellín Supabase database. Those tests create controlled fixture users and listing verification data and assert unauthorized access/retries; do not relabel external research listings as independently verified.

Existing production gates remain mandatory when promoting to real public, searchable and requestable rentals; do not mistake the preview for completed SAN-1431.
