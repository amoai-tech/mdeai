---
title: SAN-1637 AI execution plan — rentals, events, tickets and trusted AI
status: approved-with-corrections
updated: 2026-11-05
source_of_truth: Linear SAN-1637 for order/status; origin/main for code; installed lockfile for versions
---

# SAN-1637 AI execution plan

## Outcome

A renter can ask Ask MDE for real apartments, see cards and matching map pins, compare 2–4
of them, open Details and request a viewing. An attendee can ask for a real event and real
ticket tier, edit a quantity, review the total and continue to the existing Stripe TEST
Checkout. The AI may choose **ids**, never prices, inventory, coordinates, availability or
payment success.

The plan deliberately reuses the existing CopilotKit v2 route, the Mastra concierge, the
Supabase-backed search tools, the current cards/maps/Details, `EventTicketTiers`,
`BookingCheckoutModal`, the atomic ticket RPC and the Stripe webhook. It does not add a
second runtime, provider, agent, search engine, map, ticket catalogue, checkout or database
table.

## Verified current truth

### Exact baseline

| Item | Current value |
|---|---|
| Safe base | `origin/main` = `c4c510da742fde904a5f0f422bd95cd295254312` (fetched 2026-11-05; PR #753 was test-only) |
| Working checkout | `feat/san-983-982-984-515-event-ops` at `5d728324f0f1c85ff67c487e3a48fff8798f1db1`, **dirty** |
| Clean baseline | `c4c510da742fde904a5f0f422bd95cd295254312`; locate with `git worktree list` or create a worktree from this SHA |
| Package manager / Node | npm 11.19.0 / Node 24.21.0 |
| Next.js | 16.4.3 |
| React / React DOM | `^19.2.1`, resolved 19.2.6 |
| CopilotKit React / Runtime | 1.84.1 / 1.84.1 |
| CopilotKit shared | 1.84.1 (clean install) |
| Mastra Core | 1.81.0 |
| Mastra client-js / memory / pg / libsql | 1.58.0 / 1.40.0 / 1.34.0 / 1.28.0 |
| AG-UI Client / Core | 1.0.2 / 1.0.2 |
| AG-UI Mastra adapter | 2.0.2 |
| Supabase JS / SSR | 2.106.1 / 0.10.3 |
| Stripe (Edge Function) | `npm:stripe@23.0.0` |
| Zod | 3.25.76 |

The clean install (`npm ci` in the audit worktree) added 1,793 packages and resolved the
CopilotKit/AG-UI/Mastra family without duplicate `AbstractAgent` or forced peers:

- `@copilotkit/react-core@1.84.1`
- `@copilotkit/runtime@1.84.1`
- `@copilotkit/shared@1.84.1`
- `@ag-ui/client@1.0.2`
- `@ag-ui/core@1.0.2`
- `@ag-ui/mastra@2.0.2`
- `@mastra/core@1.81.0`

### Baseline checks actually run

| Check | Result |
|---|---|
| `npm ci` in the clean worktree | PASS, 1,793 packages |
| `npm ls next react @copilotkit/react-core @copilotkit/runtime @copilotkit/shared @mastra/core @ag-ui/client @ag-ui/core @ag-ui/mastra --depth=1` | PASS, exact versions; shared 1.84.1 deduped |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0 |
| `npm run audit:copilotkit-v2` | PASS, 2,273 modules / 5,477 dependencies, 0 v1 violations, 0 allowlisted |
| `npm run check:mastra` | PASS, 34 expected `public.mastra_*` tables, pg/core versions match |
| Focused Vitest: ticket tiers, format-event, get-public-event, CopilotKit v2 contract | PASS, 4 files / 42 tests |

### What is **not** verified

- No live Supabase query was made in this audit: the Supabase MCP server is not connected to
  this session. The Linear snapshot (45 apartments, 45 embeddings, 50 published events, six
  tiers) is **not** re-certified here.
- No browser or dev server was started in this audit. Rental cards, map pins, Details,
  `render_ui`, Stop/Retry and 390px behavior remain browser-UNVERIFIED.
- No Stripe TEST purchase, signed webhook, wallet/QR readback or duplicate-webhook test was
  run.
- `npm run floor` was **not** run. The baseline checks above are narrower than the repository
  gate and do not replace it.
- The working checkout is unsuitable for implementation: its `package.json` still pins
  CopilotKit 1.75.0 / Mastra 1.74.0 / AG-UI 0.0.59 / adapter 1.1.6, while its `node_modules`
  contains the upgraded packages. Anything run there mixes old source with new dependencies.

## Upgrade audit verdict

| Subsystem | Verdict | Evidence | Smallest required fix |
|---|---|---|---|
| Exact dependency resolution | **PASS on `origin/main`**; **FAIL in the dirty checkout** | Clean `npm ci`/`npm ls` is deduped; dirty checkout has old manifest + upgraded `node_modules` | Use a clean worktree from the verified `c4c510da…` baseline; run `npm ci` there. Before a new delivery, recheck the latest PR base. Never install over the dirty checkout |
| CopilotKit v2 single-route transport | **PASS** | `createCopilotRuntimeHandler` + `mode: "single-route"` + client `useSingleEndpoint: true`; contract tests pass | None |
| Route auth, rate limits, thread ownership, Stop/Retry allowlist | **PASS by source and contract tests**; browser UNVERIFIED | Auth and ownership run before the handler; `agent/run`, `connect`, `stop`, `info` only; `threads/*` denied | Keep unchanged; prove Stop/Retry in the browser |
| AG-UI tool transport | **PASS by source** | `@ag-ui/mastra` `buildClientTools` forwards `RunAgentInput.tools`; runtime injects `render_ui` into those tools | None |
| AG-UI context transport | **PASS at the adapter** | `MastraAgent.applyInputContext` forwards `input.context` to `requestContext.get("ag-ui")` on every run | Keep; do not replace the adapter |
| Mastra model prompt consumption of the A2UI guide | **FAIL** | `src/mastra/agents/concierge.ts` dynamic instructions read `requestContext.get("ag-ui")` only for the selection hint; they never append the `Generative UI guide` entry the runtime sends | Append the generative-UI guide inside the existing dynamic instructions; no message replay, no adapter fork |
| A2UI provider/catalog | **ABSENT** | No `generativeUI` prop in either provider; no `src/components/copilot/a2ui/`; no `createGenerativeUI`; no `render_ui` references in `src/` | Add one small typed catalog and wire it into the two existing concierge providers |
| Existing rental cards | **PARTIAL / browser-UNVERIFIED** | `RentalResults`, `RentalCard`, `ToolPinsSync`, `search-rentals` exist; IDs are opaque; pins use `rental-${id}`; no browser proof on this SHA | Verify SAN-739 first; only fix reproduced defects |
| Existing event cards | **PARTIAL / browser-UNVERIFIED** | `EventResults` resolves returned IDs through the public event API; ticket prices are tier-backed | Verify guest and signed-in event search in the browser |
| Ticket quantity/availability contract | **FAIL** | UI hard-caps 8; checkout schema caps 10; canonical RPC uses per-tier `min_per_order`/`max_per_order`; mapper omits `qty_pending`, limits and sale windows; `ticketsRemaining` ignores pending | One shared availability contract; server remains authoritative |
| Ticket currency | **FAIL** | Mapper returns raw currency; formatter special-cases only exact `"COP"`; DB carries both `cop` and `COP` | Normalize to uppercase at the read/format boundary; keep server amount in minor units |
| Free ticket → checkout | **FAIL** | `EventTicketTiers` offers a free tier to checkout; the RPC rejects `price_cents <= 0` with `INVALID_TICKET_PRICE_OR_CURRENCY` | Do not open paid Checkout for zero-price tiers; either hide the CTA or add a separate RSVP path. Do not fabricate a paid order |
| Stripe TEST end-to-end | **UNVERIFIED** | Existing Edge Function has server-priced order checks, idempotency key, signed-webhook and finalize paths | Run one real TEST purchase and negative webhook cases; redirect success is not payment proof |

### The key transport finding

The runtime does exactly what the official docs say it should:

1. the provider sends the catalog envelope;
2. `GenerativeUIMiddleware.prepareInput` injects the `render_ui` tool **and** a
   `Generative UI guide` context entry;
3. `@ag-ui/mastra` forwards the tool definitions to Mastra and stores the context entry at
   `requestContext.get("ag-ui")`;
4. the Mastra model sees the tools, but MDE's concierge instructions never include the guide.

So this is not a reason to replace CopilotKit, Mastra or the adapter. It is one missing
consumer in an existing dynamic-instructions function. The official transport page is
explicit that the agent must use **both** the run's tools and its context entries.

## Confirmed errors, blockers and failure points

| ID | Severity | Problem | Evidence | Fix / proof |
|---|---|---|---|---|
| B1 | Blocker | Implementation base is a dirty, pre-upgrade branch | `git status`; `package.json` 1.75.0 vs installed 1.84.1 | Create a branch from `origin/main` in the clean worktree; `npm ci`; one SHA per PR |
| B2 | Blocker | No A2UI catalog/provider exists | no `generativeUI`; no `a2ui/`; no `createGenerativeUI`; no `render_ui` in `src/` | Add the smallest catalog and provider wiring; prove one real emitted operation |
| B3 | Blocker | `render_ui` guide never reaches the concierge model | `conciergeAgent` dynamic instructions only build the selection hint | Append the guide from `requestContext.get("ag-ui")`; test the resolved instructions |
| B4 | High | Quantity caps disagree: UI 8, API 10, RPC per tier (currently 10) | `event-ticket-tiers.tsx:17`; `ticket-checkout-schema.ts:6`; RPC `min_per_order`/`max_per_order` | Use `minPerOrder`/`maxPerOrder` from the real tier; server remains the final check |
| B5 | High | Remaining count ignores pending reservations | `get-public-event.ts` selects only `qty_total,qty_sold`; `ticketsRemaining` subtracts only sold | Select/map `qty_pending`; capacity = `max(0, total - sold - pending)` everywhere |
| B6 | High | Lowercase `cop` is not normalized | `formatTicketPrice` checks `currency === "COP"` only | Normalize `currency.trim().toUpperCase()` at the mapper and formatter; test `cop`/`COP` |
| B7 | High | Free tiers offer Checkout, server rejects them | UI test explicitly opens checkout for `priceCents: 0`; RPC rejects `price_cents <= 0` | Hide/disable paid checkout for free tiers; add a truthful no-payment path only if required |
| B8 | High | Sale windows are not mapped to the detail picker | `PublicEventTicket` has no `saleStartsAt`/`saleEndsAt`; RPC rejects not-started/ended sales | Map and render sale windows; share one availability predicate |
| B9 | Medium | `eventDetailAction` also ignores pending reservations | `remainingSeats` subtracts sold only | Use the same pending-aware helper |
| B10 | Medium | `event-detail-chat` tells guests a tier is available from sold-only counts | `summarizePublicEventForChat` calls two-argument `ticketsRemaining` | Use the pending-aware helper; test sold-out with pending |
| B11 | Medium | Rental renderer's input schema omits monthly/budget fields used by the tool | `search-tool-renders.tsx` schema lacks `maxPriceMonthly`, `maxBedrooms`, `stayType`, `budgetCurrency` | Prove with a focused renderer test before changing; extra Zod keys are stripped but the render contract should match the tool |
| B12 | Medium | Page Surface ownership is undefined | Existing page state is `shownResults`/`shownEvents` + `useBrowseMapSync`; no Surface exists | Keep the page as data owner; Surface is presentation only; never add a second map/results store |
| B13 | Medium | `LoggingMastraAgent.clone()` does not copy optional adapter config (including `a2ui`) | wrapper `clone()` passes only agent/resource/requestContext/userId | Use runtime/provider middleware for generic generative UI; do not add `a2ui` agent config without fixing clone |
| B14 | Process | Skill and docs still claim CopilotKit 1.75.0 | `.claude/skills/copilotkit/SKILL.md:108`; `docs/07-operations/README.md:120` | PR #752 owns the CopilotKit skill update; verify it separately rather than duplicate edits. Only correct another stale documentation claim at its verified location, never in credential instructions |
| B15 | Evidence gap | Live DB, browser, Stripe TEST and full gate are unproven | no Supabase MCP, no browser, no Stripe credentials in this session | Run them before any Done claim; do not substitute source inspection |

## Dependency-ordered execution plan

### Milestone 0 — clean baseline

**Outcome:** every change starts from the upgraded `main`, not the dirty Event Ops branch.

1. Use `origin/main` at the recorded SHA; create a dedicated worktree/branch.
2. Run `npm ci`, then `npm ls` for the exact family.
3. Record the SHA in Linear and in every PR body.
4. Do not copy the untracked Event Ops changes or `node_modules` into the new branch.

**Proof:** `npm ci` + `npm ls` + `npm run typecheck` on the exact base.

### Milestone 1 — SAN-739 rental verification and SAN-1632 foundation (PR 1)

**Outcome:** real rental cards work, and the ticket data contract is truthful before any AI
ticket selector is added.

**1A · SAN-739, verify first**

- Reuse `search-tool-renders.tsx`, `rental-card.tsx`, `tool-pins-sync.tsx`,
  `search-rentals.ts`, `search-tool-result-cards.tsx`.
- Search exactly: “Pet-friendly two-bedroom apartments in Laureles under COP 4M.”
- Verify each card maps to a real returned record; price is the listing's own currency;
  Details opens the same listing; the matching map pin is `rental-${id}`; empty results clear
  stale pins; an older search cannot overwrite a newer one. If pets cannot be filtered,
  assert that the UI explicitly says pet-friendliness was **not filtered** and must be
  checked per listing; do not label an unfiltered match pet-friendly.
- Check guest and signed-in, refresh, Stop/Retry, 390px and keyboard.
- Fix only reproduced defects. Do not add a second renderer or search path.

**1B · ticket quantity, capacity and currency**

Files:

- `src/lib/events/types.ts` — add `qtyPending`, `minPerOrder`, `maxPerOrder`,
  `saleStartsAt`, `saleEndsAt`.
- `src/lib/events/get-public-event.ts` — select and map those fields; normalize currency.
  Filter `event_tickets.is_hidden = false` in the **canonical public read**, alongside
  existing tier `is_active = true`, so Details, browse and A2UI share the same data;
  preserve authorized admin-management access.
- `src/lib/events/format-event.ts` — keep `ticketsRemaining(total, sold, pending)`
  as a numeric helper. Specify one canonical `getTicketAvailability(tier, requestedQuantity, now)`
  predicate returning `{ status, remaining, minimum, maximum }`. Its five statuses are
  `available`, `sold-out`, `not-yet-on-sale`, `sale-ended`, `below-minimum`; it checks
  pending capacity, per-order limits, sale windows and the current checkout API ceiling.
  Normalize currency and preserve existing price formatting.
- `src/lib/events/event-ticket-offer.ts`, `src/lib/events/event-detail-action.ts` and
  `src/lib/events/event-detail-chat.ts` — reuse that **same** predicate. In particular,
  `summarizeEventTicketOffer` must not advertise inventory below `min_per_order` as sellable.
- `src/components/events/event-ticket-tiers.tsx` — per-tier min/max; pending-aware capacity;
  no hard-coded 8; offer quantities only up to `min(maxPerOrder, remaining, 10)` to match
  the current API ceiling. If a future tier's minimum exceeds 10, show a truthful
  unavailable-by-current-checkout message, not an impossible option; no paid Checkout
  for zero-price tiers.
- `src/lib/tickets/ticket-checkout-schema.ts` — retain the documented safe transport ceiling
  of 10 (all audited tiers use 10); the RPC remains the per-tier authority. If real
  tier requirements exceed 10, change the picker and API together only after focused
  contract, capacity and concurrency tests, rather than silently widening to 50.
- Tests: update the existing ticket-tier test that asserts 8; add `cop`/`COP`, pending,
  min/max, **all five results** (`available`, `sold-out`, `not-yet-on-sale`, `sale-ended`,
  `below-minimum`) and free-tier cases. Explicitly assert a sellable tier returns
  `available`. Prove 8/9/10 accepted and 11 rejected at the current API boundary,
  including a tier with `min_per_order > 10` as a clearly surfaced incompatibility.

**No migration by default.** The canonical RPC already validates `qty_sold + qty_pending`,
per-tier min/max, publication, sale windows and positive COP. The plan has **not
verified** whether the RPC checks explicit event deactivation (`is_active`) or
hidden tiers (`is_hidden`). Inspect the canonical RPC and live definition before
changing SQL; if defects are confirmed, patch that same RPC with pgTAP tests and
preserved grants, plus a tested forward-fix or rollback migration plan.
Do not add business approvals or launch-eligibility prerequisites in development.

**Proof:** focused Vitest; browser + API + DB agree for 8/9/10/11, `cop`/`COP`, pending,
min/max, all five states including `available`, sold-out, not-yet-on-sale,
sale-ended, below-minimum, explicitly inactive events, hidden tiers and
`min_per_order > 10`; no false checkout CTA.

### Milestone 2 — SAN-1630 transport proof and one catalog (PR 2)

**Outcome:** one real generated component renders in the existing chat from a real
`render_ui` call, then the smallest reusable catalog exists.

**2A · prove the boundary**

- Add the catalog to both existing concierge providers:
  - `src/components/copilot/copilot-kit-provider.tsx`
  - `src/components/chat/chat-provider.tsx`
- Give it `agentIds: ["conciergeAgent"]` so host/partner agents get no catalog.
- Add the guide consumer in the existing dynamic instructions in
  `src/mastra/agents/concierge.ts`.
- Do not add a second provider, a second runtime or an agent-level `a2ui` config.
- Preserve `useRenderTool` as the deterministic fallback.

**2B · smallest catalog**

Create `src/components/copilot/a2ui/mde-ui-catalog.tsx` initially with **only**
`RentalCard({ listingId })`. First prove one real ID-only rental `render_ui` trace
through both the provider and Mastra guide, plus forged-ID fallback. **Only after
that proof** add `EventCard({ eventId })`; add `RentalComparison` in Milestone 3.
Do not build a full catalog before proving the single component.

Rules:

- IDs only; the model never sends price, title, currency, coordinates, source or tier data.
- Rental IDs are opaque strings; event IDs are UUIDs.
- Resolve from the current authorized search/page results; reject unknown, stale, duplicate
  or cross-thread IDs.
- Reuse `RentalCard`, `EventCard`, `useRentalUi`, `useMapContext`, the map pin id convention
  and the existing Details/viewing handlers.
- Add a provider-level error boundary and a native fallback.

**Proof:** one real browser turn shows a generated component and the AG-UI trace shows the
matching `render_ui` tool call; malformed/forged/stale IDs do not render; ordinary cards still
render when A2UI is disabled.

### Milestone 3 — SAN-1041 comparison and SAN-1631 page Surfaces (PR 2, continued)

**3A · pure comparison first**

Create `src/components/copilot/rental-comparison.tsx`:

- props take 2–4 real `Rental` rows or IDs resolved from the current results;
- compare rent, bedrooms, known amenities and source; unknown stays “Unknown”;
- reuse Details, Focus map and Viewing handlers;
- desktop side-by-side; 390px stacked or scroll inside the panel only;
- works with deterministic tool data when A2UI is off.

**3B · bounded page targets**

Add `GenerativeUISurface` to:

- `src/components/rentals/rental-browse-view.tsx`
- `src/components/events/event-browse-view.tsx`

Keep the page as the single owner of results, filters, selected item, Details and map pins.
The Surface is presentation over current IDs; it must not create a second results store or a
second map. `fallback` is the existing native panel or `null`. “Clear” deletes the generated
surface and returns the original page. An older search cannot populate a newer Surface.

**Proof:** compare three real apartments without fabricated data; cards, Details and pins
refer to the same records; guest Events still works; A→B→Clear, Stop/Retry, refresh, 390px and
invalid IDs pass.

### Milestone 4 — SAN-1632 AI ticket workflow and Stripe TEST (PR 3)

**4A · selector adapter**

Create `src/components/copilot/a2ui/event-ticket-selector.tsx`:

- receives `eventId` and optional `initialTierId`/`initialQuantity`;
- loads `/api/events/${eventId}/public`, which already excludes hidden and inactive
  tiers in the canonical public read; reuses `EventTicketTiers` **without** a
  selector-only visibility filter; admin management remains unaffected;
- after the user edits, AI updates never overwrite the user's tier/quantity;
- the user must click the existing “Review tickets” path; the agent cannot open Checkout,
  create an order or call Stripe.

**4B · stale and invalid selections**

Re-fetch the public event before opening `BookingCheckoutModal`; reject a tier that is no
longer active/sellable, hidden, outside the sale window or below minimum, a quantity
outside per-tier limits/stock/the API ceiling, and an explicitly deactivated event
(`is_active = false`). The existing server/RPC must independently reject invalid
orders even after a refetch race; test and fix that canonical path where needed.
Respect development-phase policy; do not impose launch approvals/verification.

**4C · Stripe TEST proof**

Use the existing `/api/tickets/checkout` → Edge Function → RPC → Stripe TEST → signed webhook
→ `event_orders`/wallet/QR path. Prove:

- one successful TEST purchase creates one paid order and the exact ticket entitlements;
- simultaneous duplicate webhooks do not duplicate the order/entitlements **or**
  send multiple ticket emails; use durable atomic email-send idempotency;
- a failed/expired payment creates no paid order; a success event racing with or
  arriving after cancellation/expiration cannot strand a paid buyer: test both
  orders and require reconciliation to deliver the entitlement or refund the charge;
- a forged/invalid signature is rejected;
- a sold-out tier and two concurrent buyers are handled atomically;
- redirect success alone is never treated as payment.

**Proof:** real TEST session, signed webhook, database readback, wallet/QR, screenshot
and exact order ID (redacted where needed). TEST payments write to the real MDE
Supabase project. Preserve proof, then perform **authorized, narrowly scoped** cleanup
of only test-owned orders, entitlements and dependents; re-query affected tables to
prove no test rows remain. Never delete unknown or real customer records. An
**independent `task-verifier`** must examine payment side effects, concurrent webhook
and email outcomes, reconciliation, cleanup and DB evidence before certification.
Do not run live payments.

### Milestone 5 — SAN-1637 certification

Run the user journeys in this order:

1. Rentals: search → cards → map → compare → Details → viewing → one persisted lead/showing
   with the correct broker visibility.
2. Events: search → event → tier → quantity → review → Stripe TEST → signed webhook → wallet.
3. AI: chat → Mastra tool → AG-UI → A2UI display → user action → persisted result.
4. Security: guest, signed-in, foreign thread/ID, forged ID, stale result, invalid webhook.
5. Responsive/accessibility: 390px, keyboard, focus, no body overflow.
6. Release: focused tests → lint/typecheck → `npm run floor` once at the exact SHA → real
   browser → staged deployment → exact deployed SHA check.

## PR strategy

Three reviewable deliveries, in dependency order. Keep each PR's scope closed.

| Delivery | Branch theme | Scope | Must not include |
|---|---|---|---|
| PR 1 | `feat/san-739-ticket-contract` | Rental verification; ticket quantity/capacity/currency/free-tier/availability contract; focused tests | A2UI, comparison, selector, Stripe workflow changes |
| PR 2 | `feat/san-1630-a2ui-surfaces` | One catalog; provider wiring; guide consumer; `rental-comparison`; bounded Rentals/Events Surfaces; fallback/negative tests | Ticket selector or payment changes |
| PR 3 | `feat/san-1632-ai-ticket-checkout` | Ticket selector; user-confirmed existing Checkout; Stripe TEST/webhook/wallet proof; SAN-1637 certification | New runtime, new schema, live payment |

PR #756 contains the ticket-contract changes, but **SAN-739 rental browser
verification is still pending**. Source inspection cannot establish that rental
code changes are unnecessary. Keep the two proof outcomes independent. If a rental
browser failure is reproduced, fix it in a focused correction rather than expanding
the ticket contract PR. Do not split the ticket contract from its tests.

## File and system ownership

| Area | Owner files | Change |
|---|---|---|
| Transport / auth | `src/app/api/copilotkit/[[...path]]/route.ts`, `src/lib/copilotkit-transport.ts` | No change unless a reproduced transport defect |
| Providers | `src/components/copilot/copilot-kit-provider.tsx`, `src/components/chat/chat-provider.tsx` | Add `generativeUI` with the same catalog; `agentIds` = concierge |
| Model guide | `src/mastra/agents/concierge.ts`, new `src/mastra/lib/…` helper | Append the runtime's generative-UI guide from `requestContext.get("ag-ui")` |
| Catalog | `src/components/copilot/a2ui/mde-ui-catalog.tsx` | One typed catalog; ID-only components |
| Comparison | `src/components/copilot/rental-comparison.tsx` | Pure presentation; existing handlers |
| Page Surfaces | `src/components/rentals/rental-browse-view.tsx`, `src/components/events/event-browse-view.tsx` | Bounded target, native fallback, no second state store |
| Ticket data | `src/lib/events/{types,get-public-event,format-event,event-ticket-offer,event-detail-action,event-detail-chat}.ts` | Pending, min/max, sale windows, currency; hidden tiers filtered at public read |
| Ticket UI | `src/components/events/event-ticket-tiers.tsx` | Per-tier controls; no hard-coded 8; free-tier handling |
| Ticket API | `src/lib/tickets/ticket-checkout-schema.ts` | One documented transport cap; RPC remains the authority |
| AI ticket UI | `src/components/copilot/a2ui/event-ticket-selector.tsx` | Reuses `EventTicketTiers` and `BookingCheckoutModal` |
| Tests | focused Vitest, Playwright, pgTAP only if SQL changes | Add only the cases that prove the above |

## Verification matrix

| Requirement | Smallest proof |
|---|---|
| Dependencies align | `npm ci`, `npm ls` exact family, no duplicate `AbstractAgent` |
| Transport/auth unchanged | `src/__tests__/api/copilotkit-v2-contract.test.ts`; browser guest/signed-in |
| `render_ui` guide reaches Mastra | unit test on resolved concierge instructions; real browser tool-call trace |
| Real rental cards | browser search with real DB result; IDs, prices, pin ids, Details |
| Ticket contract | Vitest for 1/8/9/10, `cop`/`COP`, pending, min/max, **all five states**, free/hidden tiers, incompatible minimum |
| Server authority | API/RPC tests: current ceiling, stale price, hidden/inactive tiers and explicit deactivation; public-read filtering, development policy, SQL migration rollback if needed |
| Comparison | 2/3/4 real records; unknown fields; Details/map parity; 390px |
| Page Surface | A→B→Clear; native fallback; no duplicate map; older result cannot win |
| AI ticket selector | real tier/quantity; manual override preserved; explicit review click |
| Stripe TEST | Paid order/entitlements, concurrent duplicate-webhook + email dedupe, success/cancel race recovery, failed/forged negatives, scoped cleanup and DB re-query; independent `task-verifier` |
| Release | `npm run floor` once on final SHA; staged exact-SHA check; no skip counted as pass |

## Rollback and fallback

- A2UI is experimental: keep the deterministic `useRenderTool` cards and page fallback as the
  default when the catalog is absent, invalid or disabled. A build-time
  `NEXT_PUBLIC_MDE_A2UI=0` is a **build-time** flag, not an immediate runtime
  kill switch; a new deployment or deployment rollback is needed.
- Ticket UI/read-contract changes can be reverted in code. If Milestone 1B proves a
  canonical RPC defect requiring a migration, a code-only PR revert is insufficient:
  supply a tested **forward-fix or rollback migration** preserving function signatures,
  grants, capacity transactions and data integrity. No migration by default.
- Stripe changes, if any, must be behind the existing sandbox/live mode selection. Never
  fall back to live money because sandbox configuration is missing.
- If a page Surface cannot preserve the current results/map relationship, ship the chat
  catalog and comparison first and leave the page target behind its fallback. Do not add a
  second map or store to force it.

## Outdated instructions to correct

| Location | Current stale claim | Correction |
|---|---|---|
| `.claude/skills/copilotkit/SKILL.md:108` | Stale v1.75.0 pin | Already owned by **open PR #752**; verify and review that PR, do not duplicate its changes here |
| `docs/07-operations/README.md` | Version claim **not proven** by the cited license-key line | Inspect actual content and update only verified version-bearing text; **do not** rewrite the license-key instructions |
| `docs/03-platform/copilotkit-mastra/reference-adoption-plan-2026-09-20.md` | `@mastra/core@1.35.0`; `examples/v2` called legacy | State the current 1.81.0 baseline; use the v1.84.1/v2 example only as a pattern |
| `docs/03-platform/copilotkit-mastra/README.md` | Generic “current pins” with no versions | Add the exact family and the A2UI limitation |
| Linear SAN-1637 / SAN-1630 | “current rental/event results/pins work” | Mark browser-UNVERIFIED until the SAN-739/event browser pass on the exact SHA |

Do not rewrite governance or business policy. Correct only the version/state claims that now
mislead an implementer.

## Best practices and suggested improvements

1. **One authoritative quantity rule.** Derive UI, API and tests from the stored tier; never
   introduce a second business cap. The database/RPC is the final authority.
2. **IDs, not facts, from the model.** A2UI props carry `listingId` / `eventId` only. Price,
   currency, availability, coordinates and source are resolved server-side or from the current
   authorized results.
3. **One catalog, one provider stack.** Use the existing provider; `agentIds` keeps host and
   partner agents out. Do not add a second generative-UI provider.
4. **Keep the fallback deterministic.** The ordinary `useRenderTool` cards and page results
   must work with A2UI disabled or malformed.
5. **Respect the experimental boundary.** Pin the installed CopilotKit/AG-UI versions; do not
   upgrade during feature work. Read the installed `.d.mts`/source before copying examples.
6. **Do not confuse a redirect with payment.** Only the signed webhook plus DB/order readback
   proves a paid ticket.
7. **Keep tests at the narrowest layer.** Unit-test the availability/formatter helpers;
   browser-test the user journey; run `floor` once on the final SHA, not after every edit.
8. **Clean the checkout before editing.** A mixed old-manifest/new-`node_modules` tree is a
   false-green factory.
9. **Record the exact SHA and evidence.** Linear status follows evidence, not code volume.
10. **Avoid false success in payment races.** Success after cancel/expiry needs an auditable issue-or-refund recovery; simultaneous webhook retries must not send duplicate email.
11. **Separate Phase A from launch gates.** Respect explicit admin deactivation, technical payment validity and data integrity without imposing approvals, verification or launch eligibility during development.

## Source receipts

Each row identifies the exact external or installed-version source that affects the planned implementation. **Verification commands are future acceptance checks, not claims of successful execution in this docs PR.** Reconfirm mutable upstream docs against the installed package versions before implementation.

| URL | Source (file/section/command) | Decision | Disposition | Destination | Implementation | Verification | Version/commit |
|---|---|---|---|---|---|---|---|
| https://docs.copilotkit.ai/mastra/generative-ui/components.mdx | Components and provider catalog | Add A2UI to existing providers, not a second runtime | **ADAPT** | `src/components/copilot/copilot-kit-provider.tsx`; `src/components/chat/chat-provider.tsx` | Pass the shared typed catalog with `agentIds: ["conciergeAgent"]` | Real `render_ui` tool trace + browser card; `npm run typecheck` | Docs unversioned; pin implementation to CopilotKit **1.84.1** |
| https://docs.copilotkit.ai/mastra/generative-ui/components/transports.mdx | Transport of run tools and context | Existing single-route transport is sufficient; reject a second custom transport | **REFERENCE ONLY** | — | No transport replacement; append runtime guide to current Mastra instructions only | `npm run audit:copilotkit-v2`; resolved-instructions test | Docs unversioned; installed AG-UI Mastra **2.0.2** |
| https://docs.copilotkit.ai/mastra/generative-ui/components/catalogs.mdx | `createGenerativeUI` typed catalog | Model must send IDs, not listing facts | **ADAPT** | `src/components/copilot/a2ui/mde-ui-catalog.tsx` | Start with `RentalCard({ listingId })`; add event only after successful trace | `npm run typecheck`; forged-ID unit test + browser | Docs unversioned; CopilotKit **1.84.1** |
| https://docs.copilotkit.ai/mastra/generative-ui/components/surfaces.mdx | `GenerativeUISurface` target/fallback | Reuse page state; no additional map or data store | **ADAPT** | `src/components/rentals/rental-browse-view.tsx`; `src/components/events/event-browse-view.tsx` | Add bounded target and native fallback; keep page ownership | A→B→Clear, out-of-order result and 390px browser tests | Docs unversioned; CopilotKit **1.84.1** |
| https://www.npmjs.com/package/@copilotkit/runtime/v/1.84.1 | Installed `dist/v2/runtime/generative-ui/generative-ui-middleware.mjs` | `render_ui`/guide are already injected; reject bespoke middleware | **REFERENCE ONLY** | — | Inspect installed middleware before writing catalog; no runtime fork | Source/contract test + real emitted operation | **1.84.1** |
| https://www.npmjs.com/package/@ag-ui/mastra/v/2.0.2 | Installed `dist/mastra-*.mjs` and `.d.mts` | Adapter already passes run tools and context; reject a second bridge | **REFERENCE ONLY** | — | Use existing `requestContext.get("ag-ui")` consumer | Resolved-instructions test + bridge trace | **2.0.2** |
| https://www.npmjs.com/package/@mastra/core/v/1.81.0 | Installed `agent.types.d.ts`, dynamic-argument types | Keep dynamic per-run instructions; do not build another agent wrapper | **ADAPT** | `src/mastra/agents/concierge.ts` | Append verified guide while preserving request/tenant identity | `npm run typecheck`; focused instructions test | **1.81.0** |
| https://docs.stripe.com/api/idempotent_requests | Idempotency keys | Existing Checkout retry path is preferred; reject a duplicate order service | **REFERENCE ONLY** | — | Preserve stable idempotency key; add retries/concurrent webhooks to proof | Concurrent Checkout/webhook TEST; DB row comparison | Official docs unversioned; Stripe Edge `npm:stripe@23.0.0` |
| https://docs.stripe.com/webhooks | Signature/retry/ordering | Reuse signed raw-body handler; reject client-side paid status | **REFERENCE ONLY** | — | Test success vs cancel ordering, duplicate emails, reconciliation/refund | Signed, forged, duplicate, out-of-order webhook TEST | Official docs unversioned; Stripe Edge `npm:stripe@23.0.0` |
| https://supabase.com/docs/guides/database/postgres/row-level-security | Server/tenant boundaries | Reuse existing RLS + RPC; reject a new public/service-role browser path | **REFERENCE ONLY** | — | No new public write path; verify existing grants before any RPC patch | Authorized/unauthorized RPC + pgTAP checks | Docs unversioned; Supabase JS **2.106.1** |

## Review corrections adopted

- **Baseline and evidence:** use recorded `c4c510da…` for the historical audit; dynamically verify the current PR base, avoid machine-specific paths, and keep rental browser proof **pending**.
- **Implementation order:** one real ID-only rental `render_ui` trace before expanding to events, comparisons or page Surfaces. PR #752 independently owns the CopilotKit skill edits.
- **Ticket contract:** one five-state availability predicate; pending/min/max/sale windows; current UI/API ceiling 10; accurately disclose unsupported filters and quantities.
- **Payment safety:** later implementation must verify inactive/hidden event checks, success–cancel recovery, concurrent email dedupe, authorized TEST cleanup and independent payment verification. **These runtime fixes are not part of this documentation PR.**
- **Sources:** versioned package receipts and explicit decisions, dispositions, implementation effects and verification requirements are above.

## Implementation status (2026-11-05)

| Item | Status |
|---|---|
| PR 1 — ticket foundation + SAN-739 browser verification | **Open, not merged** — PR #756 |
| Plan doc | This document |
| A2UI catalog / real `render_ui` proof | **Not started** — PR 2 |
| Comparison / page Surfaces | **Not started** — PR 2 |
| AI ticket selector / Stripe TEST | **Not started** — PR 3 |

PR #756 remains open until the product owner explicitly approves a merge. It is not merged.

## Immediate next action

1. Review PR #756 and do not merge it without explicit approval.
2. After approval, start PR 2 with **one** real rental card through `render_ui`; do not expand
   the catalogue until that browser trace exists.
3. Do not close SAN-1630, SAN-1631, SAN-1632 or SAN-1637 until the milestone proofs above
   exist. Do not claim `render_ui` works from code inspection alone.

The next checkpoint is one real `render_ui` browser trace after ticket-foundation
and rental-browser proof, not a second planning document.

### Review correction log

Reviewer corrections are applied **in the owning requirements above**. The ticket
RPC/webhook concerns remain **unimplemented and unverified** until the relevant feature
PR proves them; this documentation-only PR does not certify runtime payment safety.
