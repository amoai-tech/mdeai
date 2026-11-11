# Momentic public-browser pilot

Momentic complements Playwright; it does not replace real payment, authentication, Supabase transaction, or retry tests. All seven tests here are **read-only** and can run against a verified MDE preview or the published site.

| Area | Trusted tests | Proves | Does not prove |
| --- | --- | --- | --- |
| Rentals | Five in `rentals/` | Guest filtering, routing, Details, viewing form display | A booked viewing or persisted lead |
| Events | `events/public-event-details.test.yaml` | Published event card opens matching Details | Checkout, payment or issued ticket |
| Concierge | `concierge/guest-chat-entry.test.yaml` | Guest session initializes and Events topic UI responds | An authenticated agent answer or persisted thread |

The existing `.github/workflows/momentic-rentals-preview.yml` handles selected public-discovery PR changes. It checks out **trusted `main`**, verifies the preview belongs to the exact PR commit, creates temporary deployment-scoped access, runs only applicable trusted tests, revokes access, and posts PASS/FAIL/BLOCKED/SKIPPED. It is advisory, not a required release gate. When new tests are introduced by a PR, the workflow cannot trust them until they are merged into `main`.

## Local browser checks

```bash
momentic doctor
momentic lint
momentic run momentic/rentals/search-to-details.test.yaml --retries 0 -y
momentic run momentic/events/public-event-details.test.yaml --retries 0 -y
momentic run momentic/concierge/guest-chat-entry.test.yaml --retries 0 -y
```

The tests' URLs point to the public site. For previews, use `--url-override` with the **same path and query** on the verified deployment. The workflow's `scripts/momentic-rentals-preview-url.mjs` handles this without inventing availability or bypassing Vercel protection. The `momentic doctor` WebSocket diagnostic may fail on this Ubuntu network even when ordinary browser runs work; diagnose it independently, not by weakening security or test assertions.
