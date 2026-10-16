# 07 — Booking options (Path B, outbound)

Evidence: own session (`own-captures/auth-23-check-availability.png`, `mob-04-booking-options.png`). Seen on Soul Lifestyle Apartments. We did not click any "View deal".

## Layout

Centred dialog on desktop; bottom sheet on phone. Header: thumbnail, name, rating, area, and a small dates-and-guests box (Check in Oct 16, Check out Oct 19, Guests 2).

## Content

- One AI sentence about why the property fits the request.
- Three rows:
  - **Expedia** — "Book at expedia.com", $115, **View deal ↗**
  - **Hotels.com** — "Book at hotels.com", $119, **View deal ↗**
  - **Direct** — "Book directly with the hotel", **Visit site ↗**
- Footer: "Prices are per night and exclude taxes and fees."

## What a person can do

Compare provider prices and leave for the chosen site. Nothing is paid on Mindtrip.

## Journey

Detail panel → **Check availability** → this dialog → external site. One analytics call fires on open (V). Return path unknown (U).

## Relationship to Path A

A different property (Loft 32) offered **Choose room → Book → in-app checkout** (screens [08](08-room-page.md), [09](09-checkout-guest-and-payment.md)). Which path a property gets is unknown (U); supplier-driven (I). The Loft 32 detail panel also shows **Check availability**; what it opens was not captured (U).

## MDE today

Nothing equivalent. The nearest rental action is **Schedule viewing** (`ScheduleViewingModal`, `POST /api/leads/schedule-viewing`), shown only when the search result carries `can_schedule_viewing === true`.

## Worth adapting

A "Contact options" sheet for rentals: schedule a viewing, WhatsApp the broker, view the original listing. Reuse `ScheduleViewingModal` and the WhatsApp routes.
