# 2026-10-30 — SAN-481 booking-review screenshots removed

Two authenticated production screenshots (`san481-review-new-390.png`,
`san481-review-pending-390.png`) were committed here with PR #642 and have been removed.

They showed a signed-in production booking review, including a booking reference and the
renter-facing payment state. Under the repository's private-artifact policy those do not
belong in a public tree; the sanitized, text-only record lives in
`docs/06-testing/playwright/evidence/2026-10-31/san-481/README.md`, and local copies stay in
the ignored `docs/screenshots/san-481/` directory.

Git history still contains the old blobs. Purging them would require rewriting `main`, which
is disproportionate and disruptive; no credentials, session tokens or personal identities were
present in them — the exposed item was a deleted test booking's reference.
