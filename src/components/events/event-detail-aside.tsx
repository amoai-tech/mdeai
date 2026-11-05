"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { CalendarDays, Info, MapPin, Sparkles } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EventInterestButton } from "@/components/events/event-interest-button";
import { EventTicketTiers } from "@/components/events/event-ticket-tiers";
import type { BookingCheckoutTarget } from "@/components/modals/booking-checkout-modal";
import {
  formatTicketPrice,
  ticketAvailability,
} from "@/lib/events/format-event";
import { eventDetailAction } from "@/lib/events/event-detail-action";
import type { PublicEventDetail, PublicEventTicket } from "@/lib/events/types";

type EventDetailAsideProps = {
  event: PublicEventDetail;
  city: string | null;
  venueLine: string;
  schedule: string;
  durationLabel: string | null;
  fromTier: PublicEventTicket | null;
  interest: { signedIn: boolean; following: boolean };
  tiersRef: RefObject<HTMLDivElement | null>;
  notice: string | null;
  onCheckout: (target: BookingCheckoutTarget) => void;
};

/** The assistant now lives under the location: bring it into view instead of opening a drawer. */
function focusInlineAsk() {
  const section = document.getElementById("event-ask-mde-inline");
  if (!section) return;
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  const field = section.querySelector<HTMLTextAreaElement>("textarea")
    ?? section.querySelector<HTMLAnchorElement>('a[href*="/login"]')
    ?? section;
  field.focus({ preventScroll: true });
}

/** Visitor decision panel: event facts, one canonical ticket picker and existing AI handoff. */
export function EventDetailAside({
  event, city, venueLine, schedule, durationLabel, fromTier, tiersRef, notice, onCheckout, interest,
}: EventDetailAsideProps) {
  const states = event.tickets.map((ticket) => ticketAvailability(ticket));
  const hasBelowMinimum = states.includes("below-minimum");
  const hasClosedSale = states.includes("not-yet-on-sale") || states.includes("sale-ended");
  const paidAvailable = event.tickets
    .filter((ticket) => ticketAvailability(ticket) === "available" && ticket.priceCents > 0)
    .sort((a, b) => a.priceCents - b.priceCents);
  const cheapestPaid = paidAvailable[0] ?? null;
  return (
            <aside className="order-2 space-y-5">
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">{city || "Event details"}</p>
                <h1 className="text-2xl font-semibold leading-tight tracking-tight md:text-3xl">{event.name}</h1>
                <div className="space-y-2 text-sm">
                  <p className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span>{schedule} <span className="text-muted-foreground">(Colombia time)</span></span></p>
                  {venueLine ? (
                    <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span>{venueLine}</span></p>
                  ) : null}
                  {durationLabel ? <p className="text-xs text-muted-foreground">Duration: {durationLabel}</p> : null}
                </div>
                {notice ? (
                  <p role="note" data-testid="event-source-note"
                    className="flex items-start gap-2 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm leading-6">
                    <Info className="mt-1 size-4 shrink-0" aria-hidden />
                    <span>{notice.replace(/^\s*Listing notice:\s*/i, "")}</span>
                  </p>
                ) : event.source === "manual" ? (
                  <p className="text-xs text-muted-foreground" data-testid="event-source-note">
                    Date and details are provided by this listing. Confirm arrangements with the organizer.
                  </p>
                ) : null}
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
                {fromTier ? (
                  <p className="text-lg font-semibold" data-testid="event-ticket-headline">
                    {fromTier.priceCents === 0
                      ? cheapestPaid
                        ? `Free entry · paid tiers from ${formatTicketPrice(cheapestPaid.priceCents, cheapestPaid.currency)}`
                        : "Free entry"
                      : `From ${formatTicketPrice(fromTier.priceCents, fromTier.currency)}`}
                  </p>
                ) : (
                  <p className="text-lg font-semibold" data-testid="event-ticket-headline">
                    {hasBelowMinimum
                      ? "Unavailable"
                      : hasClosedSale
                        ? "Not on sale"
                        : eventDetailAction(event).kind === "sold-out"
                          ? "Sold out"
                          : "Price TBD"}
                  </p>
                )}
                <div ref={tiersRef} tabIndex={-1} className="mt-4 scroll-mt-24 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="event-ticket-picker">
                  <EventTicketTiers event={event} onCheckout={onCheckout} />
                </div>
                {!fromTier ? (
                  <div className="mt-4 space-y-2">
                    {/* Consent to updates, never a ticket: sold-out and no-tier events both offer it. */}
                    <EventInterestButton
                      eventId={event.id}
                      following={Boolean(interest.following)}
                      signedIn={Boolean(interest.signedIn)}
                    />
                    <Link className={buttonVariants({ variant: "outline", size: "sm" })} href="/events">
                      Explore other events
                    </Link>
                  </div>
                ) : null}
              </div>
              {/* Scrolls to the one assistant already on the page: no dialog, no second
                  conversation, so it must not advertise a popup. */}
              <Button type="button" data-testid="event-ask-mde" onClick={focusInlineAsk}
                aria-controls="event-ask-mde-inline"
                variant={fromTier ? "outline" : "default"}
                className="w-full justify-start gap-2 whitespace-normal text-left">
                <Sparkles className="size-4 shrink-0" aria-hidden />
                Ask MDE about this event
              </Button>
            </aside>
  );
}
