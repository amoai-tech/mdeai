# MDE gaps and recommended fixes (from the Mindtrip study)

Plans only; no code was changed. Every file path below exists on `origin/main` @ `f58fcdac4`. Priorities: **Launch supporting**, **Verify first**, **Post-MVP**. Scores are reviewer judgement, not a benchmark.

## What MDE already matches

- Three-panel shell (`src/components/chat/chat-canvas.tsx`, comment "Mindtrip layout").
- Card ↔ pin highlight and scroll-to-card (`data-pin-id`, `ToolPinsSync`, `MapUiSync`).
- Phone map sheet (`map-mobile-sheet.tsx`).
- Honest rental disclosures and server-gated viewing request (`rental-card.tsx`, SAN-1349).
- Thread history with loading, error and retry (`chat-center-panel.tsx`).

## Fixes

| # | Fix | Files | Priority |
| --- | --- | --- | --- |
| 1 | Open rental Details in the right column using the existing `RentalDetailsPanel`; Back restores the map and pin; phones keep the sheet | `chat-map-panel.tsx`, `rental-ui-context.tsx`, `rental-details-panel.tsx`, `search-tool-result-cards.tsx` (`RentalResults.openDetail`) | Launch supporting |
| 2 | Show the photo on phone cards (currently `hidden … sm:block`); later add a swipeable carousel | `rental-card.tsx`, `venue-card-shell.tsx`, `ui/carousel.tsx`, `rentals/gallery-image.tsx` | Launch supporting |
| 3 | Make Save real: enable `rental-save-cta`, write to the existing saved tables, list on `/saved`. **Needs RLS policy and independent verification (S4)** | `rental-card.tsx`, `lib/saved/load-user-collections.ts`, `app/saved/page.tsx`, new migration | Launch supporting |
| 4 | Drive progress from real tool events, not `elapsed / 900 ms`; use tool-specific text | `platform/copilot/workflow-steps.ts`, `chat/chat-workflow-context.tsx`, `chat/workflow-progress-strip.tsx`, `chat/concierge-thinking-indicator.tsx` | Launch supporting |
| 5 | Plain-language "not a fit" reasons instead of `factor (0.83)` lines | `lib/rental-display.ts`, `copilot/search-tool-result-cards.tsx`, `mastra/tools/search-rentals.ts`, `mastra/agents/concierge.ts` | Launch supporting |
| 6 | Check what a signed-out visitor sees: `/chat` fires `POST /api/copilotkit` → 401 on load (seen on production). Show a sign-in prompt only if the first message fails | `chat/concierge-copilot-bridge.tsx`, `app/api/copilotkit/[[...path]]/route.ts` | Verify first |
| 7 | Say which dates were used and keep them stable until changed (Mindtrip assumed different dates in two searches) | `app/api/rentals/search/route.ts`, `lib/rental-query-parser.ts`, `chat/chat-query-bar.tsx` | Launch supporting |
| 8 | Deep link `?ref=<listingId>` to reopen a selected rental | `app/chat/chat-page-client.tsx`, `chat/concierge-initial-prompt.tsx`, `rental-ui-context.tsx` | Post-MVP |
| 9 | Name or price labels on rental pins | `maps/markers/CategoryMapMarker.tsx`, `maps/map-pin-meta.ts` | Post-MVP |
| 10 | Embedded map on `/rentals/[id]` | `rentals/rental-detail-view.tsx` | Post-MVP |
| 11 | Focused 3-step checkout with sticky summary (events first) | `modals/booking-checkout-modal.tsx`, `events/event-detail-view.tsx` | Post-MVP |
| 12 | Price watch, proactive agents, audio guides, nearby-places rows, "Saved by N", trips Ideas and Bookings tabs | trips, mastra | Post-MVP |

## Booking recommendation

Keep the viewing request for rentals now. In-app payment for long stays is a separate decision (deposits, refunds, who holds the money). Closest match to Mindtrip's booking pop-up: a "Contact options" sheet (schedule a viewing, WhatsApp the broker, view the original listing) reusing `ScheduleViewingModal`. If rental payment is added later, use **Stripe** (MDE's payment provider), not Mindtrip's on-screen processor; adapt only the checkout UX shape in [screen 09](screens/09-checkout-guest-and-payment.md).

## Scores (/100)

| | Mindtrip | MDE today | Basis |
| --- | ---: | ---: | --- |
| UX | 90 | 70 | One full signed-in flow vs code plus three public screenshots |
| Mobile | 85 | 62 | Emulated 390 px; MDE phone card has no photo |
| Chat | 90 | 72 | Live trace and reasons vs timer progress |
| Maps | 85 | 76 | MDE sync is solid; no in-column rental detail |
| Booking and actions | 88 | 72 | Mindtrip: two paths; MDE: viewing request, no rental payment, working event tickets |
| **Overall** | **89** | **71** | |

## Acceptance tests (Playwright, to write)

Reuse `e2e/helpers/rental-journey-steps.ts`, `deterministic-chat.ts`, `auth.ts`; extend `chat-workspace-layout.spec.ts`, `maps-layout-mobile.spec.ts`, `san-1416-rental-details-panel.spec.ts`.

| Fix | Test |
| --- | --- |
| 2 | At 390×844, first `[data-testid="rental-card"]` shows a visible photo |
| 1 | At 1440, **Details** sets `[data-testid="map-panel"]` to `data-right-column-mode="detail"` with `rental-details-gallery`; Back returns to `map` with the pin still selected. On a phone the sheet opens and closes without losing chat scroll |
| 3 | Save → toast → listed on `/saved` → unsave → empty; a second user cannot see it |
| 4 | With a delayed tool, the strip stays on the running step beyond 3 s and advances only on the tool result |
| 5 | A search that excludes listings shows a reason sentence and no `(0.` score text |
| 6 | Signed out, send a message → sign-in prompt; no uncaught 401 in the console |
| 7 | A search without dates shows the dates used; they persist across a follow-up |
| Guard | `can_schedule_viewing=false` → no `rental-schedule-cta` in card or panel (SAN-1349) |

## Not verified

Live MDE concierge responses, signed-in MDE flows, tablet layout, Stripe checkout end to end, MDE rental search latency.
