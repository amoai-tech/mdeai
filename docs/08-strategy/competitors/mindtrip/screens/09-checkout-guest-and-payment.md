# 09 — Checkout: Guest and Payment Details (Path A, step 2)

Evidence: user screenshots `2894aaf7-…png` (top), `3-rental-booking.png` (full, initial state), `4-rental-booking.png` (full, filled, card errors). We did not run this flow. **These files contain personal data; they are git-ignored.**

## Layout

- Focused page: nav rail removed, round back button at the left, centred logo.
- 3-step bar: **1 Choose Room** (done), **2 Guest and Payment Details** (active), **3 Booking Confirmation**.
- Left column (about 620 px): stacked cards. Right column: sticky **Price summary** card with a small trust line under it.

## Content, in order

1. **Your Booking** — thumbnail, property name and address, Check-in (date + 3:00 PM), Check-out (date + 11:00 AM), Max. Guests, Nights, Rooms, "You selected: Double Room, Room Only, 1 double bed".
2. **Traveler** — first name, last name, email, phone. Name and email prefilled from the account; phone empty in the first state.
3. **Special requests** — optional textarea, with "Requests cannot be guaranteed".
4. **Payment information** — "Payment is securely processed by Nuitee. Mindtrip does not see or store your card details."
   - Billing first and last name.
   - Country or region (defaults to Colombia).
   - Address fields **change with the country**: Colombia shows only Address line 1; Canada adds Address line 2, City, Province, Postal code.
   - Method tabs: **Card**, **Google Pay**, **Amazon Pay**.
   - Card number (with a brand icon), expiration date, security code.
5. **Important information → Hotel remarks** — extra-person charges, ID and deposit at check-in, special requests not guaranteed, accepted payment types, cashless, safety features, no after-hours check-in, travelling with a child into Colombia (documents), and "You'll be asked to pay the following charges at the property… Colombia Value-Added Tax (VAT) at 19%. A VAT exemption is available to travelers who present a valid passport and tourist visa…", ending "We have included all charges provided to us by the property."

## Price summary (sticky)

Price per night $60.03 · 1 room · Number of nights 3 · Taxes and Fees $0.00 · **You pay today $180.08** · "Free cancellation before Oct 17, 2026" · **Confirm & Pay** · "By selecting Confirm & Pay you agree to the Terms of Service and Privacy Policy."

## Validation and errors

Empty card fields turn red with one message under each: "Your card number is incomplete.", "Your expiration date is incomplete.", "Your security code is incomplete." (V). Fields look provider-hosted (I). Behaviour for declined cards, expired quote or sold-out room not seen (U).

## Observed oddities

- Room page says $180; checkout says $180.08 (rounding from $60.03 a night).
- "Taxes and Fees $0.00" sits beside a remark that 19% VAT may be charged at the property (the remark explains a possible exemption).
- The long Important information block sits below the fold; there is no explicit acceptance checkbox, only implied consent by pressing the button.
- Phone field highlighted blue in the filled state (browser autofill).

## What a person can do

Edit traveler details, add a request, choose a payment method, **Confirm & Pay**, go back.

## Journey

[08](08-room-page.md) **Book** → this page → **Confirm & Pay** → step 3 ([10](10-booking-confirmation.md), not seen).

## MDE today

- Events: `BookingCheckoutModal` (`src/components/modals/booking-checkout-modal.tsx`, SCREEN-009): small modal, name and email, line total, **Pay with Stripe** → `POST /api/tickets/checkout` → Supabase `ticket-checkout` edge function → Stripe redirect; copy says payment is never processed in the browser. Error and retry-note test ids exist (`booking-checkout-error`, `booking-checkout-retry-note`).
- Rentals: `ScheduleViewingModal`: name, email, phone, preferred date and time → broker. No payment.
- No stepper, no sticky summary, no free-cancellation line, no total-price line.

## Worth adapting (only if payment is ever added)

Three steps; one sticky price summary with a **You pay today** line; free-cancellation date beside the button; a plain line naming who processes the card; inline errors under each field; country-aware address fields. Try it on event tickets first (Stripe already in place). Rentals are long stays through brokers, so deposits and refunds are a separate decision.
