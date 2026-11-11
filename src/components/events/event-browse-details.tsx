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

/**
 * The panel's actions. The full event page stays the canonical destination, except after a
 * confirmed 404 where the link would be a dead end; checkout is never faked here.
 */
function EventDetailsActions({
  event,
  state,
}: {
  event: PublishedEventListItem;
  state: LoadState;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-3">
        {state.status === "missing" ? null : (
          <Link
            href={`/events/${event.slug}`}
            // Prefetching here would fetch a full page for every event panel someone opens;
            // leaving it off also keeps the route's loading state observable.
            prefetch={false}
            data-testid="event-browse-details-full-page"
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-card-action px-4")}
          >
            <CalendarDays data-icon="inline-start" aria-hidden />
            Full event page
          </Link>
        )}
        {/* A confirmed 404 means the event is gone; offering to buy would contradict that. */}
        {state.status !== "missing" && event.canBuyTickets && event.ticketUrl.startsWith("http") ? (
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
    </>
  );
}

/**
 * Loading / missing / retryable states for the event panel.
 *
 * 404 means the event is genuinely gone, so it reads as final; a failed read stays retryable
 * because it must not look like a missing event.
 */
function EventDetailsStatus({
  status,
  onRetry,
}: {
  status: LoadState["status"];
  onRetry: () => void;
}) {
  if (status === "loading") {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Loading event details…
      </p>
    );
  }
  if (status === "missing") {
    return (
      <div className="rounded-lg border border-border/70 bg-muted/40 p-3 text-sm">
        This event is no longer available.
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <span>Could not load event details.</span>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  return null;
}

/**
 * Real ticket tiers from the canonical record. A tier with nothing left is labelled "Sold out"
 * and a zero-priced tier reads "Free", matching the full event page and the browse card.
 */
function EventTicketTiers({ tickets }: { tickets: PublicEventDetail["tickets"] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">Tickets</h3>
      {tickets.length ? (
        <ul className="mt-2 space-y-1.5" data-testid="event-browse-details-tiers">
          {tickets.map((ticket) => {
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
                    <span className="ml-2 text-xs font-medium text-destructive">Sold out</span>
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
        <p className="mt-2 text-sm text-muted-foreground">Price TBD</p>
      )}
    </div>
  );
}

/**
 * Loads the canonical public record for one event, keyed by event + attempt so a new record or a
 * Retry reads as "loading" without writing state inside the effect body.
 */
function usePublicEventDetail(eventId: string): { state: LoadState; retry: () => void } {
  const [loaded, setLoaded] = useState<{ key: string; state: LoadState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${eventId}:${attempt}`;
  const state: LoadState = loaded?.key === key ? loaded.state : { status: "loading" };

  useEffect(() => {
    const controller = new AbortController();
    const settle = (next: LoadState) => setLoaded({ key, state: next });

    // async/await plus a null guard: a test stub (or a browser without fetch) must become a
    // retryable error state, not an unhandled rejection.
    const load = async () => {
      try {
        const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/public`, {
          signal: controller.signal,
        });
        if (!response) {
          settle({ status: "error" });
          return;
        }
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
      } catch {
        if (!controller.signal.aborted) settle({ status: "error" });
      }
    };

    // The loader handles its own errors; nothing above needs the promise.
    load().catch(() => undefined);
    return () => controller.abort();
  }, [eventId, key]);

  return { state, retry: () => setAttempt((value) => value + 1) };
}

/** The panel body: list-row snapshot first, then the canonical public record. */
function EventBrowseDetailsBody({
  event,
  onClose,
}: {
  event: PublishedEventListItem;
  onClose: () => void;
}) {
  const { state, retry } = usePublicEventDetail(event.id);

  const priceLabel =
    event.pricePerTicket === null
      ? "Price TBD"
      : event.pricePerTicket === 0
        ? "Free"
        : `From ${formatEventCardPrice(event.pricePerTicket, event.currency)}`;

  const photo = state.status === "ready" ? state.detail.imageUrl : null;

  return (
    <div className="space-y-4 bg-background p-5 pb-8" data-testid="event-browse-details">
      {photo ? (
        // The event's own image from the canonical record — never a stock stand-in.
        // eslint-disable-next-line @next/next/no-img-element -- remote event image URL
        <img
          src={photo}
          alt=""
          className="aspect-[16/9] w-full rounded-lg object-cover"
          loading="lazy"
          data-testid="event-browse-details-photo"
        />
      ) : null}
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

      {state.status === "ready" && (state.detail.host || state.detail.venue) ? (
        <p className="text-sm text-muted-foreground" data-testid="event-browse-details-host">
          {[state.detail.host?.name, state.detail.venue?.name].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold" data-testid="event-browse-details-price">
          {priceLabel}
        </span>
      </div>

      <div aria-live="polite">
        <EventDetailsStatus status={state.status} onRetry={retry} />
      </div>

      {state.status === "ready" ? (
        <>
          {state.detail.description ? (
            <p className="line-clamp-6 text-sm leading-6" data-testid="event-browse-details-description">
              {state.detail.description}
            </p>
          ) : null}

          <EventTicketTiers tickets={state.detail.tickets} />
        </>
      ) : null}

      <EventDetailsActions event={event} state={state} />
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
    <section data-details-panel
      data-testid="event-browse-details-panel"
      data-event-id={props.event.id}
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
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto p-0" showCloseButton={false}
        data-testid="event-browse-details-sheet" data-event-id={props.event.id}>
        <SheetTitle className="sr-only">{props.event.title}</SheetTitle>
        <EventBrowseDetailsBody {...props} />
      </SheetContent>
    </Sheet>
  );
}
