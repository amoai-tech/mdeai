"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { CalendarDays, Info, MapPin, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EventTicketTiers } from "@/components/events/event-ticket-tiers";
import type { BookingCheckoutTarget } from "@/components/modals/booking-checkout-modal";
import { formatTicketPrice } from "@/lib/events/format-event";
import type { PublicEventDetail, PublicEventTicket } from "@/lib/events/types";
import { cn } from "@/lib/utils";

type EventDetailAsideProps = {
  event: PublicEventDetail;
  city: string | null;
  venueLine: string;
  schedule: string;
  durationLabel: string | null;
  fromTier: PublicEventTicket | null;
  tiersRef: RefObject<HTMLDivElement | null>;
  askUrl: string;
  notice: string | null;
  onCheckout: (target: BookingCheckoutTarget) => void;
};

/** Visitor decision panel: event facts, one canonical ticket picker and existing AI handoff. */
export function EventDetailAside({
  event, city, venueLine, schedule, durationLabel, fromTier, tiersRef, askUrl, notice, onCheckout,
}: EventDetailAsideProps) {
  return (
            <aside className="order-2 space-y-5 lg:col-start-2 lg:row-start-1 lg:row-span-4 lg:sticky lg:top-8 lg:self-start">
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
                  <p className="text-lg font-semibold">
                    From {formatTicketPrice(fromTier.priceCents, fromTier.currency)}
                  </p>
                ) : (
                  <p className="text-lg font-semibold">
                    {event.tickets.length === 0 ? "Price TBD" : "Sold out"}
                  </p>
                )}
                <div ref={tiersRef} tabIndex={-1} className="mt-4 scroll-mt-24 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="event-ticket-picker">
                  <EventTicketTiers event={event} onCheckout={onCheckout} />
                </div>
                {!fromTier ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link className={buttonVariants({ variant: "outline", size: "sm" })} href="/events">
                      Explore other events
                    </Link>
                  </div>
                ) : null}
              </div>
              <Link href={askUrl} data-testid="event-ask-mde"
                className={cn(buttonVariants({ variant: fromTier ? "outline" : "default" }), "w-full justify-start gap-2 whitespace-normal text-left")}>
                <Sparkles className="size-4 shrink-0" aria-hidden />
                Ask MDE about this event
              </Link>
            </aside>
  );
}
