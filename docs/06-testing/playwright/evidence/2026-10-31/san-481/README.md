# SAN-481 — production booking-review verification (sanitized)

## Scope and result

On 2026-10-31, the opt-in real-Supabase Playwright test was reported to pass against https://www.mdeai.co, after PR #642 deployed at commit `24728bd91f3be7f98e3822293fdc77636f1bbdce`. The test covered the rental Details entry, signed-in booking creation, same-ID refresh/replay, concurrent retries, changed-payload 409, cross-renter isolation, anonymous denial and a 390px viewport. The payment action remained disabled; **this is not evidence of payment completion**.

Recorded invocation:

```sh
MDE_BOOKING_REVIEW_E2E=1 SMOKE_BASE_URL=https://www.mdeai.co npx playwright test e2e/san-481-booking-review.spec.ts
```

Reported result: 1 test passed (20.5s). Reported readback: pending apartment booking; the test data and throwaway identities were subsequently removed. An independent read-only query after the run found zero apartment bookings and zero apartment payment rows.

## Artifact handling

The original evidence PR attached screenshots from an authenticated production booking session. They were removed from the PR branch because [the repository E2E policy](../../../../../e2e/README.md) explicitly forbids committing authenticated screenshots, traces, session cookies or other sensitive QA artifacts.

Keep any authenticated screenshots under the gitignored local `docs/screenshots/san-481/` directory or in appropriately access-controlled ephemeral evidence storage. Do not commit or attach them to public PRs, comments, or documentation. Public/anonymous screen captures can be prepared separately after a privacy review.

The original GitHub PR review raised a privacy finding about a booking reference in an image. Rewriting this branch removes the committed images from the new branch history; this alone **does not guarantee the old Git object, PR discussion or cached content becomes inaccessible**. Follow repository incident handling or contact GitHub Support if full removal is required.

## Remaining work

- SAN-1234: independently rerun direct-status-manipulation / DB guard regression proof.
- SAN-1240: server-sourced quote, Stripe test-mode Checkout, signed idempotent webhook and canonical payment finalization.
- SAN-1320: private receipt for a genuinely settled payment.
- SAN-481: complete checkout UI, retry/reconciliation, confirmation and receipt end-to-end.

See [PR #642](https://github.com/amoai-tech/mdeai/pull/642) and [SAN-1607](https://linear.app/amo100/issue/SAN-1607) for acceptance scope. This evidence note does not claim a fresh payment test or public-launch certification.
