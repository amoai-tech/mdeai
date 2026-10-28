# SAN-1390 — One Ask MDE Across Five Discovery Pages: Implementation Plan

**Progress source of truth:** [SAN-1390 · EPIC · One Ask MDE Across Five Discovery Pages](https://linear.app/amo100/issue/SAN-1390/epic-one-ask-mde-across-five-discovery-pages). This file owns the **technical execution steps only**. It keeps no progress count; read the verified acceptance count in SAN-1390 (17/36 when this was written) and change it only with task + PR + SHA + browser/test/DB proof.
**Written:** 2026-10-28 against `main` @ `ad2119a545`. Refresh PR heads before acting.
**Supersedes (execution order only):** [mde-shared-discovery-readiness.md](../plans/mde-shared-discovery-readiness.md) (2026-10-14 snapshot, kept as history).
**Phase:** A, prelaunch development. No approval, ownership, eligibility or publishing gate. Keep authentication, RLS, authorization, idempotency and truthful data.

## 1. Executive summary

**Goal.** Rentals, Restaurants, Events, Cafés and Nightlife feel like one product: shared navigation → compact real results → the matching map pin and Details → Ask MDE that knows the selected item → the supported next action (viewing, tickets, directions). No invented price, photo, pin, availability or success.

**Already working (do not rebuild).** Shared `DiscoveryWorkspace`, `VenueCardShell`, `BrowseMapPanel`/`BrowseMapSheet`, `useBrowseMapSync`, the restaurant and rental pin converters, Details panels, the CopilotKit v2 + Mastra Concierge (selected-item context shipped in #583), public event catalog with tier-derived prices.

**Top five defects proven in code or browser** (all fixed in an open PR; none merged or deployed):

| # | Defect | Real-world effect | Fix |
| --- | --- | --- | --- |
| 1 | Inline rental card showed the derived monthly estimate, never the stored nightly price (`formatRentalPrices` always returns `~$/mo`, so the inline-nightly branch was unreachable). | A $78/night listing read "~$2,340/mo". | #599 @ `87db775c76` |
| 2 | `venueAnchorToCoordinates` replaced a missing location with a hardcoded city-center point (6.2442, −75.5812); the café/nightlife models carried no coordinates. | A venue with no saved location was pinned in the wrong place by the AI path and could never be pinned truthfully on browse pages. | #604 @ `6f527ee48b` (data layer) |
| 3 | Chat event sheet's single payment button always targeted the cheapest tier. | A visitor choosing VIP × 3 was sent to General × 1. | #597 @ `f4be1c3f20` |
| 4 | Event detail page: empty placeholder, the "not verified" warning buried in About text, duplicate ticket headings, mixed date formats on multi-day events. | Visitors miss that a December event is unconfirmed. | #601 @ `758cd9a504` |
| 5 | Café/nightlife pages render a map column (`BrowseMapPanel`) but nothing feeds it pins, and there is no café/nightlife pin converter (only restaurant and rental). | The map beside the cards is empty. | Step 2.2 below (not started) |

Reported by Linear but **not independently reproduced here**: signed-in Events A→B→Clear answers the wrong item (SAN-737, step 4.1).

**Fastest approach.** Land the three independent open PRs in order, then wire the café/nightlife pins with one small converter that mirrors `restaurantToMapPin`, then close the restaurant and AI gaps with proof. Run the event workstream, the AI workstream and the restaurant reconciliation in parallel with the card and map work. No new agent, map, search engine, card framework, pgvector index or migration.

## 2. Task ownership matrix

Facts as read from Linear and GitHub on 2026-10-28.

| Linear task | Status | Working | Missing | PR | Main files | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| [SAN-1390 · EPIC · One Ask MDE Across Five Discovery Pages](https://linear.app/amo100/issue/SAN-1390/epic-one-ask-mde-across-five-discovery-pages) | In Progress | Epic register, ordered plan | 19 unproven checkpoints | — | this file | Master |
| [SAN-1140 · MDE Discovery — Compact, Consistent Cards Across Five Pages](https://linear.app/amo100/issue/SAN-1140) | In Progress | Five routes use compact feed rows; nightly-price fix pushed | Fresh-head CI, approval, merge, release SHA proof | #599 | `rental-browse-card.tsx`, five `*-browse-view.tsx`, `venue-browse-card.tsx` | P0 |
| [SAN-1146 · Cafés and Nightlife — Match Venue Cards to Real Map Pins](https://linear.app/amo100/issue/SAN-1146) | Todo | Real nullable coordinates in data layer | Converter, pin sync, selection, Details, negatives, 390px | #604 | `search-venue-anchors.ts`, `cafe-browse.ts`, `nightlife-browse.ts`, `browse-pin-converters.ts`, `cafe-browse-view.tsx`, `nightlife-browse-view.tsx` | P0 |
| [SAN-292 · VEN-013 — RestaurantResultCard + search-tool-renders](https://linear.app/amo100/issue/SAN-292) | Todo | Renderers exist: `restaurant-card.tsx`, `domain-results.tsx`, `search-tool-result-cards.tsx` | Prove parity; then close no-code or fix the one gap | — | same | P2 (blocks SAN-293 only if a gap is proven) |
| [SAN-293 · VEN-014 — Open Restaurant Details in Chat Using Existing Map and Detail UI](https://linear.app/amo100/issue/SAN-293) | Todo | Chat card opens `openCafeDetail({kind:"cafe", bookingAsRestaurant:true, …})` | Verify heading/actions are restaurant-correct; Place ID only when real; pin parity | — | `domain-results.tsx`, `rental-ui-context.tsx`, `cafe-detail-panel.tsx` | P1 |
| [SAN-1531 · Restaurants — Cards, Map, Details and Ask MDE on One Page](https://linear.app/amo100/issue/SAN-1531) | In Progress | `/restaurants` already uses `DiscoveryWorkspace`, `restaurantToMapPin`, `useBrowseMapSync` | Exact card/pin/Details IDs, null-coordinate, vote regression, mobile | — | `restaurant-browse-view.tsx`, `restaurant-details-panel.tsx` | P1 |
| [SAN-1122 · Give Restaurants, Cafés, and Nightlife One Consistent Discovery Experience](https://linear.app/amo100/issue/SAN-1122) | Todo (parent SAN-566, last touched 2026-10-20) | Mostly overlapped by SAN-1140/1146/1145/1531 | Only leftover cross-category gaps after those land | (old #239 in a different repo) | — | P3 (final parity pass) |
| [SAN-737 · Make Ask MDE Understand the Current Page and Selected Place](https://linear.app/amo100/issue/SAN-737) | In Progress | #583 merged (selected item across five pages) | Signed-in Events A→B→Clear, safety matrix | #598 (draft) | `discovery-agent-context.ts`, `concierge.ts`, `fetch-public-events-catalog.ts` | P0 (independent) |
| [SAN-1145 · Add the Same Ask MDE Chat to Restaurants, Cafés and Nightlife](https://linear.app/amo100/issue/SAN-1145) | In Progress | Shared composer, two-turn flows | Stop/Retry, 401/403/429/5xx, interrupted stream, saved threads, IME | — | shared composer | P1 |
| [SAN-1421 · Rentals — Inline Ask MDE Chat, Filters and Map (Delivered)](https://linear.app/amo100/issue/SAN-1421) | Done | Search, filters, map, Details | Four real turns, card↔pin parity, viewing outcome, 390px keyboard | — | `rental-browse-view.tsx` | P2 (proof only) |
| [SAN-1250 · Events — Find Real Events With Ask MDE on the Events Page](https://linear.app/amo100/issue/SAN-1250) | Done | Public catalog, tier-derived price, inline Ask | Date + budget follow-up, saved thread, authenticated ticket path | — | `event-browse-view.tsx` | P2 (proof only) |
| [SAN-972 · Events — Polish the Responsive Cards, Filters and Map Layout](https://linear.app/amo100/issue/SAN-972) | Backlog | Events workspace and filters | Audit after the compact feed lands | — | `event-browse-view.tsx` | P3 |
| [SAN-1534 · MDE UI/UX — Verified Progress and Launch Evidence Tracker](https://linear.app/amo100/issue/SAN-1534) | In Progress | Evidence conventions | Exact-SHA matrices and screenshots | — | docs only | Final |
| [SAN-1600 · MDE Events — Make Event Details Trustworthy, Premium, and Easy to Act On](https://linear.app/amo100/issue/SAN-1600) | In Progress | Event detail page, guest Ask | Merge #597, then #601; signed-in Ask | #597 → #601 | `event-ticket-tiers.tsx`, `event-detail-*.tsx` | Separate workstream |
| [SAN-1599 · EPIC · MDE Events — Reliable Stripe Checkout and Paid Ticket Orders](https://linear.app/amo100/issue/SAN-1599) | In Progress | Server-priced checkout | Stripe TEST order proof | own PRs | `supabase/functions/ticket-*` | Separate; never mixed into UI PRs |

**Ownership boundaries (do not blur).** SAN-293 owns restaurant Details **inside `/chat`**. SAN-1531 owns the `/restaurants` page. SAN-1140 owns shared compact cards. SAN-1146 owns real café/nightlife coordinates and selection. SAN-737 owns selected-item AI correctness. SAN-1122 owns only what is left after those. No task is closed or removed here without evidence.

## 3. PR status

Levels: **implemented** (code exists) · **tested** (focused tests) · **reviewed** (human approval) · **merged** · **deployed** · **prod-verified** (exact SHA + real journey).

| PR | Head | Base | Implemented | Tested | CI at write time | Reviewed | Merged / deployed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [#599](https://github.com/amoai-tech/mdeai/pull/599) compact cards (SAN-1140) | `87db775c76` | main | yes, incl. nightly-price fix | yes (36 card tests; `$78/night` regression) | 14 pass, 2 pending | approval required; CodeRabbit finding resolved with evidence | no / no |
| [#604](https://github.com/amoai-tech/mdeai/pull/604) real coordinates (SAN-1146) | `6f527ee48b` | main | data layer only | yes (`floor` green locally: 523 files, 4020 tests) | 10 pass, 6 pending | approval required; MDE review "safe to merge" | no / no |
| [#597](https://github.com/amoai-tech/mdeai/pull/597) ticket-tier fix (SAN-1600) | `f4be1c3f20` | main | yes | yes (VIP × 3 payload verified in real browser) | 17 pass | approval required; 0 findings from MDE review, Codacy, Kilo | no / no |
| [#601](https://github.com/amoai-tech/mdeai/pull/601) event visual pass (SAN-1600) | `758cd9a504` | `fix/san-1600-ticket-selection-detail` | yes (plus two commits from another session) | yes | 7 pass, 1 pending | not yet | no / no |
| [#598](https://github.com/amoai-tech/mdeai/pull/598) selected-item AI (SAN-737) | `b462d859ed` | main | partial, draft | e2e spec added | 15 pass, 1 pending | n/a (draft) | no / no |

**Dependency rules.** #601 is stacked on #597: merge #597 first, then retarget #601 to `main` and rebase. #604 touches no view files; the view wiring (step 2.2) must wait for #599 because #599 rewrites the same views. #598 is the independent AI-risk PR and must not absorb UI changes. Event UI work (#597, #601) never carries Stripe changes.

## 4. Ordered implementation steps

Each step lists its owner task, skills and tools, and a real-world example. Subtasks list the problem, the exact files, dependencies, and the acceptance test that defines Done.

### Step 1 — Shared compact cards (SAN-1140 · PR #599)

*Skills:* `tasks`, `code-review`, `testing`, `frontend-design`, `uiux`. *Tools:* GitHub, Playwright/Chrome. *Example:* Camila searches rentals and sees "$78/night" beside a 96px thumbnail, not "~$2,340/mo".

| # | Subtask | Problem and evidence | Files and smallest change | Depends on | Acceptance (Done) |
| --- | --- | --- | --- | --- | --- |
| 1.1 | Get exact-head CI green | Head moved to `87db775c76`; earlier statuses are stale | none unless a check fails | — | `floor` and `mastra-schema-init` green on `87db775c76` |
| 1.2 | Real-browser proof on all five pages | Existing evidence is presentation-only; the rental inline price had no browser check | add a browser check of a nightly-only rental card; reuse existing evidence folder | 1.1 | five routes at 390 and 1440: compact rows, truthful price, Details and action intact, no overflow |
| 1.3 | Approval and merge | One approval required | none | 1.1, 1.2 | merged; no unresolved review thread |
| 1.4 | Release readback | Merge is not deployment | none | 1.3 | production `/api/version` SHA equals the merge SHA; one guest journey replayed |

### Step 2 — Real map data and selection (SAN-1146 · PR #604 then a follow-up PR)

*Skills:* `maps`, `supabase` (read-only), `testing`, `e2e`. *Example:* A café with saved coordinates shows a pin that opens the same café's Details; a café with no saved location is listed with no pin.

| # | Subtask | Problem and evidence | Files and smallest change | Depends on | Acceptance (Done) |
| --- | --- | --- | --- | --- | --- |
| 2.1 | Land the data layer | #604 removes the fabricated city-center point and carries nullable real coordinates | already in #604 | CI green, approval | merged; unit tests prove null in, null out |
| 2.2 | Add the café/nightlife pin converter and feed the existing map | `browse-pin-converters.ts` has only `restaurantToMapPin` and `rentalToMapPin`; café/nightlife views render `BrowseMapPanel` with no pins | add one converter returning `null` when either coordinate is null; call `useBrowseMapSync` in `cafe-browse-view.tsx` and `nightlife-browse-view.tsx`, copying `restaurant-browse-view.tsx` | #599 merged, #604 merged | pins appear only for rows with real coordinates |
| 2.3 | Card ↔ pin ↔ Details parity | Selection id convention must match restaurants (`restaurant-${id}`) | reuse `useMapContext` selected pin and the existing sheet/Details | 2.2 | same venue id across card, pin and Details; selection, close and keyboard work |
| 2.4 | Negatives and mobile | A venue without coordinates must stay browseable and Ask-able | tests only | 2.3 | null-coordinate venue has no pin; 390px sheet focus and close verified |

### Step 3 — Restaurant Details and cross-category consistency (SAN-292, SAN-293, SAN-1531, SAN-1122)

*Skills:* `copilotkit`, `mastra`, `maps`, `testing`. *Example:* In `/chat`, "Restaurants in El Poblado" → El Cielo card → Details shows known facts and a real directions link; unknown opening hours stay unknown.

| # | Subtask | Problem and evidence | Files and smallest change | Depends on | Acceptance (Done) |
| --- | --- | --- | --- | --- | --- |
| 3.1 | Reconcile SAN-292 | Renderers already exist; the task says to close as shipped if parity passes | `restaurant-card.tsx`, `domain-results.tsx`, `search-tool-result-cards.tsx` (read first) | — | one card per result, same restaurant UUID across card and pin; close no-code with evidence or name the single gap |
| 3.2 | SAN-293 chat Details | Chat opens `openCafeDetail({kind:"cafe", bookingAsRestaurant:true, …})`; check for wrong restaurant labels or actions | `domain-results.tsx`, `rental-ui-context.tsx`, `cafe-detail-panel.tsx` | 3.1 | correct restaurant heading; Place ID used only when real; honest catalog-only state otherwise; no duplicate detail or booking action |
| 3.3 | SAN-1531 `/restaurants` | Page already has workspace, pins and sync; proof is missing | tests; fix only a demonstrated failure in `restaurant-browse-view.tsx` | #599 merged | exact card/pin/Details ids, null-coordinate, vote regression, 390px |
| 3.4 | SAN-1122 residual pass | Mostly covered by steps 1–3 | none by default | 1, 2, 3.1–3.3 | one comparison at 390/768/1024/1440; file only gaps still open, or close as covered with evidence |

### Step 4 — Selected-item AI and shared composer (SAN-737 · PR #598, SAN-1145)

*Skills:* `copilotkit`, `mastra`, `supabase`, `testing`. *Constraint:* reuse the one CopilotKit v2 + Mastra Concierge; no second agent. *Example:* On Events, select Event A, then Event B, then Clear; each answer names the current record only.

| # | Subtask | Problem and evidence | Files and smallest change | Depends on | Acceptance (Done) |
| --- | --- | --- | --- | --- | --- |
| 4.1 | Reproduce signed-in Events A→B→Clear | Reported in Linear, not independently reproduced; needs signed-in QA credentials | #598 files: `discovery-agent-context.ts`, `concierge.ts`, `fetch-public-events-catalog.ts` | QA sign-in credentials | failing run captured; fix at the canonical seam, not card styling |
| 4.2 | A→B→Clear on all five routes | #583 covers the mechanism; routes need proof | tests only | 4.1 | desktop 1440 and mobile 390; refresh and saved thread keep context |
| 4.3 | Safety matrix | Client ids are never authorization | tests; server re-fetch stays the source | 4.1 | wrong-category, forged and private ids refused; two accounts never see each other's thread |
| 4.4 | Composer reliability (SAN-1145) | Stop/Retry and error states unproven | shared composer only | — | Stop, Retry, 401/403/429/5xx, interrupted stream, IME verified |

### Step 5 — Event experience, separate from Stripe (SAN-1600 · PRs #597 → #601)

*Skills:* `events`, `frontend-design`, `uiux`, `testing`. *Example:* A visitor picks VIP × 3 in chat and checkout receives the VIP tier id with quantity 3.

| # | Subtask | Problem and evidence | Files and smallest change | Depends on | Acceptance (Done) |
| --- | --- | --- | --- | --- | --- |
| 5.1 | Merge #597 | Checks green, 0 review findings; waits on approval | none | approval | merged; checkout payload test stays green |
| 5.2 | Retarget and rebase #601 | Stacked on #597; another session added commits (explicit year, mobile action clearance) | none | 5.1 | #601 targets `main`, CI green on its exact head, review done |
| 5.3 | SAN-972 responsive polish | Needs the compact feed first | `event-browse-view.tsx` | #599 merged | 320/390/768/1440, keyboard, focus; fix only observed defects |
| 5.4 | SAN-1250 follow-ups | Date and budget refinement, saved thread unproven | tests; fix only a demonstrated failure | 4.x | stable event ids, tier-derived price or honest unknown, no invented Free/Buy |

Stripe TEST payment proof stays in SAN-1599 / SAN-974 and its own PR. No payment code enters any step above.

### Step 6 — Premium UI/UX corrections

*Skills:* `frontend-design`, `uiux`. *Rule:* audit screenshots first; fix only observed defects; no redesign of working paths.

| # | Subtask | Acceptance (Done) |
| --- | --- | --- |
| 6.1 | Screenshot audit at 320/390/768/1024/1440 and 200% zoom | defect list with evidence; "no defect" is a valid result |
| 6.2 | Fix only listed defects (hierarchy, thumbnails, filter wrapping, empty/error/loading states, no giant placeholders) | each fix has a before/after screenshot |
| 6.3 | Accessibility: keyboard order, visible focus, touch targets ~44px, contrast, sticky composer and map sheet not obscuring focus | keyboard-only pass and an axe run recorded |
| 6.4 | Regression: event date/price filters, Tickets/Buy, rental Schedule, restaurant vote, mapped card identity, Ask selection | existing tests plus one real-browser pass |

### Step 7 — Verification and release

| # | Subtask | Acceptance (Done) |
| --- | --- | --- |
| 7.1 | Focused Vitest, then changed-file lint and typecheck | green before each push |
| 7.2 | `npm run floor` after substantive changes; exact-head CI | `floor` and `mastra-schema-init` green on the pushed head |
| 7.3 | Real browser journeys, guest and signed-in | one multi-turn journey per route; screenshots and traces saved |
| 7.4 | Staged release, production SHA, evidence index (SAN-1534), SAN-1390 counter | SAN-1390 updated only with task + PR + SHA + proof; "merged" never reported as "deployed" |

### Parallelism

- **Track A (cards and map):** 1.1 → 1.3 → 2.2 → 2.3 → 2.4. Step 2.1 can merge in parallel with step 1.
- **Track B (restaurant reconciliation):** 3.1 → 3.2; 3.3 after #599 merges.
- **Track C (AI):** 4.1 → 4.3, gated on QA credentials; 4.4 independent.
- **Track D (events):** 5.1 → 5.2; 5.3 after #599.
- 3.4 and the final 6.x/7.x passes wait for tracks A and B.

## 5. Architecture and reuse

Reuse, do not replace:

- **Next.js App Router** pages and `DiscoveryWorkspace` (three-column layout; the map column appears when `rightPanel` is set).
- **Cards:** `VenueCardShell`, `VenueBrowseCard`, `RentalBrowseCard`, restaurant and event cards.
- **Maps:** `BrowseMapPanel`, `BrowseMapSheet`, `useBrowseMapSync`, `useMapContext`, the converters in `src/lib/browse/browse-pin-converters.ts`.
- **AI:** CopilotKit v2 provider and tool renderers, the Mastra Concierge (`src/mastra/agents/concierge.ts`), server-side Supabase lookups.
- **Data:** Supabase public retrieval and RLS; real nullable `latitude`/`longitude`; tier-derived event prices.
- **Actions:** the existing viewing request flow and the existing ticket checkout. No new action path.

Not proposed, absent a proven need: a second agent, map subsystem, search engine, result-card framework, pgvector index or database migration.

## 6. Premium UI direction

Flow: **Navigation → Compact results → Matching map and Details → Ask MDE → Supported action.** Each category keeps its own filters and actions (rental viewing, restaurant vote and request, café amenities, nightlife vibe, event tickets).

Visual rules: existing MDE tokens in `src/app/globals.css` and `DESIGN.MD` only; restrained type scale with one strong hierarchy (title, location, price); small meaningful thumbnails or honest neutral placeholders; consistent spacing; visible focus and reduced motion; no decorative gradients, no generic dashboard cards, no second design system.

## 7. Verification matrix

Run each row on `/rentals`, `/restaurants`, `/events`, `/cafes`, `/nightlife` and `/chat` at **390 and 1440**, plus 320, 768 and 1024 where layout changes.

| Check | Pass condition |
| --- | --- |
| Card ↔ pin ↔ Details id | the same record id in all three; selection and close work |
| Missing coordinates | the record is listed, Ask-able, and has **no** pin |
| Selected item A → B → Clear | the answer names the current record, never A after B, none after Clear |
| Filters, refresh, saved conversation | filters survive Details and refresh; the thread continues |
| Mobile sheet and keyboard | focus enters and leaves the sheet; composer not obscured; touch targets adequate |
| Rental price | stored nightly or monthly price shown; no derived estimate presented as stored |
| Event tickets | VIP × 3 sends the VIP tier id and quantity 3; sold-out and zero-tier have no Buy |
| Viewing action | uses the existing viewing path; exactly one persisted lead and showing when authorized |
| Guest, signed-in, empty, error | each state renders truthfully; 401/403/429/5xx show a recovery action |
| Honesty | no fake price, photo, booking, availability or success state |

Tooling order: focused Vitest → changed-file ESLint and TypeScript → Playwright for the affected journey → `npm run floor` → exact-head CI → staged release and production SHA readback.

## 8. Next action

Start with Step 1: get #599's exact-head CI and approval, add the nightly-only rental browser check, then merge. In parallel, run Step 5.1 (approval for #597) and Step 3.1 (SAN-292 parity proof). Step 2.2 is the first new implementation and begins when #599 merges.
