# Post-merge verification — PRs #599 and #597 (and #609, #600)

**Verified:** 2026-10-28 09:20–09:55 UTC (04:20–04:55 America/Bogota)
**Production SHA at verification:** `4c6e48f658e7083c7e127ec5d75b92ba82df4cef` (`GET /api/version`, environment `production`)
**Main at verification:** same commit. Production was read-only for every check except one checkout probe, cleaned up below.

## What was merged

| PR | Title | Merge commit | Merged (UTC) | Link |
| --- | --- | --- | --- | --- |
| #599 | Make Rental, Event, Restaurant, Café & Nightlife Cards Easier to Browse (SAN-1140) | `8de2e8c9a3f58bf9f1a6d2ba64be542b57f83fec` | 09:14:30 | https://github.com/amoai-tech/mdeai/pull/599 |
| #597 | Make chat event checkout pay for the ticket the visitor chose (SAN-1600) | `4b2230f4680c2e7a39e0e5d736fe9c7b34b585aa` | 09:15:52 | https://github.com/amoai-tech/mdeai/pull/597 |
| #609 | Show renters when one apartment appears twice (SAN-1235) | `824e0a3a655aae21f74bb8f49d025507e39e1ac0` | 09:20:50 | https://github.com/amoai-tech/mdeai/pull/609 |
| #600 | Keep malformed AI results from wiping map pins (SAN-1429) | `4c6e48f658e7083c7e127ec5d75b92ba82df4cef` | ~09:24 | https://github.com/amoai-tech/mdeai/pull/600 |

Production is a descendant of all four: verified with `git merge-base --is-ancestor <merge> 4c6e48f6` → true, true, true.

## Release incident (resolved, worth fixing)

Four merges landed within ten minutes. Each Vercel production candidate was rejected by
`.github/workflows/vercel-production-certification.yml` with:

```
vercel-candidate: FAIL — candidate is stale; main moved before certification
```

Rejected runs: `40663142829`, `40663511728` (and a skipped dispatch `40663869647`). Production served the
previous main `2e5ca782dd` from 09:14 until the final candidate for `4c6e48f6` certified and promoted at
~09:31. **Merged ≠ deployed for 17 minutes**, with three red workflow runs that were not code failures.

Root cause: the gate correctly refuses to promote a candidate older than `main`. Back-to-back merges
guarantee that by the time a candidate is READY, `main` has moved. Fix options are in the audit's
next-steps (serialize merges, or let certification re-target the newest candidate).

## Verification results (production, `4c6e48f6`)

### Five discovery pages — compact feed, no obstruction

| Route | Cards @390 | Cards @1440 | Card height | Single column | Map-trigger/CTA overlap | Horizontal overflow | Screenshot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/rentals` | 41 | 41 | compact row | yes | 0 | 0 | `pages-rentals-390.png`, `pages-rentals-1440.png` |
| `/restaurants` | 12 | 12 | 44 px | yes | 0 | 0 | `pages-restaurants-390.png`, `pages-restaurants-1440.png` |
| `/cafes` | 17 | 17 | 57 px | yes | 0 | 0 | `pages-cafes-390.png`, `pages-cafes-1440.png` |
| `/nightlife` | 13 | 13 | compact row | yes | 0 | 0 | `pages-nightlife-390.png`, `pages-nightlife-1440.png` |
| `/events` | 2 | 2 | 53 px | yes | 0 | 0 | `pages-events-390.png`, `pages-events-1440.png` |

- The mobile Map control now sits in the header (`workspace-mobile-map-trigger`), not over a card: 0
  overlaps with any Schedule / Details / Ask / Buy control on all five routes at 390 px.
- `/rentals` at 390: the first card is visible in the first viewport and reads
  `Calle 10 #42-15, Laureles · 2 BR · COP 2,400,000/mo · Availability unconfirmed` with
  **Ask about this · Details · Schedule viewing**.
- `/cafes` at 1440: compact rows with 96 px thumbnail, name, tag, description and
  **Ask about this · Directions** — previously two oversized cards with no action.
- Untouched by #599 and still true: café/nightlife have **no map column and no photos**. That is
  [#604](https://github.com/amoai-tech/mdeai/pull/604) and the partner-photo work, not a #599 regression.

### Event detail — trustworthy, premium, one ticket heading

`https://www.mdeai.co/events/reina-de-antioquia-2026-finals` at 320/390/768/1440:

| Check | Result |
| --- | --- |
| Exactly one `h1` | 4/4 widths pass |
| Date tile in the no-photo placeholder | 23 / February / Tuesday / 2027 |
| One ticket heading | 1 (`Tickets`); previously duplicated |
| Real tiers + per-tier Buy | 4 tiers, 4 Buy buttons, real COP prices |
| Multi-day schedule format | `Tue, Feb 23, 2027, 8:00 PM – Wed, Feb 24, 2027, 12:30 AM (Colombia time)` |
| Listing/source note beside the title | present (`event-source-note`) |
| Back navigation | `/events` → **Back to Events**; `?from=chat` → **Back to chat** (allowlisted) |
| Horizontal overflow | 0 at 320/390/768/1440 |
| Zero-tier event (`/events/a1b2c3d4-…-0003`) | **Price TBD**, no Buy button |

### Ticket tier identity — the #597 defect

| Action | Modal result |
| --- | --- |
| Buy GA | `Tier GA · Quantity 1 · Total $40,000 COP` |
| Buy VIP | `Tier VIP · Quantity 1 · Total $120,000 COP` |

The button now carries the tier the visitor chose. (The original defect was the chat sheet always buying
the cheapest tier; the page's per-tier action is now also proven live, not only in unit tests.)

### Checkout contract — TEST mode, then cleaned up

Submitting the VIP modal produced `POST /api/tickets/checkout` → `success: true`,
Stripe **test** session `cs_test_a199…`, order `8688f8e0-…` `pending`, attendee `fddeaaf5-…`,
idempotency key `73302587-…`, total 12,000,000 cents COP.

Cleanup (required: there is one production database):

```
DELETE 1  event_attendees where id=fddeaaf5-…
DELETE 1  event_orders    where id=8688f8e0-…
DELETE 1  idempotency_keys where key=73302587-…
verify    orders=0  attendees=0  idem=0
Stripe    cs_test_a199… → status=expired, payment_status=unpaid
```

No payment was taken, no ticket was issued, and nothing remains in the database.

### Merged-main unit proof (exact commits, local)

| Scope | Result |
| --- | --- |
| Events (tiers, detail, interactions, public event) on `4b2230f4` | 27 files / **173 tests passed** |
| Discovery cards, browse workspace, copilot renders on `4b2230f4` | 36 files / **324 tests passed** |
| Duplicate-listing rule on `4c6e48f6` (my #609 fix) | 2 files / **8 tests passed** |

## Exact URLs for review

- Rentals: https://www.mdeai.co/rentals
- Restaurants: https://www.mdeai.co/restaurants
- Cafés: https://www.mdeai.co/cafes
- Nightlife: https://www.mdeai.co/nightlife
- Events: https://www.mdeai.co/events
- Event with tiers (verified above): https://www.mdeai.co/events/reina-de-antioquia-2026-finals
- Zero-tier event: https://www.mdeai.co/events/a1b2c3d4-0001-0001-0001-000000000003
- Concierge: https://www.mdeai.co/chat
- Deployed SHA: https://www.mdeai.co/api/version

## Screenshots

All files in this folder are 1440×900 or 390×900 Chrome captures of production `4c6e48f6` unless the
name starts with `before-`, which is the same page on `2e5ca782` for comparison.

| File | Shows |
| --- | --- |
| `pages-<route>-<width>.png` | The five discovery pages at 390 and 1440 after #599 |
| `event-detail-<width>.png` | Event detail after #597 at 320/390/768/1440 |
| `event-tier-<width>.png` | VIP tier selected and priced |
| `event-checkout-modal.png` | Checkout modal with `Tier VIP · Quantity 1 · Total $120,000 COP` |
| `before-event-<width>.png` | Event detail before #597 deployed |
