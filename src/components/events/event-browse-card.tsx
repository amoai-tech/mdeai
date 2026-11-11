import Link from "next/link";
import { CalendarDays, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { VenueCardShell } from "@/components/browse/venue-card-shell";
import { VenueCardPlaceholder, venueCardMediaFrame } from "@/components/browse/venue-card-placeholder";
import { formatEventBadgeDate, formatEventCardPrice, formatEventStartsAt } from "@/lib/events/format-event";
import type { PublishedEventListItem } from "@/lib/events/list-published-events";
import type { EventCategory } from "@/mastra/tools/search-events";
import { cn } from "@/lib/utils";

type EventBrowseCardProps = {
  event: PublishedEventListItem;
  composition?: "legacy" | "nova";
  mediaLayout?: "inline" | "cover";
  selectedForAsk?: boolean;
  onAskSelect?: () => void;
  /** SAN-1638: open Details in the page's right panel instead of navigating. */
  onDetails?: (trigger: HTMLElement) => void;
  /** SAN-1638: this card's Details panel is open (announced with aria-expanded). */
  detailsOpen?: boolean;
  /** Present only when the event has a real map pin; the same ID the shared map uses. */
  pinId?: string;
};

const CATEGORY_LABELS: Record<EventCategory, string> = {
  music: "Music",
  food: "Food",
  culture: "Culture",
  sport: "Sport",
  nightlife: "Nightlife",
};

/**
 * Card media: the real event image, or a date badge when none is available.
 *
 * A photo-less event used to render the same generic tile as every other photo-less card, which
 * made the events list read as unfinished. The date is the fact a visitor scans for anyway, and
 * it is derived from the real record in Medellín local time. The badge is decorative — the
 * readable schedule line stays the accessible source of truth.
 */
function EventBrowseCardMedia({
  imageUrl,
  imageAlt,
  mediaLayout,
  startsAt,
}: {
  imageUrl?: string;
  imageAlt: string;
  mediaLayout: "inline" | "cover";
  startsAt: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={imageAlt}
        className={cn(venueCardMediaFrame(mediaLayout), "bg-muted text-xs text-muted-foreground object-cover")}
        loading="lazy"
        data-testid="event-browse-card-photo"
      />
    );
  }

  const badge = formatEventBadgeDate(startsAt);

  // One owner for the media frame: the shared placeholder decides radius, aspect, gradient and
  // gap. This card only supplies what sits in the middle, so it can never drift from the family.
  return (
    <VenueCardPlaceholder
      label="Event"
      icon={<CalendarDays className="size-5" aria-hidden />}
      mediaLayout={mediaLayout}
      testId={badge ? "event-browse-card-date-badge" : "event-browse-card-photo-placeholder"}
      content={
        badge ? (
          mediaLayout === "cover" ? (
            // Full tile: month over a large day.
            <>
              <span className="text-[11px] font-semibold tracking-wide">{badge.month}</span>
              <span className="text-2xl font-semibold leading-none">{badge.day}</span>
            </>
          ) : (
            // 96x60 inline frame: two stacked lines plus the label and gaps exceed 60px and get
            // clipped, so the inline layout keeps one compact line and still shows the label.
            <span className="text-sm font-semibold tracking-wide">
              {badge.month} {badge.day}
            </span>
          )
        ) : undefined
      }
    />
  );
}

/** One event result with its facts and the Ask and Details actions. */
export function EventBrowseCard({
  event,
  composition = "nova",
  mediaLayout = "cover",
  selectedForAsk,
  onAskSelect,
  onDetails,
  detailsOpen = false,
  pinId,
}: EventBrowseCardProps) {
  const detailsHref = `/events/${event.slug}`;
  const priceLabel =
    event.pricePerTicket === null
      // A card must not imply tickets exist: the detail page shows "Price TBD" for the same event.
      ? "Price TBD"
      : event.pricePerTicket === 0
        ? "Free"
        : `From ${formatEventCardPrice(event.pricePerTicket, event.currency)}`;

  return (
    <VenueCardShell
      testId="event-card"
      resultKind="event"
      pinId={pinId}
      selected={selectedForAsk}
      composition={composition}
      mediaLayout={mediaLayout}
      ariaLabel={`Event: ${event.title}${event.neighborhood ? `, ${event.neighborhood}` : ""}`}
      media={
        <EventBrowseCardMedia
          imageUrl={event.imageUrl}
          startsAt={event.startsAt}
          imageAlt={event.title}
          mediaLayout={mediaLayout}
        />
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1">
          {/* One secondary toggle: selecting an event also highlights its marker and sets the Ask MDE context. */}
          {onAskSelect ? <Button type="button" size="sm" variant="ghost"
            className="-ml-2 h-card-action min-w-card-action text-muted-foreground"
            data-testid="event-ask-select" aria-pressed={Boolean(selectedForAsk)} onClick={onAskSelect}>
            {selectedForAsk ? "Clear selection" : "Ask about this"}
          </Button> : <span />}
          <div className="ml-auto flex items-center gap-2">
            {/* Details is the primary action unless a real ticket offer exists; then Buy is.
                On a browse page it opens the in-page panel; elsewhere it is a real link. */}
            {onDetails ? (
              <Button
                type="button"
                size="sm"
                variant={event.canBuyTickets ? "outline" : "default"}
                className="h-card-action min-w-card-action px-3"
                data-testid="event-details-cta"
                data-details-action="open"
                aria-expanded={detailsOpen}
                onClick={(clickEvent) => onDetails(clickEvent.currentTarget)}
              >
                Details
              </Button>
            ) : (
            <Link
              href={detailsHref}
              data-testid="event-details-cta"
              data-details-action="link"
              className={cn(
                buttonVariants({ size: "sm", variant: event.canBuyTickets ? "outline" : "default" }),
                "h-card-action min-w-card-action px-3",
              )}
            >
              Details
            </Link>
            )}
            {!event.canBuyTickets ? null : event.ticketUrl.startsWith("http") ? (
              <Link
                href={event.ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="event-buy-cta"
                className={cn(
                  buttonVariants({ size: "sm", variant: "default" }),
                  "h-card-action min-w-card-action px-3",
                )}
              >
                <Ticket data-icon="inline-start" aria-hidden />
                Buy tickets
              </Link>
            ) : (
              <Button
                size="sm"
                variant="default"
                className="h-card-action min-w-card-action px-3"
                nativeButton={false}
                render={<Link href={detailsHref} data-testid="event-buy-cta" />}
              >
                <Ticket data-icon="inline-start" aria-hidden />
                Buy tickets
              </Button>
            )}
          </div>
        </div>
      }
    >
      <p className="text-xs font-semibold text-primary">{formatEventStartsAt(event.startsAt)}</p>
      <h3 className="mt-0.5 font-semibold leading-snug">{event.title}</h3>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
        {event.venue}
        {event.neighborhood && !event.venue.includes(event.neighborhood) ? ` · ${event.neighborhood}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold" data-testid="event-price-label">{priceLabel}</span>
        <Badge variant="secondary">{CATEGORY_LABELS[event.category]}</Badge>
      </div>
    </VenueCardShell>
  );
}
