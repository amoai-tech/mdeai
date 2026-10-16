# 01 — Home

Evidence: own session, 2026-10-15 (`own-captures/auth-01-home-desktop.png`). Route `/home` (V).

## Layout

- Slim icon rail on the left (Home, Chats, Trips, Agents, Explore, Saved, Updates, Inspiration, Create, account). Labels appear in the wide variant.
- Top row of six pill buttons: Stays, Flights, Eats, Experiences, Events, Trips.
- One wide content column; floating "Ask Mindtrip" box pinned to the bottom (attach, dictate, start voice).

## Content, top to bottom

1. Greeting by name, with a "Setup assistant" button (personal-assistant onboarding).
2. Four quick-start tiles: finish setting up the assistant, plan a trip, get local recommendations, upload a booking receipt.
3. "More things I can do for you" card: flight price watch, new restaurant scout, weekly local gems, with a "Put me to work" button.
4. "For you" feed with an **in / near** toggle and a city picker (Medellín), temperature chip. Cards carry **Save** and **Add to trip**.

## What a person can do

Type or speak a request; tap a category pill; save or add any feed card to a trip; change location; start assistant setup.

## Journey

- In: sign-in lands here. Out: typing in the box creates `/chat/{id}` with no full reload (V); a category pill leads to the same chat area (I, not followed).

## State and data

Storage keys seen (names only): `mindtrip.last_used_provider`, `AMP_unsent_*`, `AMP_URL_INFO`, an IndexedDB `AMP_diagnostics_*` (V). Idle page sends no requests during a 150 s window (V).

## MDE today

- `/` public home and `/chat` (`src/app/chat/chat-page-client.tsx`) with a welcome line and filter chips. No personalised feed, no assistant onboarding, no category pills with a shared chat box.
- Related: `src/components/home/*` (hero, discovery rows, neighborhoods, trending).

## Worth adapting

- Quick-start tiles that open the chat with a prefilled intent (e.g. "1BR in Laureles under $80/night"). MDE already reads `?q=` in `concierge-initial-prompt.tsx`.
- Not now: agents card, voice, receipt upload (post-MVP).
