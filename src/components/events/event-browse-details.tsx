"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, ExternalLink, MapPin, Ticket, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { formatEventCardPrice, formatEventStartsAt } from "@/lib/events/format-event";
import type { PublicEventDetail } from "@/lib/events/types";
import type { PublishedEventListItem } from "@/lib/events/list-published-events";
import { cn } from "@/lib/utils";

/**
 * SAN-1638 — Event Details in the browse panel.
 *
 * The list row is already truthful, so it renders immediately (date, title, venue, price label).
 * The canonical record then comes from the existing public API (`GET /api/events/[id]/public`):
 * real ticket tiers, address and description. Nothing is invented:
 *  - no ticket tiers  → "Price TBD" (the same label the card uses);
 *  - 404              → this event is no longer available;
 *  - 503 / network    → a retryable error with Retry, never "not found".
 *
 * A↔B switching aborts the older request, so a slow response for A can never paint over B.
 */
type LoadState =
  | { status: "loading" }
  | { status: "ready"; detail: PublicEventDetail }
  | { status: "missing" }
  | { status: "error" };

/** The panel body: list-row snapshot first, then the canonical public record. */
function EventBrowseDetailsBody({
  event,
  onClose,
}: {
  event: PublishedEventListItem;
  onClose: () => void;
}) {
  // The load state is keyed by event + attempt, so a new record (or Retry) reads as "loading"
  // without writing state inside the effect body.
  const [loaded, setLoaded] = useState<{ key: string; state: LoadState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${event.id}:${attempt}`;
  const state: LoadState = loaded?.key === key ? loaded.state : { status: "loading" };

  useEffect(() => {
    const controller = new AbortController();
    const settle = (next: LoadState) => setLoaded({ key, state: next });
    fetch(`/api/events/${encodeURIComponent(event.id)}/public`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 404) {
          settle({ status: "missing" });
          return;
        }
        if (!response.ok) {
          settle({ status: "error" });
          return;
        }
        const payload = (await response.json()) as { event?: PublicEventDetail };
        settle(payload.event ? { status: "ready", detail: payload.event } : { status: "error" });
      })
      .catch(() => {
        if (!controller.signal.aborted) settle({ status: "error" });
      });
    return () => controller.abort();
  }, [event.id, key]);

  const priceLabel =
    event.pricePerTicket === null
      ? "Price TBD"
      : event.pricePerTicket === 0
        ? "Free"
        : `From ${formatEventCardPrice(event.pricePerTicket, event.currency)}`;
  const fullPageHref = `/events/${event.slug}`;

  return (
    <div className="space-y-4 bg-background p-5 pb-8" data-testid="event-browse-details">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">
            {formatEventStartsAt(event.startsAt)}
          </p>
          <h2 className="mt-0.5 font-serif text-xl font-semibold">{event.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {event.venue}
            {event.neighborhood && !event.venue.includes(event.neighborhood)
              ? ` · ${event.neighborhood}`
              : ""}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Close ${event.title} details`}
          data-testid="event-browse-details-close"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold" data-testid="event-browse-details-price">
          {priceLabel}
        </span>
      </div>

      {state.status === "loading" ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading event details…
        </p>
      ) : null}

      {state.status === "missing" ? (
        <div className="rounded-lg border border-border/70 bg-muted/40 p-3 text-sm">
          This event is no longer available.
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <span>Could not load event details.</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <>
          {state.detail.description ? (
            <p className="line-clamp-6 text-sm leading-6" data-testid="event-browse-details-description">
              {state.detail.description}
            </p>
          ) : null}

          <div>
            <h3 className="text-sm font-semibold">Tickets</h3>
            {state.detail.tickets.length ? (
              <ul className="mt-2 space-y-1.5" data-testid="event-browse-details-tiers">
                {state.detail.tickets.map((ticket) => {
                  // Same rule as the full page: a tier with nothing left is not purchasable.
                  const soldOut = ticket.qtyTotal - ticket.qtySold <= 0;
                  return (
                    <li
                      key={ticket.id}
                      className="flex items-center justify-between gap-3 text-sm"
                      data-sold-out={soldOut ? "true" : "false"}
                    >
                      <span>
                        {ticket.name}
                        {soldOut ? (
                          <span className="ml-2 text-xs font-medium text-destructive">
                            Sold out
                          </span>
                        ) : null}
                      </span>
                      <span className="font-medium">
                        {ticket.priceCents === 0
                          ? "Free"
                          : formatEventCardPrice(ticket.priceCents / 100, ticket.currency)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              // Same truthful label the card and the full page use.
              <p className="mt-2 text-sm text-muted-foreground">Price TBD</p>
            )}
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {/* The full page stays the canonical destination — except when the API confirmed this
            event no longer exists, where the link would be a dead end. */}
        {state.status === "missing" ? null : (
        <Link
          href={fullPageHref}
          data-testid="event-browse-details-full-page"
          className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-card-action px-4")}
        >
          <CalendarDays data-icon="inline-start" aria-hidden />
          Full event page
        </Link>
        )}
        {event.canBuyTickets && event.ticketUrl.startsWith("http") ? (
          <a
            href={event.ticketUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="event-browse-details-buy"
            className={cn(buttonVariants({ size: "sm", variant: "default" }), "h-card-action px-4")}
          >
            <Ticket data-icon="inline-start" aria-hidden />
            Buy tickets
          </a>
        ) : null}
        {state.status === "ready" && state.detail.mapsUrl ? (
          <a
            href={state.detail.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-card-action px-4")}
          >
            <MapPin data-icon="inline-start" aria-hidden />
            Directions
          </a>
        ) : null}
      </div>

      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <ExternalLink className="size-3" aria-hidden />
        Checkout and payment complete on the event page.
      </p>
    </div>
  );
}

/**
 * Desktop Details. Sits over the live map when the page has one, and alone in the right
 * column when it does not.
 */
export function EventBrowseDetailsPanel(props: {
  event: PublishedEventListItem;
  onClose: () => void;
}) {
  return (
    <section
      data-testid="event-browse-details-panel"
      aria-label={`${props.event.title} details`}
      className="absolute inset-0 z-20 overflow-y-auto rounded-xl border bg-background shadow-xl"
    >
      <EventBrowseDetailsBody {...props} />
    </section>
  );
}

/**
 * Phone Details. Reuses the shared Sheet so modal focus, Escape and return-focus stay
 * consistent with the rest of the app.
 */
export function EventBrowseDetailsSheet(props: {
  event: PublishedEventListItem;
  onClose: () => void;
}) {
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto p-0" showCloseButton={false}>
        <SheetTitle className="sr-only">{props.event.title}</SheetTitle>
        <EventBrowseDetailsBody {...props} />
      </SheetContent>
    </Sheet>
  );
}
