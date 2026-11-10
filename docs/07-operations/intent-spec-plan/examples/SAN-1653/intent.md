# Intent: Prove AI-rendered rental and event cards open the correct result

**Linear:** [SAN-1653 · MDE AI — Prove the Shared CopilotKit A2UI Foundation](https://linear.app/amo100/issue/SAN-1653)
**Origin:** Live Gen UI saved view / existing Linear issue (In Progress, High; checked November 10, 2026)
**Status:** Worked intent example — implementation issue is In Progress; feature proof is still pending
**Code baseline inspected:** `main` at `4d51af18e83c7bfeabcbe7957af43adab46d0d00`

## Problem and affected users

Renters and event attendees need to trust that an item they request from search results is the same item shown in the response and opened in Details. Existing checks do not yet demonstrate this complete experience. Showing the wrong apartment or event would mislead the user. This is a **verification gap**, not a reproduced defect.

## Desired outcome

An authenticated person can ask Ask MDE to show a specific rental or event from their real results, see the correct card and open Details for **that exact item**. On revisiting a saved conversation, the result remains accurate or is clearly marked unavailable. Search, filters, maps and chat remain useful if the AI has a problem.

**Real-world example:** An authenticated user says "Show the second event as a card" → an event card appears for the *second real event* → clicking Details opens that event, not the first or another similarly named event.

## In scope / not in scope

- In: correct item selection and Details for rentals and events; honest unavailable results; saved-conversation continuity; safe failure recovery on desktop and mobile.
- Out: unrelated booking or payment changes, redesigning discovery, and public-launch certification.

## Constraints

Keep existing product journeys and authorized search results; never invent prices, locations, availability, verification or successful actions. Preserve sign-in and user/conversation privacy. Development business approvals must not obstruct testing. Technical interfaces and implementation boundaries belong in [spec.md](spec.md).

## Open questions and decisions

- No wrong-item experience has yet been reproduced by this documentation pilot.
- Authenticated end-to-end proof is still needed for selected items, saved conversations and recovery.
- The implementing agent must use a permitted signed-in QA session and a verified test environment; see [plan.md](plan.md).

**Next:** see [spec.md](spec.md) for acceptance behavior and [plan.md](plan.md) for the existing implementation path. This example does not certify SAN-1653.
