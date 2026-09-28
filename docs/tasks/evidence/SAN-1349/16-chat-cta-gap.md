# SAN-1349 · CI found a real defect my local verification could not

**Summary: the CI `deterministic chromium` job failed on this PR, and the failure was a genuine
SAN-1349 defect — not an environment flake. The chat rental card offered "Schedule viewing" for a
listing with no owner. Fixed in `f6b2050f7`…`<see git log>`; this file records what happened, why
the local evidence missed it, and how it is now locked down.**

## 1 · What CI reported

```
deterministic chromium   fail   3m21s
  e2e/deterministic-critical.spec.ts:164:7
  › unowned rental renders a card without a Schedule viewing CTA
    Locator:  getByTestId('rental-schedule-cta')
    Expected: 0
    Received: 1
  3 passed, 1 failed
```

The other three journeys in the file **passed** in CI. That matters: it means CI's CopilotKit
runtime and secrets work, so this was a real behavioural failure, not the 401 I had seen locally.

## 2 · Root cause

There are **four** surfaces that render a "Schedule viewing" action. My change gated only the one
the task named:

| # | Surface | Gates the CTA? | Status |
|---|---|---|---|
| 1 | `src/components/rentals/rental-browse-card.tsx` (browse) | yes — `can_schedule_viewing && schedule_viewing_url` | gated in `ddd591c5b` |
| 2 | `src/components/copilot/rental-card.tsx` (**chat cards**) | **no** — rendered unconditionally | **ungated → CI failure** |
| 3 | `src/components/sheets/venue-detail-sheet.tsx` (detail slide-over) | **no** | ungated |
| 4 | `src/components/rentals/rental-detail-view.tsx` (detail page sidebar + mobile bar) | **no** | ungated |

Only surfaces 1 and 2 are exercised by the Chromium journey, which is why the run failed on the
chat card. Surfaces 3 and 4 were silent gaps that no test covered — the reviewer's "UI truthfulness"
acceptance criterion was **not** met by the original change, and the PR description overstated it.

This is exactly the class of defect the task exists to prevent: a non-requestable listing that
still advertises a viewing action.

## 3 · Why local verification missed it

Locally every deterministic journey dies at `gotoDeterministicChat` with
`HTTP 401 unauthorized` from the CopilotKit runtime, so no rental card ever renders. I proved that
failure was pre-existing by running the unmodified `HEAD` spec — but "pre-existing at the start"
does not mean "no new failures are possible once the environment works". CI has working secrets, so
CI is the only place these journeys actually execute. The correct conclusion at the time should have
been **"san-1349's UI gate is unverified, not verified"**, not "the journey is environmentally
blocked".

## 4 · Fix

One rule, applied to every surface: the flag must be exactly `true`, and a handler/URL must exist.
Anything else — including an omitted flag — withholds the action.

* `copilot/rental-card.tsx` — new `canScheduleViewing?: boolean` prop; the CTA renders only when
  `canScheduleViewing === true && onSchedule`.
* `copilot/search-tool-result-cards.tsx` — passes `canScheduleViewing={r.can_schedule_viewing === true}`
  to the card and through `openVenueDetail`.
* `chat/rental-ui-context.tsx` — `RentalVenueDetail.canScheduleViewing?: boolean` carries the proof
  into the slide-over.
* `sheets/venue-detail-sheet.tsx` — CTA renders only when `detail.canScheduleViewing === true`.
* `lib/rentals/get-rental-detail.ts` — `RentalDetail.canScheduleViewing` derived through the shared
  `isRentalRequestable()`; the mock fallback is `hit.can_schedule_viewing && hit.schedule_viewing_url != null`
  (mock rentals carry no ownership proof, so they are never requestable).
* `rentals/rental-detail-view.tsx` — sidebar and mobile viewing CTAs gated on
  `detail.canScheduleViewing`. The "Ask a question" CTA is deliberately left alone: it is not a
  viewing offer and removing it would be an unrelated UX regression.

## 5 · Regression coverage added

* `copilot/__tests__/rental-card-copy.test.tsx` — 5 new assertions: proven → CTA present; `false` →
  absent; flag omitted → absent (fail closed); no handler → absent; card still renders.
* `lib/rentals/__tests__/get-rental-detail.test.ts` — 4 new assertions: owned/approved/published →
  `true`; no owner → `false`; unapproved/unpublished → `false`; ownership columns absent → `false`.
  The module mock was changed to `importOriginal` so the **real** `isRentalRequestable` runs instead
  of being stubbed out, which would have made these assertions vacuous.
* `e2e/deterministic-critical.spec.ts` — the requestable fixture now asserts **exactly 1** CTA, and
  the unowned fixture asserts **0**. The chat surface is pinned in both directions, so this defect
  cannot silently return.

## 6 · Verification

`npm run lint` 0 warnings · `typecheck` clean · `npm test` **1664 passed** (up 9) · `npm run build`
clean · `supabase test db` `san1349`/`san1054`/`san1286` green. CI re-run on the new head is the
authoritative proof for the Chromium journeys, since they cannot execute locally.

## 7 · Process lesson

A "pre-existing locally" verdict is only valid evidence about the *starting* state. When a required
check cannot run in the developer environment, the correct status for the behaviour it covers is
**unverified**, and the PR description must not claim it — as this one did before CI corrected it.
