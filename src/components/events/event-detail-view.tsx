"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ChevronRight, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookingCheckoutModal, type BookingCheckoutTarget } from "@/components/modals/booking-checkout-modal";
import { EventFactsBlock } from "@/components/events/event-facts-block";
import { EventHostBlock } from "@/components/events/event-host-block";
import { EventDetailAside } from "@/components/events/event-detail-aside";
import { EventDetailNavigation, EventDetailHero } from "@/components/events/event-detail-chrome";
import { EventDetailMap } from "@/components/events/event-detail-map";
import { EventVenueSection } from "@/components/events/event-venue-section";
import {
  DiscoveryAskComposer,
  EVENT_DETAIL_ASK_SUGGESTIONS,
} from "@/components/chat/discovery-ask-composer";
import { DiscoveryPageContext } from "@/components/chat/discovery-page-context";
import { formatEventSchedule } from "@/lib/events/format-event";
import { eventDetailAction } from "@/lib/events/event-detail-action";
import type { PublicEventDetail } from "@/lib/events/types";

/** Stored descriptions may end with an explicit "Listing notice:" paragraph; surface it as a callout, not About text. */
function splitListingNotice(description: string | null): { about: string | null; notice: string | null } {
  if (!description) return { about: null, notice: null };
  const paragraphs = description.split(/\n\s*\n/);
  const notice = paragraphs.find((p) => /^\s*Listing notice:/i.test(p)) ?? null;
  const about = paragraphs.filter((p) => p !== notice).join("\n\n").trim();
  return { about: about || null, notice: notice?.trim() ?? null };
}

type EventDetailViewProps = {
  event: PublicEventDetail;
  backTo?: "events" | "chat";
  /** Whether this visitor already follows the event; guests get a sign-in path. */
  interest?: { signedIn: boolean; following: boolean };
};

export function EventDetailView({
  event,
  backTo = "events",
  // Default to a guest: rendering without server session data must not claim a follow.
  interest = { signedIn: false, following: false },
}: EventDetailViewProps) {
  const [checkout, setCheckout] = useState<BookingCheckoutTarget | null>(null);
  const tiersRef = useRef<HTMLDivElement>(null);
  const schedule = formatEventSchedule(event.startsAt, event.endsAt);
  const { about, notice } = splitListingNotice(event.description);
  const street = event.venue?.address ?? event.address;
  const city = event.venue?.city ?? event.city;
  const venueLine = [street, street?.toLowerCase().includes((city ?? "").toLowerCase()) ? null : city]
    .filter(Boolean).join(" · ");
  // One tested decision for tickets vs sold out vs no tiers ("follow"), never a guess.
  const action = useMemo(() => eventDetailAction(event), [event]);
  const fromTier = action.kind === "tickets" ? action.tier : null;
  const returnPath = `/events/${event.slug ?? event.id}`;
  const duration = event.endsAt ? Math.round(
    (new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) / 60000,
  ) : 0;
  const durationLabel = duration > 0
    ? duration < 60 ? `${duration} minutes`
      : duration % 60 === 0 ? `${duration / 60} hours`
        : `${Math.floor(duration / 60)} hr ${duration % 60} min`
    : null;


  const focusTicketPicker = () => {
    tiersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    tiersRef.current?.focus({ preventScroll: true });
  };

  return (
    <>
      {/* SAN-1606 — clears the mobile buy bar and, below it, the floating tab bar. */}
      <div className="min-h-screen bg-background pb-[calc(7rem+var(--mde-mobile-nav-clearance))] lg:pb-8" data-testid="event-detail-page">
        {/* SAN-1600 — the in-page assistant is grounded in this event's real saved id. */}
        <DiscoveryPageContext page="events" filters={{}} selectedId={event.id} />
        <EventDetailNavigation eventName={event.name} returnPath={returnPath} backTo={backTo} />
        <div className="mx-auto max-w-6xl px-4 pt-6 md:pt-8">
          <nav aria-label="Breadcrumb" className="mb-5 hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            <Link href="/events" className="hover:underline">Events</Link>
            <ChevronRight aria-hidden className="size-3.5" />
            <span aria-current="page" className="truncate">{event.name}</span>
          </nav>
          {/* Two independent columns on desktop: the event story on the left, tickets and the
              saved-location map on the right, each stacking without stretching the other.
              On a phone both wrappers are `contents`, so the children become one flex column in
              reading order: title and tickets, then the story, then the map. */}
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-x-9">
            <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-8">
            <EventDetailHero imageUrl={event.imageUrl} eventName={event.name} startsAt={event.startsAt} />
            {event.host ? <EventHostBlock host={event.host} className="order-3" /> : null}
            <section className="order-4 space-y-2" aria-labelledby="event-about-heading">
              <h2 id="event-about-heading" className="text-lg font-semibold tracking-tight">About this experience</h2>
              {about ? (
                <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{about}</p>
              ) : (
                <p className="text-sm text-muted-foreground">The organizer has not provided a detailed description yet.</p>
              )}
            </section>
            <EventFactsBlock facts={event.facts} className="order-5" />
            {street || event.venue ? (
              <EventVenueSection className="order-6"
                venue={event.venue ?? { name: street || city || "Event location", address: street, city: city ?? null }}
                latitude={event.latitude} longitude={event.longitude}
                listedAreaOnly={!event.venue} />
            ) : null}
              {/* SAN-1624: one assistant, immediately below the location the visitor just
                  read. No drawer and no second conversation store; the aside button only
                  scrolls here. */}
              <section
                id="event-ask-mde-inline"
                aria-label="Ask MDE about this event"
                tabIndex={-1}
                data-testid="event-ask-mde-inline"
                className="order-7 scroll-mt-24 rounded-xl border border-border bg-card"
              >
                <div className="border-b border-border px-4 pt-3">
                  <h2 className="text-sm font-semibold">Ask MDE about this event</h2>
                  <p className="pb-2 text-xs text-muted-foreground">
                    New answers use this event&apos;s saved tickets, times and location.
                  </p>
                </div>
                <DiscoveryAskComposer
                  page="events"
                  suggestions={EVENT_DETAIL_ASK_SUGGESTIONS}
                  historyNote="Shared history: earlier answers may describe other events. Ask a new question for this event."
                  hideHeading
                />
              </section>
            </div>
            <div className="contents lg:flex lg:w-[380px] lg:shrink-0 lg:flex-col lg:gap-5">
            <EventDetailAside
              event={event}
              city={city}
              venueLine={venueLine}
              schedule={schedule}
              durationLabel={durationLabel}
              fromTier={fromTier}
              interest={interest}
              tiersRef={tiersRef}
              notice={notice}
              onCheckout={setCheckout}
            />
            <EventDetailMap className="order-7"
              latitude={event.latitude} longitude={event.longitude}
              exact={Boolean(event.venue)}
              label={event.venue?.name ?? street ?? city ?? event.name}
              address={event.venue?.address ?? event.address} />
            </div>
          </div>
        </div>
        {fromTier ? (
          <div className="fixed inset-x-0 bottom-[var(--mde-mobile-nav-clearance)] z-20 border-t border-border bg-background/95 p-3 backdrop-blur lg:hidden"
            data-testid="event-detail-mobile-buy-bar">
            <Button type="button" className="w-full" onClick={focusTicketPicker}
              data-testid="event-detail-mobile-buy-cta">
              <Ticket className="size-4" aria-hidden /> Choose ticket & quantity
            </Button>
          </div>
        ) : null}
      </div>
      <BookingCheckoutModal target={checkout} returnPath={returnPath}
        onClose={() => setCheckout(null)} />
    </>
  );
}
