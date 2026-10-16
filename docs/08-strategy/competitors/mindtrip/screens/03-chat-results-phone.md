# 03 — Chat on a phone

Evidence: own session, emulated 390×844 at 2x via Chrome DevTools Protocol (`own-captures/mob-01-chat.png`, `mob-02-map.png`). Emulation, not a real device (V).

## Layout

- One column. Header: menu, chat title, "Create a trip", Share.
- Floating black **Map** pill centred above the composer.
- Composer: add (+), "Ask Mindtrip", dictate, start voice.
- "Not a Good Fit" table stays a two-column table and wraps cleanly.

## Map view

Tapping **Map** opens a full-screen map. Controls: search-this-area (top-left), filter (top-right), locate me, map type, weather chip. A bottom handle reads **Back to chat**.

## What a person can do

Read the answer, tap a card (opens the detail sheet, see [05](05-detail-panel.md)), open the map, return to chat.

## Journey

Chat → Map → pin → detail sheet → back to chat. Escape closes the sheet (desktop keyboard).

## MDE today

- `MapMobileSheet` (`src/components/chat/map-mobile-sheet.tsx`): floating "Open map (N)" button and a bottom sheet (`min-h-[75dvh]`) with a close button. Equivalent.
- Rental cards (`src/components/copilot/rental-card.tsx`) hide the photo below 640 px, so phone results are text only. The `/rentals` browse page does show the photo.
- Header link "Sign in · Sign up" wraps onto two lines at 390 px (seen on production).

## Worth adapting

Fix 2 (phone photo). Keep the existing sheet.
