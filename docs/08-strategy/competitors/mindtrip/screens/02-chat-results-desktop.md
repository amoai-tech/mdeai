# 02 — Chat with results (desktop)

Evidence: own session (`own-captures/auth-26-followup-done.png`, `auth-06-results.png`) and user screenshots `1-rental-chat.png`, `1b-rental-chat.png`. Route `/chat/{numericId}` (V).

## Layout

- Three columns at 1440 px: nav rail, chat column (about 540 px of content), map.
- Header: chat title with a menu, a centred chip strip, "Create a trip" and Share at the right.
  - With no dates: `Laureles | When | Who | Budget` (screenshots).
  - With dates: `Medellin | 3 days | 2 travelers | $` (own session).
- Below about 913 px the map disappears and a **Map** pill appears (V).
- Floating composer: "Ask Mindtrip", attach, dictate, start voice, and a "Mindtrip can make mistakes" line.

## Content of one answer

1. User message.
2. Collapsible **Thought for Ns** (trace). While running: "Handing off to our hotel agent…", "Searching for apartments in El Poblado", "Considering 4 hotels out of 275 that might fit your needs" (with a small list), "Checking room rates…", "Retrieving property details and amenities" (V).
3. One-line summary.
4. **What You Searched For** — restates the query and says which dates were assumed.
5. **Best Option** — one card.
6. **Other Options That Could Work** — 2 to 3 cards.
7. **Not a Good Fit** — table of property + reason ("Above requested budget ($170/night)", "Lacks an on-site gym", "Located 20+ km outside Laureles").
8. A closing question asking for exact dates and a setup preference.
9. Actions: copy response, read aloud, feedback.
10. Occasional nudge toast: "Personalize your Mindtrip experience. Set up your assistant".

## Result card

Name with a stay icon, rating and count, 3 to 5 line blurb including the base rate in COP and USD, price per night with an (i) icon, room type, dates and guests, **Choose room**, a price-alert bell, a photo carousel with dots, a heart and an add-to-trip button, and sometimes "Saved by N people".

## What a person can do

Follow up in plain words (e.g. "only ones with a pool and a gym" re-ran the search, kept context and moved non-matching hotels into the not-a-fit table); open a card; click a pin; save; set an alert; choose a room.

## State and data

- Streaming over SSE `GET /api/events?chat_id=…&stream_id=…` plus a Socket.IO websocket (V). Message submit transport not seen as HTTP (I: socket).
- Answers took 28 to 54 s (V).

## Observed oddities

- Dates assumed differently in two searches minutes apart: Oct 20–23, then Oct 6–9. The screenshots were saved on Oct 15, so the second set is in the past (V for the dates, I for "stale").
- In the second answer some cards show only the bell and no **Choose room**. Cause unknown (U).
- Strike-through lower price next to a bold price with an asterisk ("$43 → $60*", "$100 → $116*"), explained only by an (i) tooltip that was not captured (U).
- Second answer greets the user by first name (V).

## MDE today

- `ChatCanvas` (`src/components/chat/chat-canvas.tsx`): grid `208px / 1fr / 1fr` at `lg`; `ChatCenterPanel` runs `CopilotChat` with the concierge agent.
- Progress: `WorkflowProgressStrip` advances by `Math.floor(elapsedMs / 900)` in `src/platform/copilot/workflow-steps.ts` — a timer, not real tool progress. `ConciergeThinkingIndicator` is a generic "Searching Medellín…".
- Cards: `RentalCard` has match reason, badges, "Best match", disclosures; photo hidden below `sm`; Save disabled; `rankExplanation` shown as scores.
- Filter chips (Laureles, Poblado, 2 BR, Under $80/night, Events, Food & cafés) scope the next message.

## Worth adapting

Fixes 4, 5, 7 in [../mde-gaps-and-fixes.md](../mde-gaps-and-fixes.md): real progress text, plain-language "not a fit", visible assumed dates.
