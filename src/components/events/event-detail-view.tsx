"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, ChevronRight, MapPin, Share2, Sparkles, Ticket } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { BookingCheckoutModal, type BookingCheckoutTarget } from "@/components/modals/booking-checkout-modal";
import { EventHostBlock } from "@/components/events/event-host-block";
import { EventTicketTiers } from "@/components/events/event-ticket-tiers";
import { EventVenueSection } from "@/components/events/event-venue-section";
import { formatEventSchedule, formatTicketPrice, ticketsRemaining } from "@/lib/events/format-event";
import type { PublicEventDetail, PublicEventTicket } from "@/lib/events/types";
import { cn } from "@/lib/utils";

function lowestAvailablePrice(tickets: PublicEventTicket[]): PublicEventTicket | null {
  const available = tickets.filter((t) => ticketsRemaining(t.qtyTotal, t.qtySold) > 0);
  return available.length
    ? available.reduce((min, t) => (t.priceCents < min.priceCents ? t : min))
    : null;
}

export function EventDetailView({ event }: { event: PublicEventDetail }) {
  const [checkout, setCheckout] = useState<BookingCheckoutTarget | null>(null);
  const [shareStatus, setShareStatus] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
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

  const shareEvent = async () => {
    const url = new URL(returnPath, window.location.origin).href;
    setShareStatus("");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: event.name, url });
        setShareStatus("Event shared");
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        // A blocked native share can still recover through the clipboard below.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("Link copied");
    } catch {
      setShareStatus("Unable to copy. You can copy the address from your browser.");
    }
  };

  const focusTicketPicker = () => {
    tiersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    tiersRef.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <div className="min-h-screen bg-background pb-28 md:pb-8" data-testid="event-detail-page">
        <header className="border-b border-border/70 bg-background/95 backdrop-blur">
          <nav aria-label="Event navigation"
            className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/events" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}>
              <ArrowLeft className="size-4" aria-hidden /> Back to Events
            </Link>
            <span className="hidden text-sm font-medium text-muted-foreground sm:inline">mdeai</span>
            <div className="flex min-w-0 items-center gap-2">
              <span aria-live="polite" className="hidden max-w-48 truncate text-xs text-muted-foreground sm:inline">
                {shareStatus}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={shareEvent}
                data-testid="event-share">
                <Share2 className="size-3.5" aria-hidden /> Share
              </Button>
            </div>
          </nav>
        </header>
        <div className="mx-auto max-w-6xl px-4 pt-6 md:pt-8">
          <nav aria-label="Breadcrumb" className="mb-5 hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            <Link href="/events" className="hover:underline">Events</Link>
            <ChevronRight aria-hidden className="size-3.5" />
            <span aria-current="page" className="truncate">{event.name}</span>
          </nav>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:gap-x-9 lg:gap-y-8">
            <div className="order-1 lg:col-start-1">
              {event.imageUrl && !imageFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={event.imageUrl} alt={`Event image for ${event.name}`}
                  onError={() => setImageFailed(true)}
                  className="aspect-[16/10] w-full rounded-xl bg-muted object-cover"
                  data-testid="event-hero-image" />
              ) : (
                <div className="flex aspect-[16/10] flex-col items-center justify-center gap-2 rounded-xl bg-muted text-muted-foreground"
                  data-testid="event-image-placeholder" role="img" aria-label="No event photo available">
                  <CalendarDays className="size-9 opacity-70" aria-hidden />
                  <span className="text-sm">Event photo coming soon</span>
                </div>
              )}
            </div>
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
                {event.source === "manual" ? (
                  <p className="text-xs text-muted-foreground" data-testid="event-source-note">
                    Date and details are provided by this listing. Confirm arrangements with the organizer.
                  </p>
                ) : null}
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
                <p className="text-xs font-medium text-muted-foreground">Tickets & registration</p>
                {fromTier ? (
                  <p className="mt-1 text-lg font-semibold">
                    From {formatTicketPrice(fromTier.priceCents, fromTier.currency)}
                  </p>
                ) : (
                  <p className="mt-1 text-lg font-semibold">
                    {event.tickets.length === 0 ? "Price TBD" : "Sold out"}
                  </p>
                )}
                <div ref={tiersRef} tabIndex={-1} className="mt-4 scroll-mt-24 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="event-ticket-picker">
                  <EventTicketTiers event={event} onCheckout={setCheckout} />
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
                className={cn(buttonVariants({ variant: "outline" }), "w-full justify-start gap-2 whitespace-normal text-left")}>
                <Sparkles className="size-4 shrink-0" aria-hidden />
                Ask MDE about this event
              </Link>
            </aside>
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
        <p aria-live="polite" className="sr-only" data-testid="event-share-announcement">{shareStatus}</p>
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
