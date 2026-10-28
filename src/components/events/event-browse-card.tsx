import Link from "next/link";
import { CalendarDays, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { VenueCardShell } from "@/components/browse/venue-card-shell";
import { VenueCardPlaceholder } from "@/components/browse/venue-card-placeholder";
import { formatEventCardPrice, formatEventStartsAt } from "@/lib/events/format-event";
import type { PublishedEventListItem } from "@/lib/events/list-published-events";
import type { EventCategory } from "@/mastra/tools/search-events";
import { cn } from "@/lib/utils";

type EventBrowseCardProps = {
  event: PublishedEventListItem;
  composition?: "legacy" | "nova";
  mediaLayout?: "inline" | "cover";
  selectedForAsk?: boolean;
  onAskSelect?: () => void;
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

function EventBrowseCardMedia({
  imageUrl,
  imageAlt,
  mediaLayout,
}: {
  imageUrl?: string;
  imageAlt: string;
  mediaLayout: "inline" | "cover";
}) {
  if (imageUrl) {
    const frameClass = cn(
      "relative overflow-hidden rounded-xl bg-muted text-xs text-muted-foreground",
      mediaLayout === "cover"
        ? "aspect-[16/10] w-full"
        : "aspect-[16/10] w-24 shrink-0 self-start",
    );

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={imageAlt}
        className={cn(frameClass, "object-cover")}
        loading="lazy"
        data-testid="event-browse-card-photo"
      />
    );
  }

  return (
    <VenueCardPlaceholder
      label="Event"
      icon={<CalendarDays className="size-5" aria-hidden />}
      mediaLayout={mediaLayout}
      testId="event-browse-card-photo-placeholder"
    />
  );
}

export function EventBrowseCard({
  event,
  composition = "nova",
  mediaLayout = "cover",
  selectedForAsk,
  onAskSelect,
  pinId,
}: EventBrowseCardProps) {
  const detailsHref = `/events/${event.slug}`;
  const priceLabel =
    event.pricePerTicket === null
      ? "See tickets"
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
          imageAlt={event.title}
          mediaLayout={mediaLayout}
        />
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1">
          {/* One secondary toggle: selecting an event also highlights its marker and sets the Ask MDE context. */}
          {onAskSelect ? <Button type="button" size="sm" variant="ghost" className="-ml-2 text-muted-foreground"
            data-testid="event-ask-select" aria-pressed={Boolean(selectedForAsk)} onClick={onAskSelect}>
            {selectedForAsk ? "Clear selection" : "Ask about this"}
          </Button> : <span />}
          <div className="ml-auto flex items-center gap-2">
            {/* Details is the primary action unless a real ticket offer exists; then Buy is. */}
            <Link
              href={detailsHref}
              data-testid="event-details-cta"
              className={cn(buttonVariants({ size: "sm", variant: event.canBuyTickets ? "outline" : "default" }))}
            >
              Details
            </Link>
            {!event.canBuyTickets ? null : event.ticketUrl.startsWith("http") ? (
              <Link
                href={event.ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="event-buy-cta"
                className={cn(buttonVariants({ size: "sm", variant: "default" }))}
              >
                <Ticket data-icon="inline-start" aria-hidden />
                Buy tickets
              </Link>
            ) : (
              <Button
                size="sm"
                variant="default"
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
