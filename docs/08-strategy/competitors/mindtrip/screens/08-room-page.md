# 08 — Room page, "Your recommended room" (Path A, step 1)

Evidence: user screenshot `2-rental-detail.png` only. We did not run this flow. Page address is not in the screenshot; the example URL in `01-prompt.md` gives the route pattern `/hotels/{hotelRef}/rooms?hotelQuoteRef=…&tripRef=…&currency=USD` (taken from that prompt, not observed by us). A trip reference in the address suggests a room page belongs to a trip (I).

## Layout

Full page with the left nav rail visible. Top: round back button; thumbnail, property name and area; at the right an editable box with **Check in Oct 20 / Check out Oct 23 / 1 adult**.

One framed card: large photo with dots on the left, room details on the right.

## Content

- One-sentence AI summary: "A stylish, sensibly priced boutique loft stay right in Laureles with private bathroom, city view, and work desk, ideal for a solo traveler."
- Heading **Your recommended room** and a switch **Show total price (including taxes & fees)** — off by default.
- Room: **Double Room**, "Room Only", 258 sq ft, sleeps 2, 1 double bed, **Flexible cancellation**, **More details**.
- Price: **$60**, "$180 for 3 nights", "Fully refundable until Oct 17, 2026".
- **Book** (black) and a price-alert bell.
- Left rail extras: "Mindtrip for iOS" card with a QR code, account row, Company / Contact / Help / Terms / Privacy links.

## What a person can do

Change dates or guests, read room details, set an alert, **Book**.

## Journey

Chat card **Choose room** → this page → **Book** → [09](09-checkout-guest-and-payment.md).

## Notes

- Only one room is shown ("recommended"); whether other rooms exist is unknown (U).
- Refund deadline is stated up front, three days before check-in.

## MDE today

`/rentals/[id]` (`src/components/rentals/rental-detail-view.tsx`): gallery, specs, amenities, price (monthly or nightly), "Not independently verified" disclosure, request-viewing CTA with a sticky phone bar. No room selection, no refund terms, no total-price switch, no date box.

## Worth adapting

State refund terms and the total price on any future payable step. For rentals today, nothing to copy beyond the clear one-card layout.
