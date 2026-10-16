# 10 — Booking confirmation (step 3)

**Not captured.** No screenshot or session in this study reaches step 3, and no payment was made in anything we have.

## Unknown (U)

- Confirmation page layout and content (reference number, itinerary, receipt).
- Confirmation email, calendar file, and whether a Trips entry is created.
- Cancellation and change flow (the checkout says "Free cancellation before Oct 17, 2026").
- The `/api/hotel_bookings` and `/api/folio_documents` endpoints named in Mindtrip's JavaScript (strings only) suggest booking records and receipt upload exist (I); contracts unknown.

## How to fill this in later

Use a test or refundable booking in the owner's own account, with the owner performing the payment step. Do not automate payment.

## MDE today

Events: `/api/tickets/checkout` returns `orderId`, `shortId` and a wallet access token; tickets appear in `/me/tickets` (`my-tickets-list.tsx`, `ticket-detail-view.tsx`) with a QR display. Rentals: viewing-request confirmation banner (`lead-confirmation-banner.tsx`).
