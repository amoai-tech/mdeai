---
title: SAN-106 post-merge verification — PR #783
date: 2026-11-06
task: SAN-106
epic: SAN-1437
status: production blocked on corrective PR #794
---

# SAN-106 post-merge results (PR #783)

## Release facts

| Item | Value |
|---|---|
| PR | [#783](https://github.com/amoai-tech/mdeai/pull/783) — **MERGED** |
| Merge commit | `39a1df1674dfcc2fd96827c39728ac639baa0a07` |
| Merged at | 2026-11-06 07:10 UTC |
| Candidate promoted | `39a1df16` (certification workflow run `42179570048`, exit 0) |
| Production `/api/version` | `39a1df1674dfcc2fd96827c39728ac639baa0a07` |
| Production deployment | `dpl_EFcbKgeLyENeSacwEgV5UfM7Q1pR` (`mdeai-3ma0amp57-amoco.vercel.app`) |

## What works on production

- `/`, `/rentals`, `/chat`, `/api/version` return **200**.
- `/rentals`: the page header reported **43 apartments (showing 42)** in the signed-in desktop
  capture, and **42 apartments (showing 41)** in the signed-out mobile captures. The earlier
  "164" was a raw DOM locator count (`[data-testid^="rental-card-"]`, which includes duplicated
  and hidden nodes), not a user-facing count; it has been removed.
- The Google map mounted in the signed-in desktop capture. The signed-out mobile captures show the
  list and the **Map** button; the mobile map sheet itself was not opened in this run.
- Guest `POST /api/grounded/search` with `nearbyRentalId` returns **401
  `authentication_required`** before any provider call.
- Guest UI does not render `data-testid="rental-nearby-cta"`.

## Confirmed production defects

### D1 — Nearby returns 500 after the provider/tool returns

- **Evidence (production log, `39a1df16`):**
  `[api/grounded/search] TypeError: c.set is not a function` at `recordToolSpan`.
- **Root cause:** `route.ts` passed a get-only stub as `RequestContext`.
  `recordToolSpan` calls `requestContext.set(...)`, so every Nearby request threw after the tool
  returned — including the honest "provider unavailable" path.
- **Fix:** PR [#794](https://github.com/amoai-tech/mdeai/pull/794) uses Mastra's real
  `RequestContext` and shares one get/set store. Regression test added.
- **Preview proof:** `875af88c` at
  `https://mdeai-1ntx2g2q5-amoco.vercel.app` returned **200**, not 500.

### D2 — Production Places server key is not visible to the function

- **Evidence:** `POST /api/places/search` → 503 `places_not_configured`;
  Nearby log: `PlacesConfigError: Missing GOOGLE_PLACES_API_KEY (or
  GOOGLE_MAPS_SERVER_API_KEY / GOOGLE_MAPS_API_KEY)`.
- The Vercel variables exist but are marked Sensitive. A 39-character `AIza…` server key from
  the local environment works against Places API (one live `searchNearby` call → 200).
- **Action taken:** updated Production and Preview `GOOGLE_PLACES_API_KEY` and
  `GOOGLE_MAPS_SERVER_API_KEY` from the verified key (values not printed). Existing deployments
  do not pick up env changes; the key was confirmed only after a fresh preview build.

## Provider proof (PR #794 preview build `875af88c` — unmerged)

Authenticated `POST /api/grounded/search` with
`nearbyRentalId=750e8400-e29b-41d4-a716-446655440002` ("Cozy Studio Apartment in Laureles",
stored at 6.245678, -75.589012) and `nearbyRadiusMeters=800`:

- HTTP **200**
- `metadata`: `searchMode=nearby`, `anchorPinId=rental-750e8400…`, `venueKind=cafe`,
  `radiusMeters=800`, `provider=google_places_nearby`
- **5** results, **5** attribution rows
- Real Google Place IDs and coordinates, e.g.:
  - `ChIJff1WP2IpRI4RsSEQum4ebSs` — Happy Snack — 6.2451837, -75.5886691
  - `ChIJGwyAX0kpRI4R0MrZuOjjmlo` — Pausa Coffee & Brunch — 6.2465719, -75.5893199
  - `ChIJ8YUxBKcpRI4RYu9TASStn8Q` — Empanadas de mi pueblo — 6.2469101, -75.5892161
  - `ChIJfzbsCAApRI4R2TkAzFQKdh8` — The Daily Coffee — 6.2444055, -75.5884985

This is a real Google Places Nearby response captured through **this PR's route on the preview
build**, not through production and not through a mock. It must not be read as production proof.

## Screenshots (real artifacts from this run)

- `san-106-postmerge/rentals-desktop-cards.png` — signed-in desktop: live rental cards and map.
  **The account header is pixelated/blurred**; no email or account identifier is legible.
- `san-106-postmerge/rentals-mobile-390.png` — signed-out 390×844.
- `san-106-postmerge/rentals-mobile-360.png` — signed-out 360×800.

Security note: the mobile captures were taken without a session and show **Sign in**. The desktop
capture was the only authenticated one; its header was blurred before this file was committed, and
the branch history was rewritten so the unblurred original is not part of the PR.

## Not verified

- Clicking **Show nearby cafés** inside an authenticated chat A2UI rental card (no chat turn
  was driven in this pass).
- Café pins replacing/retaining the rental selection in the browser (API proves the anchor
  metadata; client pin behaviour is covered by existing unit tests, not this live run).
- Agent follow-ups ("Which café is closest?", distance questions).
- Production provider success: blocked until PR #794 is merged/certified **and** the new env is
  picked up.

## Live URL checks (production `39a1df16`)

| URL | Status | Auth | Feature | Verdict |
|---|---|---|---|---|
| `https://www.mdeai.co/` | 200 | no | landing | pass |
| `https://www.mdeai.co/rentals` | 200 | no | cards + map | pass |
| `https://www.mdeai.co/chat` | 200 | yes for agent use | chat shell | pass (shell) |
| `https://www.mdeai.co/api/version` | 200 | no | SHA | pass |
