# Mindtrip vs. MDE AI — Rental Experience Report

**Review date:** October 15, 2026  
**Reference:** [https://mindtrip.ai/](https://mindtrip.ai/)  
**MDE AI:** [https://github.com/amoai-tech/mdeai/](https://github.com/amoai-tech/mdeai/)

## 1. Executive summary

The screenshots show five important UI states:

1. AI chat with rental recommendations and a synchronized map.
    
2. Property details displayed in the right column.
    
3. A dedicated room-selection page.
    
4. An integrated guest and payment checkout.
    
5. Checkout form validation.
    

**Key discovery:** Mindtrip supports an in-app hotel checkout, not exclusively external booking links. The Loft 32 checkout shows a payment form, a price summary, and a **Confirm & Pay** button.

For MDE AI, the right approach is to adapt the interface and interaction patterns while keeping the existing **Schedule Viewing → broker** rental workflow. Rental checkout and payments are not necessary for the current MVP.

## 2. Screen-by-screen review

|Screen|What Mindtrip shows|Benefit for MDE AI|
|---|---|---|
|**1. Chat + map**|Navigation rail, conversational search, ranked property cards, map markers|Fast, visual rental discovery|
|**2. Property details**|Photos, tabs, amenities, reviews, location, price, availability action|Help renters evaluate properties without leaving chat|
|**3. Room selection**|Dates, guests, room photo, size, beds, cancellation policy, price|Adapt into detailed rental viewing and availability information|
|**4. Checkout**|Booking summary, guest form, special requests, payment methods, pricing|Reference for a clear viewing request and confirmation flow|
|**5. Validation**|Red field borders, inline errors, payment summary still visible|Better form validation and recovery|

### Screen 1 — AI search, cards and map

**Screenshot:** `1-rental-chat.png`

The layout has three sections: a narrow navigation rail, the AI conversation/results area, and a large map.

Important features:

- AI explains the user's search requirements.
    
- **Best Option** highlights the leading recommendation.
    
- **Other Options That Could Work** provides alternatives.
    
- **Not a Good Fit** explains why some properties were rejected.
    
- Listing cards include photographs, prices, ratings when available, and actions.
    
- The composer remains available at the bottom of chat.
    
- The map places recommendations in geographic context.
    

**Best feature to adopt:** Show not only matching apartments, but also why they matched or were excluded.

Example: "This Laureles apartment matches your 4M COP budget and two-bedroom requirement. This other listing is excluded because it exceeds your budget."

### Screen 2 — Property detail in the right column

**Screenshot:** `1b-rental-chat.png`

Selecting a property changes the right column from the main map to an information-rich detail panel.

Visible features:

- Property title and photo gallery.
    
- Overview, Amenities, Reviews, Location tabs.
    
- Price and availability actions.
    
- Property description and location map.
    
- Similar stays.
    
- Nearby restaurants and attractions.
    
- Save and trip-related actions.
    

**Best feature to adopt:** Keep the AI conversation visible while users inspect a property.

The large map is replaced by the detail panel, but a smaller map appears within the property details.

MDE should reuse its existing right-column architecture rather than introduce another overlay system.

### Screen 3 — Room selection

**Screenshot:** `2-rental-detail.png`

The Loft 32 room page includes a large room card with:

- Image carousel.
    
- Room type: Double Room.
    
- Room size: 258 sq ft.
    
- Bed information and guest capacity.
    
- Flexible cancellation information.
    
- Price per night and total stay estimate.
    
- **More details** and **Book** actions.
    
- Toggle to show the total including taxes and fees.
    

The screenshot shows a rate around **$60/night** and **$180 for three nights**. These are historical screenshot values, not verified current availability.

**MDE adaptation:** A polished rental detail page displaying authorized photos, monthly rent, bedrooms, amenities, verified information, and the available viewing action.

Do not introduce hotel-specific room-selection or cancellation controls where they do not apply.

### Screens 4–5 — Booking and payment

**Screenshots:** `3-rental-booking.png`, `4-rental-booking.png`

Mindtrip presents a structured three-stage journey:

**Choose Room → Guest and Payment Details → Booking Confirmation**

The checkout screen includes:

- Property and room summary.
    
- Check-in/check-out dates.
    
- Traveler information.
    
- Optional special requests.
    
- Payment address.
    
- Card, Google Pay, and Amazon Pay options.
    
- Separate price summary and cancellation information.
    
- **Confirm & Pay** action.
    
- Important hotel policies.
    

The page states that payment is processed by Nuvei; the screenshots do not independently verify the backend payment integration.

The final screenshot demonstrates inline validation for incomplete card information.

**Important:** No successful payment, reservation, booking confirmation, or webhook processing is proven by these images.

**MDE adaptation:** Use this clarity for a viewing request:

Rental summary → requested date/time → contact details → review request → confirmed saved request.

A payment form is unnecessary for that journey.

## 3. Buttons and controls inventory

|Area|Button/control|Visible purpose|Verified behavior|
|---|---|---|---|
|Navigation|Home, Chats, Trips, Saved, Explore|Main navigation|Visible; destinations not all tested|
|Chat|Send / Ask Mindtrip|Submit or refine search|Search conversation visible|
|Results|Choose room|Open accommodation selection|Room-selection screen supplied|
|Results|Heart / Save|Save a property|Visible; persistence not proven here|
|Map|Markers / map controls|Explore locations|Visible; click behavior not proven by screenshots alone|
|Details|Overview, Amenities, Reviews, Location|Change information sections|Visible|
|Details|Check availability|Continue booking journey|Action visible|
|Details|Show more|Expand recommendations|Visible|
|Room|More details|Show room information|Visible|
|Room|Total price toggle|Include taxes and fees in price display|Control visible|
|Room|Book|Advance to booking|Checkout screen supplied|
|Checkout|Card / Google Pay / Amazon Pay|Choose payment method|Visible|
|Checkout|Confirm & Pay|Submit payment|Not completed|
|Checkout|Back|Return to previous stage|Visible|
|Checkout|Input fields|Collect customer information|Inline card-field errors shown|

## 4. Three-panel layout assessment

|Element|Mindtrip observation|MDE recommendation|
|---|---|---|
|Left navigation|Narrow, simple, persistent|Keep MDE's existing navigation rail|
|Center chat|Explanations, results, persistent composer|Reuse current CopilotKit rendering|
|Right map|Large map for geographic discovery|Keep Google Maps|
|Property detail|Replaces the right map panel|Add rental detail mode to existing panel|
|Cards|Images, ranking and action buttons|Improve rental imagery and information|
|Checkout|Dedicated, focused screen|Apply to viewing confirmation, not rental payments|

The overall structure should remain simple. The chat is the central experience; maps and details provide supporting evidence.

## 5. Frontend and backend architecture

### Observable user journey

User prompt → AI recommendation → structured result cards → map → property details → room selection → checkout form → payment submission.

The screenshots support this interface sequence, but do not reveal the underlying orchestration.

### What is unknown

The screenshots cannot establish:

- Mindtrip's internal AI agents, model providers, prompts, or tool orchestration.
    
- API endpoint implementations or database structure.
    
- Server-side price verification or booking inventory locking.
    
- Payment idempotency, webhook handling, or fraud controls.
    
- Streaming protocol, request latency, or cache architecture.
    

Those questions require authorized network observations or other direct technical evidence.

For MDE AI, preserve the existing architecture:

**CopilotKit (UI) → Mastra (tools/workflows) → Supabase (rental truth) → Google Maps (geographic results).**

Use authenticated Supabase operations for viewing requests. AI should never invent listings, prices, coordinates, availability, or successful bookings.

## 6. Verified MDE AI implementation comparison

Current GitHub source confirms:

|Feature|MDE code evidence|Finding|
|---|---|---|
|Three-panel chat|`src/components/chat/chat-canvas.tsx`|Already implemented|
|Map/right-panel switching|`src/components/chat/chat-map-panel.tsx`|Supports café and nightlife details|
|Rental cards|`src/components/copilot/rental-card.tsx`|Exists, including trusted viewing action gating|
|Mobile rental photos|`src/components/copilot/rental-card.tsx`|Hidden below the `sm` breakpoint|
|Rental detail panel|`src/components/sheets/venue-detail-sheet.tsx`|Uses an overlay sheet rather than the right map column|
|Save button|`src/components/copilot/rental-card.tsx`|Explicitly disabled|
|Saved collections page|`src/app/saved/page.tsx`|Page exists and loads user collections|
|Viewing request|`src/app/api/leads/schedule-viewing/route.ts`|API route exists; production transaction not proven by this review|

These are source-code findings, not confirmation that the current production deployment behaves identically.

## 7. Top 10 recommended MDE improvements

|Priority|Improvement|Real-world benefit|Classification|
|---|---|---|---|
|1|Verify full renter-to-broker viewing flow|A renter successfully requests a real viewing|Launch blocker|
|2|Verify anonymous chat behavior|New visitors can search or see a clear sign-in requirement|Conditional blocker|
|3|Show property photos on mobile|Renters can judge listings on their phones|Launch supporting|
|4|Put rental details in the right panel|Inspect a listing without losing the conversation|Launch supporting|
|5|Improve property photo galleries|Easier inspection of genuine property images|Launch supporting|
|6|Make Save work securely|Return later to shortlisted apartments|Launch supporting|
|7|Explain matches and exclusions|Understand why listings meet or fail requirements|Launch supporting|
|8|Display real search progress|Avoid misleading simulated progress|Launch supporting|
|9|Add clearer viewing confirmation|Know what was requested and whether it was saved|Launch supporting|
|10|Add richer neighborhood recommendations|Discover nearby cafés, services, and activities|Post-MVP|

## 8. Suggested implementation sequence

**Phase 1 — Prove the essential journey**

Verify search eligibility, valid listing data, map/card sync, authenticated viewing submission, exactly-once lead/showing creation, and correct broker visibility.

**Phase 2 — Improve the experience**

Reuse the existing rental card, right-column map panel, rental UI context, details component, and saved collections infrastructure.

Apply mobile image fixes, desktop detail-panel switching, working Save actions, and clear match explanations in small, focused changes.

**Phase 3 — Enhance discovery**

Add nearby services, deeper property galleries, collections, and richer location information only after the core rental journey is proven.

## 9. UI/UX scorecard

Subjective assessment of the supplied Mindtrip screens only.

|Category|Score|
|---|---|
|Navigation and desktop structure|92/100|
|Conversational rental discovery|90/100|
|Property result cards|89/100|
|Property details|91/100|
|Map presentation|88/100|
|Room selection|89/100|
|Checkout clarity|82/100|
|Form validation visibility|85/100|
|Mobile UX|Not tested|
|Backend/agent reliability|Not tested|

**Overall visual experience: approximately 88/100.**

This is a design judgment, not a measured benchmark or booking success rate.

## 10. Limitations and verification still needed

The requested sample search was for **November 6–9, 2026, two adults**, but the room and checkout screenshots show **October 20–23, 2026, one adult**. They should not be treated as proof of availability for the requested dates.

The checkout screenshots also show personal contact and payment-address information; these should be redacted before sharing the screenshots outside the project.

Mobile, tablet, accessibility, live API traffic, payment completion, and actual agent internals remain unverified.

## Final recommendation

**Do not rebuild MDE AI around Mindtrip's hotel-booking architecture.**

Keep MDE's existing three-panel layout and trusted rental workflow.

Adopt Mindtrip's best experience patterns:

**Conversational search → clearly ranked cards → geographic context → rich details → simple, confirmed action.**

For MDE, that final action is a legitimate viewing request successfully recorded and delivered to the correct broker.