# SAN-106 — deterministic closest-café answer (2026-11-07)

## Production observation (`9e38eace`)

Signed-in QA, apartment `37a05b09…` (Laureles–Estadio), 5 Google cafés:

> “The closest café is ChIJP0Qti5wpRI4R-VyGhGAt2GQ, about 36 metres away.”

Measured: `típica tiendas` 36 m, First Cup 85, Amelier 102, Punto Rico 118, Sabbath 124.
The distance was correct; the model printed the Place ID instead of the café name. Earlier runs also
varied on naming, so the answer is now produced deterministically from measured rows.

## Change

- `src/lib/closest-grounded-result.ts`
  - `closestGroundedResult(rows, selectedListingId, mode)`: minimum for `closest`, maximum for
    `farthest`; only finite, non-negative distances whose `distanceFromRentalId` matches; `partial`
    when some rows have no measurement; `null` when nothing is defensible.
  - `parseGroundedRankQuestion(text)`: only `which`/`of these` follow-ups about shown places;
    `near/show/find/search` and non-shown nouns fall through to a new search.
- `src/lib/hooks/use-concierge-send-handlers.ts`
  - ranks only when the grounded panel currently on screen contains those rows;
  - reconciles `selectedListingId` with the selected rental map pin, keeping the stored selection
    when no rental pin is selected;
  - falls through when the anchor or result set does not match.

## Tests

- `closest-grounded-result.test.ts`: 7 tests (minimum, maximum, wrong anchor, partial/invalid,
  unknown, closest/farthest parsing, search fall-through).
- `use-concierge-send-handlers.test.tsx`: 32 tests, including stale anchor, cleared panel, and the
  matching-anchor deterministic answer.
- Focused total: **39 pass**. ESLint clean; `tsc` clean for changed files.

Not run: full `floor`/CI on this head at the time of writing; production journey after deploy.
