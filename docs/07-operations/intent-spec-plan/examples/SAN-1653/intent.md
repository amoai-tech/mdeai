# Intent: Prove AI-rendered rental and event cards open the correct result

**Linear:** [SAN-1653 · MDE AI — Prove the Shared CopilotKit A2UI Foundation](https://linear.app/amo100/issue/SAN-1653)
**Origin:** Live Gen UI saved view / existing Linear issue (Todo, High; read November 9, 2026)
**Status:** Draft example — issue remains Todo until proven
**Code baseline inspected:** `main` at `4d51af18e83c7bfeabcbe7957af43adab46d0d00`

## Problem and affected users

MDE AI already renders rental/event result cards. The existing catalog unit tests prove authorized ID lookup, but they do **not** establish that an actual AI `render_ui` call displays the correct newly rendered card and opens the right Details panel on desktop and mobile. A renter or event attendee could otherwise select the second result and see the wrong listing/event. This is a **proof gap**, not a confirmed production defect.

## Desired outcome

For a real, authorized set of search results, a person can ask Ask MDE to show a specific rental or event. The AI card represents that same result, and Details opens the exact same ID. Missing/stale results are rejected honestly, while native cards, filters and maps remain usable.

**Real-world example:** An authenticated user says "Show the second event as a card" → an event card appears for the *second real event* → clicking Details opens that event, not the first or another similarly named event.

## In scope / not in scope

- In: verify both result domains, ID correspondence, stale/forged identity, thread replay, failure recovery and 390px behavior; fix only reproduced root causes.
- Out: new A2UI catalog, new provider, new agent, search engine, approval/booking subsystem, payment changes, and full production launch certification.

## Constraints

Reuse the single current CopilotKit v2 + Mastra + AG-UI path and existing authorized result records. Never invent prices, coordinates, IDs, verification, availability or action success. Keep authentication, RLS, user/thread isolation and correct idempotent actions. Phase A business eligibility/approvals must not block development.

## Open questions and decisions

- No implementation defect has been reproduced by this documentation pilot.
- Exact AI `render_ui` success versus deterministic `useRenderTool` fallback still requires a live authenticated browser probe.
- An authorized QA session and exact preview/head for browser verification must be selected during feature execution.

**Next:** see [spec.md](spec.md) for acceptance behavior and [plan.md](plan.md) for the existing implementation path. This example does not certify SAN-1653.
