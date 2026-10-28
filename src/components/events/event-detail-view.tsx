"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ChevronRight, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookingCheckoutModal, type BookingCheckoutTarget } from "@/components/modals/booking-checkout-modal";
import { EventHostBlock } from "@/components/events/event-host-block";
import { EventDetailAside } from "@/components/events/event-detail-aside";
import { EventDetailNavigation, EventDetailHero } from "@/components/events/event-detail-chrome";
import { EventVenueSection } from "@/components/events/event-venue-section";
import { formatEventSchedule, ticketsRemaining } from "@/lib/events/format-event";
import type { PublicEventDetail, PublicEventTicket } from "@/lib/events/types";

function lowestAvailablePrice(tickets: PublicEventTicket[]): PublicEventTicket | null {
  const available = tickets.filter((t) => ticketsRemaining(t.qtyTotal, t.qtySold) > 0);
  return available.length
    ? available.reduce((min, t) => (t.priceCents < min.priceCents ? t : min))
    : null;
}

export function EventDetailView({ event }: { event: PublicEventDetail }) {
  const [checkout, setCheckout] = useState<BookingCheckoutTarget | null>(null);
  const tiersRef = useRef<HTMLDivElement>(null);
  const schedule = formatEventSchedule(event.startsAt, event.endsAt);
  const street = event.venue?.address ?? event.address;
  const city = event.venue?.city ?? event.city;
  const venueLine = [street, street?.toLowerCase().includes((city ?? "").toLowerCase()) ? null : city]
    .filter(Boolean).join(" · ");
  const fromTier = useMemo(() => lowestAvailablePrice(event.tickets), [event.tickets]);
  const returnPath = `/events/${event.slug ?? event.id}`;
  const conciergePrompt = `Help me with this MDE event (event ID: ${event.id}): ${event.name}. Check its actual schedule, ticket availability and directions; clearly say when details are unconfirmed.`;
  const askUrl = `/chat?q=${encodeURIComponent(conciergePrompt)}`;
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
      <div className="min-h-screen bg-background pb-28 md:pb-8" data-testid="event-detail-page">
        <EventDetailNavigation eventName={event.name} returnPath={returnPath} />
        <div className="mx-auto max-w-6xl px-4 pt-6 md:pt-8">
          <nav aria-label="Breadcrumb" className="mb-5 hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            <Link href="/events" className="hover:underline">Events</Link>
            <ChevronRight aria-hidden className="size-3.5" />
            <span aria-current="page" className="truncate">{event.name}</span>
          </nav>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:gap-x-9 lg:gap-y-8">
            <EventDetailHero imageUrl={event.imageUrl} eventName={event.name} />
            <EventDetailAside
              event={event}
              city={city}
              venueLine={venueLine}
              schedule={schedule}
              durationLabel={durationLabel}
              fromTier={fromTier}
              tiersRef={tiersRef}
              askUrl={askUrl}
              onCheckout={setCheckout}
            />
            {event.host ? <EventHostBlock host={event.host} className="order-3 lg:col-start-1" /> : null}
            <section className="order-4 space-y-2 lg:col-start-1" aria-labelledby="event-about-heading">
              <h2 id="event-about-heading" className="text-lg font-semibold tracking-tight">About this experience</h2>
              {event.description ? (
                <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{event.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">The organizer has not provided a detailed description yet.</p>
              )}
            </section>
            {street || event.venue ? (
              <EventVenueSection className="order-5 lg:col-start-1"
                venue={event.venue ?? { name: street || city || "Event location", address: street, city: city ?? null }}
                latitude={event.latitude} longitude={event.longitude} />
            ) : null}
          </div>
        </div>
        {fromTier ? (
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden"
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
