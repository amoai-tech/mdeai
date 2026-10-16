# Mindtrip — competitor study

Analysis only. Captured 2026-10-15. MDE code compared against `origin/main` @ `f58fcdac4` (2026-10-14).

Goal: learn which Mindtrip interactions are worth adapting for MDE's three-panel chat, rental discovery, synchronized map, booking and mobile experience. Nothing here is a spec; it is evidence plus a gap list.

## Evidence legend

- **V** — verified: seen in a screenshot or captured request.
- **I** — inference: reasonable, not proven.
- **U** — unknown: not observable from outside.

We do not claim to know Mindtrip's backend, models, prompts, database or agent framework.

## Sources

| Source | What it covers |
| --- | --- |
| Own session (REA + Playwright on a signed-in Chrome tab, 2026-10-15) | Home, chat, results, map, detail panel, save dialog, booking options (Path B), phone emulation at 390 px |
| User screenshots in this folder (full-page, 2x) | Laureles search, room page, checkout step 2 (see map below) |
| Own captures in `own-captures/` | Selected stills from the session above |
| Static bundle analysis (REA `analyze_web_bundle`) | Framework, endpoint names in JavaScript (strings only, not observed live) |

Not crawled. `robots.txt` disallows `/chat`, `/api/` and `/saved/*` for bots and everything for ClaudeBot/GPTBot. Signed-in flows were run in the owner's own browser session at the owner's request. Anonymous app pages sit behind a Cloudflare "Verify you are human" box; it was not bypassed.

## Screenshot map

| File | Shows | Screen |
| --- | --- | --- |
| `1-rental-chat.png` | Chat with first Laureles search, map beside it | [02](screens/02-chat-results-desktop.md), [04](screens/04-map-column.md) |
| `1b-rental-chat.png` | Same chat, longer: second search, detail panel open, scroll rows | [02](screens/02-chat-results-desktop.md), [05](screens/05-detail-panel.md) |
| `2-rental-detail.png` | "Your recommended room" page | [08](screens/08-room-page.md) |
| `2894aaf7-…png` | Checkout step 2, top of page | [09](screens/09-checkout-guest-and-payment.md) |
| `3-rental-booking.png` | Checkout step 2, full page, initial state (country Colombia) | [09](screens/09-checkout-guest-and-payment.md) |
| `4-rental-booking.png` | Checkout step 2, full page, filled, card errors (country Canada) | [09](screens/09-checkout-guest-and-payment.md) |

## Screens

| # | Screen | Evidence |
| --- | --- | --- |
| 01 | [Home](screens/01-home.md) | Own session |
| 02 | [Chat with results, desktop](screens/02-chat-results-desktop.md) | Own session + screenshots |
| 03 | [Chat on a phone](screens/03-chat-results-phone.md) | Own session (emulated) |
| 04 | [Map column](screens/04-map-column.md) | Own session + screenshots |
| 05 | [Detail panel and sheet](screens/05-detail-panel.md) | Own session + screenshots |
| 06 | [Save to a collection](screens/06-save-to-collection.md) | Own session |
| 07 | [Booking options (outbound)](screens/07-booking-options-outbound.md) | Own session |
| 08 | [Room page](screens/08-room-page.md) | Screenshot only |
| 09 | [Checkout: guest and payment](screens/09-checkout-guest-and-payment.md) | Screenshots only |
| 10 | [Booking confirmation](screens/10-booking-confirmation.md) | **Not captured** |

Gaps and recommended fixes: [mde-gaps-and-fixes.md](mde-gaps-and-fixes.md).

## End-to-end journey

```text
Home ─▶ Chat + agent steps ─▶ Results + map ─▶ Detail panel ─┬─▶ Path A: Choose room ─▶ Room page ─▶ Book ─▶ Checkout (step 2) ─▶ Confirmation (not seen)
 (/home)  (/chat/{id})          cards ↔ pins     ?ref=…        │
                                                               └─▶ Path B: Check availability ─▶ Booking options ─▶ Expedia / Hotels.com / hotel site
```

- **Path A (in-app)** was seen on Loft 32 Medellín Living (screenshots). Card is paid in Mindtrip's checkout; the page says the card is processed by Nuitee and Mindtrip does not see or store it (V).
- **Path B (outbound)** was seen on Soul Lifestyle Apartments (own session). All three rows leave Mindtrip (V).
- Why a property gets A or B is unknown (U). Likely depends on the supplier (I).

## Technical facts (shared across screens)

| Topic | Fact | Level |
| --- | --- | --- |
| Frontend | Next.js Pages Router, React; Base UI-style element ids; Google Maps Advanced Markers | V |
| Edge | Cloudflare (WAF, Turnstile, RUM) | V |
| Chat route | `/chat/{numericId}`; first message creates it without a full reload; `_next/data/…/chat/{id}.json` fetched on open | V |
| Streaming | `GET /api/events?chat_id=…&stream_id=…` (EventSource), new stream id per turn; Socket.IO websocket at `/mtpipe/` (frame sizes only) | V |
| Selected listing | Page address gains `?ref=ho-…&quoteRef=hq-…` when a pin or card opens details | V |
| Save, pin click | No ordinary HTTP request appeared in the capture window | V (negative); transport U |
| Session | `POST /api/auth-v2/refresh`, `POST /api/update-session-props` | V |
| Analytics | GTM/GA, Cloudflare RUM, `api2.mindtrip.ai/2/httpapi` (Amplitude-style name, `AMP_*` storage keys) | V / I |
| Endpoint names in JavaScript (strings, not observed live) | `/api/chats/create_with_message`, `/api/explore/places/stream`, `/api/favorite_places/map_markers`, `/api/hotel_bookings`, `/api/folio_documents`, `/api/proactive_agents`, `/api/user_memories*`, `/api/flight-bookings*`, `/api/voice/*` | V (strings) |
| Answer time | "Thought for 54s", "50s", "33s", "28s" across four turns | V |

## Not seen at all

Booking confirmation, Trips, Saved, Agents, Explore, Chats list, Updates, Inspiration, Create, onboarding interview, price-alert dialog, "More details" on a room, flights / eats / experiences / events verticals, account settings, error and empty states under network failure.

## Privacy

The checkout screenshots (`2894aaf7-…`, `3-…`, `4-…`) and some others show a real name, email, phone number and home address. They are **git-ignored** (see `../.gitignore`). Do not commit them. Redact before sharing. Nothing in these docs repeats those details.

## Where this lives

`docs/08-strategy/competitors/mindtrip/`. `npm run check:docs` allows only the numbered top-level folders under `docs/`, and requires every Markdown file here to be listed in the "Complete active documentation catalog" in `docs/index-docs.md`. Add a row there for any new file. Do not embed images as `data:` URIs in these files: the link checker treats them as missing files. Images stay out of git (`../.gitignore`); refer to them by path in backticks.

`02-report-mindtrip.md` is a copy of the plain-language report with its embedded screenshots replaced by placeholders. `01-prompt.md` is the brief used for a separate browser-agent investigation.
