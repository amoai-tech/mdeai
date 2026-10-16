Analysis only · captured 15 Oct 2026

# Mindtrip vs MDE AI

We watched Mindtrip find a stay in Medellín, then compared every step with what MDE does today.

**Corrected after review.** An earlier version of this page said Mindtrip never takes payment for stays. That was wrong. Your saved screenshots show a full in-app checkout ("Confirm & Pay", card processed by a partner called Nuitee). Mindtrip has _two_ booking paths, shown below. This version also covers every screen we have seen, not just the main ones.

**Short answer:** MDE already has Mindtrip's three-panel layout (menu, chat, map). What is missing is what happens _after_ the results appear.

- **Phone users** see rental cards with no photo.
- **Desktop users** lose the map when they open a rental's details.
- **Every rental card** has a Save button that does nothing yet.
- **The progress steps** are on a timer, so they can look stuck or untruthful on slow searches.
- **Booking:** Mindtrip has two paths. Some stays book inside Mindtrip (3-step checkout, card paid through Nuitee). Others send people to Expedia, Hotels.com or the hotel. MDE rentals have only "request a viewing, broker follows up", which fits long stays but has no availability or payment step.

Overall, in our judgement: Mindtrip **89**, MDE **71** out of 100. See the scores below for what that rests on.

## What we looked at

Two sources. **(1) Our own session** in your signed-in browser: a search for "apartment for 3 nights in Poblado, 2 guests, under $120", cards, pins, a save, then "Check availability" (we stopped before any payment). **(2) Six private, locally held screenshots** (not available in this GitHub PR; see `README.md`): a Laureles search, the room page, and the checkout. We read the screenshots only; we did not run that flow. Then we read MDE's current code and screenshotted mdeai.co.

Done

- Signed-in chat, results, map, details, save, booking options
- Follow-up question ("only ones with a pool and a gym")
- Phone view (emulated at 390 px wide)
- MDE code review and public page screenshots

Blocked or skipped

- Mindtrip's public app pages sit behind a "Verify you are human" box. We did not get past it, on purpose.
- We did not click "View deal" (leaves for Expedia).
- Step 3, "Booking Confirmation": not seen anywhere
- Trips, Saved, Agents, Explore, Chats list, price alerts: not opened
- MDE's live chat was not run (it would create real records)

## Step by step: what people see

Each row is one moment in a search. "Gap" is how far MDE is from Mindtrip at that moment.

### 1. Waiting for an answer

Gap

Mindtrip

Shows real steps: "Handing off to our hotel agent", "Considering 4 hotels out of 275", "Checking room rates". The first answer took 54 seconds, but it never looked stuck.

MDE today

A step strip that moves forward every 0.9 seconds no matter what the search is doing, plus a generic "Searching Medellín…".

### 2. The result card

Partial

Mindtrip

Photo carousel, rating, price per night, dates, "Choose room", price-alert bell, heart, "Saved by N".

MDE today

Good text: match reason, badges, "Best match", honest "Not independently verified" label. One photo, hidden on phones.

### 3. Why some options were left out

Partial

Mindtrip

A "Not a good fit" table in plain words: "Above requested budget ($170/night)", "Lacks an on-site gym".

MDE today

A "Why these rentals" list with scores such as "(0.83)". Accurate, but hard for a normal person to read.

### 4. Card and map pin stay in sync

On par

Mindtrip

Hover a card and its pin comes to the front. Click a pin and details open beside the map.

MDE today

Cards and pins already highlight each other, and the list scrolls to the selected card. This is tested.

### 5. Opening the details

Gap

Mindtrip

A full panel next to the map: photo grid, Overview / Amenities / Reviews / Location, price box, map with nearby places. The page address changes so the exact place can be shared.

MDE today

In chat, rentals open a small pop-up with one photo and up to six amenities. The richer details panel exists, but only on the /rentals page.

### 6. Saving a place

Gap

Mindtrip

Heart opens "Save to a collection" (a private "Your Places" list is built in). A toast confirms it and the pin gets a heart.

MDE today

The Save button is switched off ("coming soon"). Nothing in the app writes saved items, so the Saved page is always empty.

### 7. Booking

Gap

Mindtrip

**Path A (in-app):** "Choose room" → room page → "Book" → 3-step checkout with card, Google Pay or Amazon Pay. **Path B (outbound):** "Check availability" lists Expedia $115, Hotels.com $119, or the hotel's site.

MDE today

Rentals: "Schedule viewing" sends a request to the broker (only shown when the listing really allows it). No availability check or payment for rentals. Events: Stripe ticket checkout and a ticket wallet exist.

### 8. On a phone

Partial

Mindtrip

Full-screen chat, a floating "Map" button, full-screen map with "Back to chat", details as a tall sheet with a fixed price and "Check availability" bar.

MDE today

Floating "Open map (N)" button and a map sheet already work. Missing: the card photo. The "Sign in · Sign up" link wraps onto two lines.

## What it looks like

*[Screenshot omitted from this copy: Mindtrip: chat on the left, map on the right, after a follow-up question. Original locally held capture; intentionally not in this GitHub PR.]*

**Mindtrip, desktop.** Menu, chat and map. Stay pins carry the place name.

*[Screenshot omitted from this copy: Mindtrip: clicking a pin opens a detail panel next to the chat. Original locally held capture; intentionally not in this GitHub PR.]*

**Click a pin:** a detail panel opens in place of the map, with photos, tabs and a booking box.

*[Screenshot omitted from this copy: Mindtrip: the assistant's step-by-step trace while searching. Original locally held capture; intentionally not in this GitHub PR.]*

**While waiting:** specific steps, such as "Considering 4 hotels out of 275".

*[Screenshot omitted from this copy: Mindtrip: booking options listing Expedia, Hotels.com and Direct. Original locally held capture; intentionally not in this GitHub PR.]*

**Booking:** three outside options with no Mindtrip payment on this outbound path. Other properties show a separate in-app checkout; no payment was completed in this study.

*[Screenshot omitted from this copy: MDE chat page on desktop: menu, chat prompt and map. Original locally held capture; intentionally not in this GitHub PR.]*

**MDE, desktop.** Same three-part layout. The map says "Map is ready" until a search runs.

*[Screenshot omitted from this copy: Mindtrip: Cloudflare verification box shown to automated visitors. Original locally held capture; intentionally not in this GitHub PR.]*

**Blocked:** Mindtrip asks anonymous automated visitors to "Verify you are human". We left it alone.

*[Screenshot omitted from this copy: Mindtrip on a phone: chat with Not a Good Fit table and a Map button. Original locally held capture; intentionally not in this GitHub PR.]*

**Mindtrip phone:** chat plus a floating Map button.

*[Screenshot omitted from this copy: Mindtrip on a phone: detail sheet with fixed price and Check availability bar. Original locally held capture; intentionally not in this GitHub PR.]*

**Detail sheet** with a fixed booking bar.

*[Screenshot omitted from this copy: MDE on a phone: chat prompt with filter chips and an Open map button. Original locally held capture; intentionally not in this GitHub PR.]*

**MDE phone:** chat, filter chips and "Open map".

*[Screenshot omitted from this copy: MDE rentals page on a phone: filters and the first rental. Original locally held capture; intentionally not in this GitHub PR.]*

**MDE /rentals phone:** this page does show the photo.

## Screen by screen

Ten screens. Each tag says where the evidence came from: our own session, or your saved screenshots. For each screen: how it is laid out, what it contains, what a person can do, and where they go next.

Home→Chat + agent steps→Results + map→Detail panel→Path A: Room page→Checkout step 2→Confirmation (not seen)

### Path A: book inside Mindtrip

Card "Choose room" → "Your recommended room" → "Book" → "Guest and Payment Details" → "Confirm & Pay". Seen on Loft 32 Medellín Living (your screenshots).

### Path B: book on a partner site

Detail panel "Check availability" → "Booking options" → "View deal" to Expedia or Hotels.com, or "Visit site" for the hotel. Seen on Soul Lifestyle Apartments (our session). Why a property gets one path or the other is not known.

*[Screenshot omitted from this copy: Mindtrip room page: recommended room card with price and Book button. Original locally held capture; intentionally not in this GitHub PR.]*

**Screen 8, room page** (your screenshot, sidebar cropped out): one recommended room, specs, refund date, Book.

*[Screenshot omitted from this copy: Mindtrip checkout price summary with Confirm and Pay and payment processor note. Original locally held capture; intentionally not in this GitHub PR.]*

**Screen 9, checkout summary** (cropped): total, free-cancellation date, "Confirm & Pay", and a line saying the card is processed by Nuitee.

### 1. Home

Our session

Layout

Slim icon rail on the left, a row of six category pills on top (Stays, Flights, Eats, Experiences, Events, Trips), one wide content column, floating chat box at the bottom.

Content

Greeting by first name, "Setup assistant" button, four quick-start tiles (finish setup, plan a trip, local recommendations, upload a booking receipt), an "agents" card (flight price watch, new restaurant scout, weekly local gems), then a "For you in / near Medellín" feed with weather.

Can do

Type or speak a request, tap a category, save or add any card to a trip, change location.

Goes next

Typing creates a chat without a page reload. A category pill goes to the same chat area.

MDE today

Public home page plus /chat with a "Hi, I can help with rentals, events…" prompt and filter chips. No personalised feed.

### 2. Chat with results (desktop)

Our session + your screenshots

Layout

Three columns: nav rail, chat column (about 540 px wide), map. Header shows the chat title (menu) and a chip strip: Laureles / When / Who / Budget, or city / days / travelers / currency once filled in. "Create a trip" and Share at top right.

Content

Your message, a collapsible "Thought for 50s" trace, then a written answer in fixed blocks: _What You Searched For_ (it says which dates it assumed), _Best Option_, _Other Options That Could Work_, _Not a Good Fit_ (property + reason), and a closing question ("What dates are you actually staying…?"). Under the answer: copy, read aloud, thumbs.

Card

Name, rating (count), 3 to 5 line blurb, price per night with an (i) icon and sometimes a struck-through lower number ("$43 → $60*"), room type, dates, guests, "Choose room", price-alert bell, photo carousel with heart and add-to-trip.

Can do

Follow up in plain words, open a card, pick a pin, set an alert, save.

Odd things

Two searches a few minutes apart assumed different dates (Oct 20–23, then Oct 6–9, which was before the day the files were saved). Some cards in the second answer have only a bell and no "Choose room". The struck-through price is not explained on the page; the tooltip was not captured.

MDE today

Same three columns. Cards have match reasons and honest labels. No assumed-dates statement, no "not a good fit" prose, no price-alert, no carousel.

### 3. Chat on a phone

Our session (emulated)

Layout

One column. Header: menu, chat title, trip, share. Floating "Map" pill above the chat box.

Can do

Read the answer, tap "Map" for a full-screen map with "Back to chat", tap a card for a tall detail sheet.

MDE today

Same pattern ("Open map (N)"). Rental cards lack the photo.

### 4. Map column

Our session + your screenshots

Layout

Full-height Google map. Top-left: collapse and search-this-area. Top-right: filter. Bottom-right: locate me and map type. Weather chip bottom-left.

Content

Stay pins with the name beside an icon, other pins for food and sights in different colours, a city label.

Behaviour

Hovering a card brings its pin forward. Clicking a pin opens the detail panel and puts a reference in the page address.

MDE today

Glyph pins without names, clustering, card and pin highlight each other. No name labels, no address reference.

### 5. Detail panel (desktop) and sheet (phone, tablet)

Our session + your screenshots

Layout

Replaces the map column. Top bar: close, back, Save, Add to trip, directions, audio guide, share. Five-photo mosaic, then tabs Overview / Amenities / Reviews / Location. A booking box floats on the right: price, check-in/out, guests, "Check availability", "Set price alert".

Content

Description with "Read more", address with "Get directions", amenities, reviews (or "Be the first to add a review"), a small map, "Things to know" (check-in 3:00 PM, check-out 11:00 AM), then long scroll rows: Similar stays, Stays near, Restaurants near, Things to do near, each with "Show more".

Thin data

The Loft 32 panel lists one amenity ("Parking"), no reviews, and one blank placeholder image in "Similar stays". Thin listings still render.

MDE today

Chat rentals open a small sheet (one photo, up to six amenities). The fuller panel exists only on /rentals. No "nearby" rows.

### 6. Save to a collection

Our session

Layout

Small centred dialog: private "Your Places" list and "Create a collection".

Behaviour

One tap saves, closes the dialog and shows a toast with "Change". The heart appears on the card and the pin. The list count in the dialog did not update right away.

MDE today

Save is disabled.

### 7. Booking options (Path B)

Our session

Layout

Dialog on desktop, bottom sheet on phone. Photo, name, rating, dates and guests, one AI sentence, then three rows: Expedia, Hotels.com, Direct.

Content

Price per provider, "View deal" buttons that leave Mindtrip, note that prices exclude taxes and fees.

MDE today

Nothing similar. The closest is "Schedule viewing".

### 8. Room page "Your recommended room" (Path A, step 1)

Your screenshots

Layout

Full page with the nav rail. Top: back arrow, property thumbnail and name, and an editable box for check-in, check-out, guests. One framed room card: photo on the left, details on the right.

Content

One-sentence AI summary. Room name, meal plan ("Room Only"), size (258 sq ft), sleeps 2, bed, "Flexible cancellation", "More details". Price $60 a night, "$180 for 3 nights", "Fully refundable until Oct 17, 2026". A switch "Show total price (including taxes & fees)" is off by default.

Can do

Book, set a price alert, change dates, read room details.

Goes next

"Book" opens checkout step 2.

MDE today

/rentals/[id] has a gallery, specs, amenities and a "request viewing" button. No room choice, no refund terms, no total price.

### 9. Checkout: Guest and Payment Details (Path A, step 2)

Your screenshots

Layout

Focused page: nav rail gone, back arrow, centred logo, a 3-step bar (Choose Room, Guest and Payment Details, Booking Confirmation). Left column: forms. Right: a sticky price summary.

Content, in order

Your Booking (property, dates, times, guests, nights, rooms, room chosen) → Traveler (name, email, phone; prefilled from the account) → Special requests (optional, with a "cannot be guaranteed" note) → Payment (billing name, country, address, city, province, postal code; tabs for Card, Google Pay, Amazon Pay; card number, expiry, security code) → "Important information" (hotel remarks, ID and deposit at check-in, travelling with children, local tax rules).

Price summary

Price per night $60.03, 1 room, 3 nights, Taxes and Fees $0.00, **You pay today $180.08**, "Free cancellation before Oct 17, 2026", "Confirm & Pay", terms by implied consent, and "Payment is securely processed by Nuitee. Mindtrip does not see or store your card details."

Errors

Empty card fields turn red with "Your card number is incomplete", "Your expiration date is incomplete", "Your security code is incomplete", each under its own field.

Odd things

Room page says $180; checkout says $180.08 (rounding from $60.03 a night). "Taxes and Fees $0.00" sits beside hotel remarks about a possible 19% tax at the property. The long important-information block is below the fold.

MDE today

Events: a small modal (name, email, "Pay with Stripe", redirect to Stripe). Rentals: a viewing-request modal (name, email, phone, date and time). No stepper, no price summary, no refund line.

### 10. Booking confirmation (step 3)

Not seen

Status

Not captured by us or in your files. Everything about confirmation emails, the "Trips" entry and cancellation is unknown. Payment was not completed in anything we have.

### Not seen at all

Unknown

Screens

Trips, Saved, Agents, Explore, Chats list, Updates, Inspiration, Create, the onboarding interview, the price-alert dialog, "More details" on a room, the flights, eats, experiences and events verticals, account settings, and error and empty states.

**Privacy and evidence:** the locally held checkout images include personal contact and payment-address information. This Markdown report is committed at `docs/08-strategy/competitors/mindtrip/`, but the images and `own-captures/` are deliberately not committed and are unavailable to GitHub reviewers. Observations based only on those private screenshots are not independently reproducible from this PR. Do not share unredacted captures.

## What to fix, in order

All of these reuse parts MDE already has. "Where" names the main code files for whoever builds it.

### Show rental details beside the map

Fix 1 · Launch supporting

Helps

Camila, comparing places on a laptop.

Change

"Details" opens the existing details panel in the right column. A Back button returns to the map. Phones keep the pop-up sheet.

Where

`chat-map-panel.tsx` `rental-ui-context.tsx` `rental-details-panel.tsx`

### Put the photo on phone cards

Fix 2 · Launch supporting

Helps

Roberto, searching on his phone.

Change

Show the image at the top of the card below 640 px. Later, add swipeable photos.

Where

`rental-card.tsx` `venue-card-shell.tsx`

### Make Save work

Fix 3 · Launch supporting

Helps

Everyone who wants to come back to a shortlist.

Change

Turn on the heart, store the item in the existing saved tables, list it on the Saved page.

Care

Needs database permission rules so one user can never see another's saves. This must be checked by someone other than the builder.

Where

`rental-card.tsx` `load-user-collections.ts` `saved/page.tsx` + a new migration

### Make the progress steps real

Fix 4 · Launch supporting

Helps

Anyone on a slow search.

Change

Move to the next step only when a real search step finishes, with plain text like "Searching 9 rentals…".

Where

`platform/copilot/workflow-steps.ts` `workflow-progress-strip.tsx`

### Explain what was left out, in plain words

Fix 5 · Launch supporting

Helps

Anyone who wonders "why isn't that apartment shown?"

Change

Replace "(0.83)" lines with one sentence per skipped item, for example "Above your $80/night budget".

Where

`rental-display.ts` `search-tool-result-cards.tsx` `mastra/agents/concierge.ts`

### Check what a signed-out visitor sees

Fix 6 · Verify first

Why

Opening /chat signed out triggers a "401 not allowed" response from the chat service. We did not test sending a message.

Change

If the first message fails, show a sign-in prompt. If it works, no change.

Where

`concierge-copilot-bridge.tsx` `api/copilotkit/…/route.ts`

### Ask for dates, and say which dates were used

Fix 7 · Launch supporting

Helps

Anyone who searches without dates.

Change

Mindtrip states its assumed dates and asks for real ones, but assumed different dates in two searches. MDE should show the dates used in a visible line, and keep them the same until the person changes them.

Where

`api/rentals/search/route.ts` `rental-query-parser.ts` `chat-query-bar.tsx`

### Later

After launch

Ideas

Focused 3-step checkout page with sticky summary (events first) · nearby-places rows on details · shareable link to a selected rental · name or price labels on map pins · map inside /rentals/[id] · price watch · trip "Ideas" and "Bookings" tabs.

**Booking advice (revised):** MDE uses **Stripe** for payment processing where payments are implemented (currently event tickets); Mindtrip's screenshot *states* Nuitee processes its own checkout, which is not a verified integration and is not MDE's provider. Keep the viewing request for rentals now. MDE's rentals are long stays listed by brokers, so payment in the app is a separate decision about deposits, refunds and who holds the money. If you decide to add it later, copy Mindtrip's checkout shape: three steps, one sticky price summary, a "You pay today" line, a free-cancellation date, a plain line saying who processes the card, and errors under each field. MDE's event checkout, which already uses Stripe, is the place to try that first. For rentals today, a "Contact options" sheet (schedule a viewing, WhatsApp the broker, see the original listing) is the closest match to Mindtrip's booking pop-up.

## Scores

These are our judgement, not a measured test. Mindtrip's score rests on one full signed-in search. MDE's rests on code, existing tests and three public screenshots.

Overall

89

71

Look and feel

90

70

Phone

85

62

Chat

90

72

Maps

85

76

Booking and actions

88

72

MindtripMDE today

"Booking and actions" changed after your screenshots: Mindtrip scored 70 when we thought it only linked out; with an in-app checkout and a second outbound path it is 88. MDE moved from 78 to 72 because it has no availability check or payment for rentals, only a viewing request, plus working event tickets.

## How sure are we?

Seen directly

- Layout, steps, cards, details, save toast, booking options (our screenshots)
- Room page, 3-step checkout, payment methods, price summary, "processed by Nuitee" (your screenshots)
- Mindtrip is built with Next.js behind Cloudflare
- Answers stream in live while you wait; each question opens its own stream
- MDE's timer-based steps, disabled Save, hidden phone photo (code)

Reasonable guess

- Mindtrip runs a multi-step agent with a hotel helper and live rate lookups
- Saving goes over the live connection, because no ordinary web request appeared
- Booking links earn Mindtrip a referral fee (not proven)
- The checkout card fields are hosted by the payment provider (the page says Mindtrip never sees the card)
- Which properties get Path A or Path B depends on the supplier

Not knowable from outside

- Mindtrip's AI models, prompts, ranking, database
- What its live messages contain
- How its approvals work
- What the strike-through price means, and what happens after "Confirm & Pay"

Tests we recommend writing (Playwright)

|For|The test proves|
|---|---|
|Fix 2|At 390 px wide, a rental card shows a visible photo.|
|Fix 1|At 1440 px, "Details" fills the right column and Back returns to the map with the pin still selected. On a phone, the sheet opens and closes without losing the chat position.|
|Fix 3|Save, see it on the Saved page, unsave. A second user cannot see it.|
|Fix 4|With a deliberately slow search, the progress stays on the running step and moves on only when the result arrives.|
|Fix 5|A search that excludes listings shows a reason sentence and no score text.|
|Fix 6|Signed out, sending a message shows a sign-in prompt and no uncaught 401.|
|Guard|When a listing is not viewable, no "Schedule viewing" button appears anywhere.|

Extend the existing helpers: `rental-journey-steps.ts`, `deterministic-chat.ts`, `auth.ts`.

## Decision for you

Which fixes should become Linear tasks first? We suggest starting with **Fix 2 (phone photo)** and **Fix 1 (details beside the map)**: both reuse parts that exist and need no database change.

Mindtrip was observed in your own signed-in browser, at your request. One test chat, "Poblado Apartment Search", was left in your Mindtrip account; the test save was undone. MDE code read from main at commit f58fcdac4.