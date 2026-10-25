# 05 — Detail panel (desktop) and detail sheet (tablet, phone)

Evidence: own session (`own-captures/auth-09-click-pin.png`, `auth-11-after-save.png`, `mob-03-detail-sheet.png`) and `1b-rental-chat.png`.

## Layout

- **Desktop (≥ about 1000 px)**: replaces the map column. Top bar: close, back-to-map, **Save**, **Add to trip**, directions, audio guide, share.
- **Tablet (about 913 px) and phone**: a tall sheet over the chat with a drag handle. Phone adds a fixed bottom bar: price per night, dates, guests, bell, **Check availability**, then horizontally scrolling suggested questions ("Room amenities?", "Location convenience?", "Pet polic…").

## Content, top to bottom

1. Name, rating, review count, area, "Hotel" tag.
2. Five-photo mosaic (one large, four small). Phone: carousel with dots.
3. "Saved by N person(s)".
4. Tabs: Overview, Amenities, Reviews, Location.
5. AI note about the quoted price, e.g. "Your Deluxe Apartment #209 for Oct 16–19 is $115/night before taxes & fees — Expedia adds those at checkout".
6. Description with **Read more**; suggested questions about the property.
7. Booking box (desktop, right): price per night, check-in, check-out, guests, **Check availability**, **Set price alert**.
8. Address with **Get directions**.
9. Amenities, reviews ("Be the first to add a review"), in-panel map with nearby places and **Get directions**.
10. "Things to know": check-in 3:00 PM, check-out 11:00 AM.
11. Scroll rows with "Show more": Similar stays, Stays near, Restaurants near, Things to do near.

## What a person can do

Browse photos, switch tabs, ask suggested questions, save (opens [06](06-save-to-collection.md)), add to a trip, get directions, set an alert, check availability (opens [07](07-booking-options-outbound.md) in our session).

## Thin data

The Loft 32 panel (screenshots) lists one amenity ("Parking"), no reviews, and one blank placeholder image among "Similar stays". Sparse listings still render with no error.

## State and data

Opening a pin triggers no new HTTP request (V). URL gets `?ref=…&quoteRef=…` so the exact quote is shareable (I: reloadable; not tested).

## MDE today

- Chat rentals: `VenueDetailSheet` (`src/components/sheets/venue-detail-sheet.tsx`, SCREEN-007) shows one photo and up to six amenities.
- `RentalDetailsPanel` (`src/components/rentals/rental-details-panel.tsx`, SAN-1416): photo carousel, price, availability, bedrooms, amenities, location link, external-ad disclosure, viewing request. Used only by `rental-browse-view.tsx` on `/rentals`.
- `/rentals/[id]` (`rental-detail-view.tsx`): desktop gallery grid, mobile carousel, sticky mobile CTA, external "View on map" link, no embedded map.
- No "nearby" rows, no suggested questions, no URL reference for the selected listing (only `?q=` is read).

## Worth adapting

Fix 1 (open `RentalDetailsPanel` in the right column), `?ref=` deep link (later), nearby rows (later), suggested questions as chat prompts (later).
