# SAN-1140 — restaurant card footer evidence (2026-11-04)

Browser evidence for [SAN-1140](https://linear.app/amo100/issue/SAN-1140): the restaurant discovery
card must own **Directions**, **Ask about this** and **View details** inside its own
`VenueCardShell` footer, exactly as Events, Rentals, Cafés and Nightlife already did.

## Reproduced defect (live production, before the fix)

`https://www.mdeai.co/restaurants` — anonymous Chrome, DOM check plus screenshots.

| Route | Cards | Ask inside card | Ask outside card | Details inside card | Details outside card |
| --- | --- | --- | --- | --- | --- |
| `/restaurants` | 12 | **false** | **true** | **false** | **true** |
| `/cafes` | 17 | true | false | n/a | n/a |
| `/nightlife` | 13 | true | false | n/a | n/a |
| `/events` | 3 | true | false | true | false |
| `/rentals` | 41 | true | false | true | false |

Counts are an inventory snapshot, not an acceptance number. The first restaurant card's footer
contained only `Directions`; `restaurant-ask-select` and `restaurant-detail-link-*` were siblings of
the card inside an extra `flex flex-col gap-2` wrapper in
`src/components/restaurants/restaurant-browse-view.tsx`. On a 390px phone the "Ask about this"
button rendered under the sticky Ask MDE composer — the screenshot shows it half-hidden behind the
bar.

Files: `before-*.png` (production, pre-fix), `before-report.json` (raw DOM measurements).

## After the fix (same worktree dev server, real production data)

| Route | Cards | Ask inside | Details inside | Footer text | Overflow |
| --- | --- | --- | --- | --- | --- |
| `/restaurants` | 12 | true | true | `Directions · Ask about this · View details` | none |
| `/cafes` | 17 | true | n/a | `View on map · Ask about this · Directions` | none |
| `/nightlife` | 13 | true | n/a | `View on map · Ask about this · Directions` | none |
| `/events` | 3 | true | true | `Ask about this · Details` | none |
| `/rentals` | 41 | true | true | `Ask about this · Details · Schedule viewing` | none |

Files: `after-local-*.png`, `after-local-report.json`,
`after-<kind>-<width>.png` (re-captured from production after the merge, all five routes),
`local-restaurants-card-{320,390,768,1440}.png` (card-only, 200% zoom check runs in the spec too),
`local-cafes-card-390.png`, `local-nightlife-card-390.png`.

At 320px the restaurant footer wraps naturally onto two rows (Directions / Ask + View details)
inside the card; nothing sits in the gap below the card.

### Page errors, stated exactly

The production baseline recorded **zero** page errors on all five routes. The worktree dev-server
run recorded **one** transient error on `/rentals` at 1440px during the first cold compile
(`Cannot read properties of undefined (reading 'getRootNode')`) — it is in
`after-local-report.json` and is **not** reproducible: 3 further runs of `/rentals` at 1440px after
warm-up logged `[]`, and `/rentals` code is untouched by this change. The three venue pages
(`/restaurants`, `/cafes`, `/nightlife`) logged zero errors in every run.

## Commands

```bash
# Worktree dev server (real Supabase data, anonymous)
npx next dev --webpack -p 3011

# Component contract: containment, one Ask, one Details, pressed state, no auto-send
npx vitest run src/components/copilot/__tests__/restaurant-card.test.tsx \
               src/components/copilot/__tests__/restaurant-card-selection.test.tsx

# Real browser: DOM containment + geometry, 320/390/768/1440, 200% zoom, click,
# Tab/Enter/Space + visible focus, Details navigation, and "no agent/run on select"
SMOKE_BASE_URL=http://localhost:3011 PW_SKIP_WEBSERVER=1 \
  npx playwright test e2e/san-1140-discovery-card-actions.spec.ts --project=chromium --workers=1
```

Result: 23/23 component tests and 13/13 browser tests pass on the fixed worktree.
