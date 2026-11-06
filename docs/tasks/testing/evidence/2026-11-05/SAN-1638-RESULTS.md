# SAN-1638 · MDE Discovery — Open Details in the Right Panel Across All Five Pages

Date: 2026-11-05 · PRs: #754 (restaurants, cafés, nightlife) and #755 (events, stacked)
Baseline: rebased onto `main` at `cfa5a90a` (which also retired the Argos visual job in #766).
Both PRs merged: #754 as `582c27fb`, #755 as `4b7d250e`. Production verification below was
run against the deployed build `c347162191`.

## What was proven

| Check | Command | Result |
| --- | --- | --- |
| Repository gate | `npm run floor` | exit 0 on the heads below |
| Focused unit tests | `npx vitest run src/components/{restaurants,browse,copilot,cafes,nightlife} src/hooks` | 334 passed |
| Event panel tests | `npx vitest run src/components/events` | 78 passed (incl. 404 / 503 / Retry / Free / Sold out / Buy hidden on 404) |
| Card actions browser spec | `SMOKE_BASE_URL=http://localhost:3020 PW_SKIP_WEBSERVER=1 npx playwright test e2e/san-1140-discovery-card-actions.spec.ts --project=chromium --workers=1` | 17 passed |
| Deterministic CI lane | GitHub `deterministic chromium 1/3…3/3` | 3/3 green at `d900eb27` |
| Required checks | `floor`, `mastra-schema-init`, `review / review`, `review / verify-review-result` | green at `d900eb27` |

Code was verified at `d900eb27`. The last commit that changes runtime behaviour is `0043aa98` (a selected pin now clears the explicit Details id, so releasing it closes the panel). Commits after it add docstrings and this evidence file, which change no behaviour, and CI re-runs on every head — read the current results on the PR rather than this file for the latest head.

## Real-data browser journeys (dev server, real Supabase catalog)

| Journey | 1440 | 390 |
| --- | --- | --- |
| Details opens in the right panel / bottom sheet, URL unchanged | ✅ | ✅ |
| A → B repoints the same panel | ✅ | ✅ |
| Close returns focus to the button that opened it | ✅ | ✅ |
| Restaurant with no coordinates opens Details | ✅ | ✅ |
| Details on A while pin B is selected shows A (regression test) | ✅ | — |
| Marker pick moves panel and Ask context together (regression test) | ✅ | — |
| Escape from inside the panel closes it; from a card it does not | ✅ | — |
| Ask never opens a panel; it closes one describing another record | ✅ | ✅ |
| Details A → pin B → **release B** leaves the panel closed (A does not return) | ✅ | — |

Regression tests added after the merge-readiness audit (each proven RED before GREEN):

- releasing a pin closes the panel instead of resurrecting the older Details record;
- a confirmed 404 hides **Buy tickets** as well as the full-page link.

Event panel: real tiers (GA $40,000 · VIP $120,000 · Backstage $400,000 · Frontrow $80,000 COP), `Price TBD` with no tiers, photo + host/venue rendered from a controlled API response, 404 hides the full-page link, 503 keeps Retry and recovers.

## Not run / not proven

- A **real** provider 404/503: those branches were proven with intercepted responses, not a live outage.
- The **signed-in** Ask → Answer journey (`e2e/san-737-selected-place.spec.ts`).
- Buy tickets: no live event currently has an external ticket URL, so the button never rendered.
- Production: superseded — both PRs merged (#754 `582c27fb`, #755 `4b7d250e`) and the journeys were re-run on the deployed build `c347162191`; see "Production verification after merge" below.
- DeepSource JavaScript: 20 remaining findings are the JS-0067 module-scope false-positive class and complexity thresholds (see PR discussion); JS-0098 / JS-0116 / JS-0321 were fixed.
- `Screenshot public UI` (Argos) failed with HTTP 402 free-plan screenshot capacity while these PRs were open. That job was retired on `main` in #766 (`cfa5a90a`), which is the baseline these PRs now sit on, so the check no longer runs. Nothing was changed in code to silence it.

## Production verification after merge (2026-11-05)

Deployed build: `https://www.mdeai.co/api/version` returned `c347162191`, equal to `main` at the
time of testing and containing all four same-day merge commits (`ab24e576` #751, `c4c510da` #753,
`582c27fb` #754, `4b7d250e` #755).

| Route (1440px and 390px) | Details opens in place | URL unchanged | Close works | Horizontal overflow | Page errors |
| --- | --- | --- | --- | --- | --- |
| `/restaurants` | panel (desktop) / sheet (phone) | yes | yes | none | 0 |
| `/cafes` | panel / sheet | yes | yes | none | 0 |
| `/nightlife` | panel / sheet | yes | yes | none | 0 |
| `/rentals` | panel / sheet | yes | yes | none | 0 |
| `/events` | panel / sheet | yes | yes | none | 0 |

Records used: Elcielo Restaurant Medellín, Rituales Compañía de Café, Dulce Jesús Mío, a Laureles
rental, and the three published events.

Interaction sequences on the same build:

- Details A → Details B repoints the same panel; the URL never changes.
- Opening Details selects the Ask MDE record for that venue (`aria-pressed` becomes true).
- Escape closes the panel only when pressed inside it; Close returns focus to the Details button.
- Pin B → Details A shows A.
- Details A → pin B → release B closes the panel instead of reopening A.
- Events: real tiers render — Reina de Antioquia 2026 Finals GA $40,000 · VIP $120,000 ·
  Backstage $400,000 · Frontrow $80,000 COP; the QA event shows one GA $40,000 tier; the
  no-ticket event shows **Price TBD**; the full event page link works from the panel.

### Screenshots (local only)

`docs/screenshots/` is gitignored (`.gitignore:106`), so the PNGs are **not** in the repository.
They exist on the machine that ran the tests, with the deployed SHA in each filename:

```
docs/screenshots/san-1638/restaurants-1440-details-open-c347162191.png
docs/screenshots/san-1638/cafes-1440-details-open-c347162191.png
docs/screenshots/san-1638/nightlife-1440-details-open-c347162191.png
docs/screenshots/san-1638/rentals-1440-details-open-c347162191.png
docs/screenshots/san-1638/events-1440-details-open-c347162191.png
docs/screenshots/san-1638/events-1440-details-tiers-c347162191.png
docs/screenshots/san-1638/restaurants-390-details-open-c347162191.png
docs/screenshots/san-1638/cafes-390-details-open-c347162191.png
docs/screenshots/san-1638/nightlife-390-details-open-c347162191.png
docs/screenshots/san-1638/rentals-390-details-open-c347162191.png
docs/screenshots/san-1638/events-390-details-open-c347162191.png
```

The 1440px files show the results list and map with the Details panel open beside them; the 390px
files show the bottom Sheet.

### Still not proven

- Event photo and Buy tickets: no live event currently has an `imageUrl` or an external ticket URL.
- Event 404 / 503 panel states: proven with intercepted responses, not a live provider outage.
- Signed-in Ask → Answer: not executed.
