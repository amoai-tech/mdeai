# Post-merge verification — #604 café/nightlife maps, #600 pin guard, #609 duplicate labels

**Verified:** 2026-10-28 10:15–10:35 UTC · **Production SHA:** `9e286597437fb9578275861ab9a1d3173d80fcd4` at the start, `3ec409caecb900a05fe0db580d6bc6de9bf216c9` by the end (the pipeline promoted #607 while testing). Both contain #609 (`824e0a3a`), #600 (`4c6e48f6`) and #604 (`9e286597`); verified with `git merge-base --is-ancestor`.

## #609 — duplicate labels (SAN-1235) ✅

| Check | Result |
| --- | --- |
| `/rentals` duplicate badge | exactly **1** badge among 41 cards — `d9e96fb4…` → “Also listed as #1” |
| Chat duplicate badge | Ask MDE “2 bedroom in Laureles under 3M” → 3 cards, one badge “Also listed as #1” |
| Different listings not over-labelled | 1 of 41 cards labelled; no false positives in the catalogue |
| Source rows intact | both `5247d1e6…` and `d9e96fb4…` still `active`, COP 2,400,000/mo, no coordinates |

## #600 — malformed results cannot wipe pins (SAN-1429) ✅

| Step | Result |
| --- | --- |
| A · “2 bedroom El Poblado under 6M” | 7 cards, **6 map pins** (`[data-testid="map-panel"] [data-pin-id]`) |
| B · next search response replaced with `{results:null,pins:null}` | cards 0, **pins still 6**, map still shows the El Poblado rentals — the guard held |
| C · valid empty (“Laureles 5BR under 500k”) | cards 0, **pins 0** — a genuinely completed empty result clears the category |
| Focused tests on current main | `tool-pins-latest-wins`, `tool-pins-sync`, `normalize-tool-envelope` — 55 tests pass with the converter suites |

Not exercised: signed-in 50+ message replay and disconnect/retry (no QA credentials in this checkout). The latest-wins guard is covered by the merged unit spec, not by a live signed-in run.

## #604 — café/nightlife cards ↔ real pins (SAN-1146) ✅ with two gaps

| Check | `/cafes` | `/nightlife` |
| --- | --- | --- |
| Cards | 17 | 13 |
| Map column + real Google Maps canvas | yes | yes |
| Rendered markers + clusters | 6 markers + 5 clusters | 4 markers + 2 clusters |
| Card `data-pin-id` ↔ pin identity | `venue-<uuid>` per card | same |
| Select A → B | A pressed → released, B pressed | same |
| Mobile sheet (390) | opens, real map, 3 markers, close works | 4 markers, close works |
| Horizontal overflow | 0 at 390/1440 | 0 |

**Gap 1 — no clear for the map selection.** Clicking the selected “Selected on map” card again keeps `aria-pressed="true"`. Only the Ask selection has an explicit toggle (“Clear selection” → “Ask about this”). Selecting another card replaces the selection.

**Gap 2 — the no-coordinate case is unexercised live.** All 17 cafés and 13 nightclubs have real coordinates (30/30 `venue_anchors`), so no live venue can prove “no pin when coordinates are missing”. `venueToMapPin` returns `null` for null/invalid pairs and the merged unit test covers it.

**Note:** browse cards expose **View on map · Ask about this · Directions**. There is no café/nightlife **Details** panel on the browse page; that part of SAN-1146 is delivered in chat, not here.

## Screenshots

| File | Shows |
| --- | --- |
| `rentals-1440-duplicate.png` | `/rentals`, the one “Also listed as #1” badge |
| `chat-1440-duplicate-label.png` | Ask MDE answer with the duplicate label |
| `chat-map-A-valid.png` / `-B-after-malformed.png` / `-C-valid-empty.png` | 6 pins → 6 pins after malformed → 0 pins after a valid empty search |
| `cafes-1440.png`, `cafes-390-sheet.png` | Café map column and the mobile sheet |
| `nightlife-1440.png`, `nightlife-390-sheet.png` | Nightlife map column and sheet |
