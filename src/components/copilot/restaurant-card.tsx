"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VenueCardShell } from "@/components/browse/venue-card-shell";
import { VenueCardPlaceholder } from "@/components/browse/venue-card-placeholder";
import { formatGroundedRating } from "@/lib/places-display";
import { mapsDeepLinksEnabled } from "@/lib/maps-deep-links";
import { cn } from "@/lib/utils";
import {
  CalendarCheck,
  ExternalLink,
  Info,
  MapPin,
  PartyPopper,
  UtensilsCrossed,
} from "lucide-react";
import type { CardInteractionProps, ResultKind } from "@/components/cards/card-interaction-props";

export type RestaurantCardProps = {
  title: string;
  neighborhood?: string;
  cuisine?: string;
  priceTier?: string;
  avgPricePerPerson?: number;
  rating?: number;
  imageUrl?: string;
  mapsUrl?: string | null;
  aiSummary?: string | null;
  testId?: string;
  /** D-09 nova Card shell — default for restaurant vertical. */
  composition?: "legacy" | "nova";
  /** Browse grid: full-width 16:10 hero. Chat: inline thumb. */
  mediaLayout?: "inline" | "cover";
} & CardInteractionProps & {
  resultKind?: ResultKind;
  /** True when SAN-492 offerings exist for this place (SAN-494). */
  hostsEvents?: boolean;
  onOpenEventVenue?: () => void;
  onBookRequest?: () => void;
  bookingTestId?: string;
  /**
   * Browse grid only: this restaurant is the current Ask MDE selection (SAN-1140).
   * Selection is context, not a send — nothing runs until the visitor submits a question.
   */
  selectedForAsk?: boolean;
  /** Browse grid only: toggle this restaurant as the Ask MDE selection. */
  onAskSelect?: () => void;
  /**
   * Browse grid only (SAN-1638): open Details in the page's existing right panel instead of
   * navigating. The full /restaurants/[id] page stays reachable from the panel itself.
   * The triggering control is passed back so closing can restore focus to it.
   */
  onDetails?: (trigger: HTMLElement) => void;
  /**
   * Browse grid only: the real public details route for this restaurant. The footer
   * renders it as a link, never a dead button. Chat uses `onOpenDetails` instead;
   * passing both would show two Details controls, so callers pass exactly one.
   */
  detailsHref?: string;
  /** Browse grid only: test id for the Details action (link or button). */
  detailsTestId?: string;
  /** Browse grid only: this card's Details panel is currently open (announced to AT). */
  detailsOpen?: boolean;
};

/** Display label for a cuisine code, or null when it is unknown. */
function cuisineLabel(cuisine?: string): string | null {
  if (!cuisine) return null;
  return cuisine
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Directions link for a restaurant with a real maps URL. */
function RestaurantMapLinks({ mapsUrl }: { mapsUrl?: string | null }) {
  if (!mapsUrl) return null;
  const deepLinks = mapsDeepLinksEnabled();

  if (!deepLinks) {
    return (
      <Button
        variant="link"
        size="sm"
        className="h-card-action px-3 text-xs"
        nativeButton={false}
        render={
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            translate="no"
            data-testid="restaurant-card-maps-link"
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        <ExternalLink data-icon="inline-start" aria-hidden />
        Google Maps
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-card-action px-3 text-xs"
      nativeButton={false}
      render={
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          translate="no"
          data-testid="restaurant-card-directions-link"
          onClick={(e) => e.stopPropagation()}
        />
      }
    >
      <MapPin data-icon="inline-start" aria-hidden />
      Directions
    </Button>
  );
}

/** Card media: the real photo, or the placeholder when none is usable. */
function RestaurantCardMedia({
  imageUrl,
  mediaLayout,
}: {
  imageUrl?: string;
  mediaLayout: "inline" | "cover";
}) {
  const frameClass = cn(
    "relative overflow-hidden rounded-xl bg-muted",
    mediaLayout === "cover"
      ? "aspect-[16/10] w-full"
      : "aspect-[16/10] w-24 shrink-0 self-start",
  );

  if (imageUrl) {
    return (
      <div className={frameClass} data-testid="restaurant-card-photo">
        {/* eslint-disable-next-line @next/next/no-img-element -- listing hero URLs from search */}
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <VenueCardPlaceholder
      label="Restaurant"
      icon={<UtensilsCrossed className="size-5" aria-hidden />}
      mediaLayout={mediaLayout}
      testId="restaurant-card-photo-placeholder"
    />
  );
}

/** One restaurant result with its facts and the Ask and Details actions. */
export function RestaurantCard({
  title,
  neighborhood,
  cuisine,
  priceTier,
  avgPricePerPerson,
  rating,
  imageUrl,
  mapsUrl,
  aiSummary,
  testId = "restaurant-card",
  composition = "legacy",
  mediaLayout = "inline",
  pinId,
  selected,
  onSelect,
  onOpenDetails,
  hostsEvents = false,
  onOpenEventVenue,
  onBookRequest,
  bookingTestId = "restaurant-booking-cta",
  selectedForAsk,
  onAskSelect,
  onDetails,
  detailsHref,
  detailsTestId,
  detailsOpen = false,
}: RestaurantCardProps) {
  const ratingText = formatGroundedRating(rating);
  const typeLabel = cuisineLabel(cuisine) ?? "Restaurant";
  const priceLabel =
    avgPricePerPerson != null
      ? `$${avgPricePerPerson}/person`
      : priceTier
        ? priceTier
        : null;
  const blurb = aiSummary?.trim() || neighborhood?.trim() || null;

  // Selection is a click/activation concern. Hover and focus must not select: a pointer preview
  // would toggle an already-selected card off, and a click right after preview would clear it.
  const select = () => onSelect?.();
  const openDetails = () => {
    select();
    onOpenDetails?.();
  };

  const media = (
    <RestaurantCardMedia imageUrl={imageUrl} mediaLayout={mediaLayout} />
  );

  const summaryText =
    blurb && blurb !== neighborhood ? blurb : null;
  const showFooter =
    Boolean(mapsUrl) ||
    Boolean(onOpenDetails) ||
    Boolean(onOpenEventVenue) ||
    Boolean(onBookRequest) ||
    Boolean(detailsHref) ||
    Boolean(onDetails) ||
    Boolean(onAskSelect);

  const footerContent = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* One action contract on every discovery card, in this order:
            Directions · View on map · Ask about this · Details. */}
        <RestaurantMapLinks mapsUrl={mapsUrl} />
        {pinId && onSelect ? (
          <Button
            type="button"
            size="sm"
            variant={selected ? "secondary" : "outline"}
            className="h-card-action min-w-card-action px-3"
            aria-pressed={Boolean(selected)}
            data-testid="restaurant-map-select"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            <MapPin data-icon="inline-start" aria-hidden />
            {selected ? "Selected on map" : "View on map"}
          </Button>
        ) : null}
        {onOpenEventVenue ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-card-action min-w-card-action px-3"
            data-testid="event-venue-cta"
            onClick={(e) => {
              e.stopPropagation();
              onOpenEventVenue();
            }}
          >
            <PartyPopper data-icon="inline-start" aria-hidden />
            Event Venue
          </Button>
        ) : null}
        {onAskSelect ? (
          <Button
            type="button"
            size="sm"
            variant={selectedForAsk ? "secondary" : "outline"}
            className="h-card-action min-w-card-action px-3"
            data-testid="restaurant-ask-select"
            aria-pressed={Boolean(selectedForAsk)}
            onClick={(e) => {
              e.stopPropagation();
              onAskSelect();
            }}
          >
            {selectedForAsk ? "Clear selection" : "Ask about this"}
          </Button>
        ) : null}
        {onOpenDetails ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="restaurant-details-cta"
            onClick={(e) => {
              e.stopPropagation();
              openDetails();
            }}
          >
            <Info data-icon="inline-start" aria-hidden />
            Details
          </Button>
        ) : null}
        {onDetails ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-card-action min-w-card-action px-3"
            data-testid={detailsTestId ?? "restaurant-details-open"}
            aria-expanded={detailsOpen}
            onClick={(e) => {
              e.stopPropagation();
              onDetails(e.currentTarget);
            }}
          >
            <Info data-icon="inline-start" aria-hidden />
            Details
          </Button>
        ) : detailsHref ? (
          <Link
            href={detailsHref}
            data-testid={detailsTestId}
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "h-card-action min-w-card-action px-3",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <Info data-icon="inline-start" aria-hidden />
            Details
          </Link>
        ) : null}
        {onBookRequest ? (
          <Button
            type="button"
            size="sm"
            className="h-card-action min-w-card-action px-3"
            data-testid={bookingTestId}
            onClick={(e) => {
              e.stopPropagation();
              select();
              onBookRequest();
            }}
          >
            <CalendarCheck className="size-3.5" aria-hidden />
            Request
          </Button>
        ) : null}
      </div>
    </>
  );

  return (
    <VenueCardShell
      testId={testId}
      resultKind="restaurant"
      pinId={pinId}
      selected={selected}
      composition={composition}
      mediaLayout={mediaLayout}
      ariaLabel={`Restaurant: ${title}${neighborhood ? `, ${neighborhood}` : ""}`}
      // Pointer hover no longer selects, so the body itself stays the keyboard path: Enter/Space
      // opens details when they exist, and otherwise selects this card on the map exactly once.
      bodyRole={onOpenDetails || onSelect ? "button" : undefined}
      bodyTabIndex={onOpenDetails || onSelect ? 0 : undefined}
      bodyAriaLabel={
        onOpenDetails
          ? `Open details for ${title}`
          : onSelect
            ? `Select ${title} on the map`
            : undefined
      }
      onBodyClick={onOpenDetails ? openDetails : select}
      onBodyKeyDown={
        onOpenDetails || onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (onOpenDetails) openDetails();
                else select();
              }
            }
          : undefined
      }
      media={media}
      footer={
        showFooter
          ? composition === "legacy"
            ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
                  {footerContent}
                </div>
              )
            : footerContent
          : undefined
      }
    >
      <div
        className={
          composition === "nova"
            ? "flex min-h-0 flex-1 flex-col"
            : undefined
        }
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {composition === "nova" ? (
              <p className={cn("text-[11px] font-medium text-muted-foreground", mediaLayout === "cover" && "min-h-[15px]")}>
                {neighborhood ?? "\u00A0"}
              </p>
            ) : neighborhood ? (
              <p className="text-[11px] font-medium text-muted-foreground">
                {neighborhood}
              </p>
            ) : null}
            <h3
              className={cn(
                "font-medium leading-snug",
                composition === "nova" && mediaLayout === "cover" && "line-clamp-2 min-h-[2.5rem]",
              )}
            >
              {title}
            </h3>
          </div>
          {ratingText ? (
            <p
              className="shrink-0 text-xs font-medium text-foreground"
              data-testid="restaurant-card-rating"
            >
              ★ {ratingText}
            </p>
          ) : composition === "nova" ? (
            <span className="min-w-8 shrink-0" aria-hidden />
          ) : null}
        </div>

        <div
          className={cn(
            "mt-1.5 flex flex-wrap gap-1.5",
            composition === "nova" && mediaLayout === "cover" && "min-h-6",
          )}
        >
          <Badge variant="secondary">{typeLabel}</Badge>
          {hostsEvents ? (
            <Badge
              variant="outline"
              data-testid="restaurant-hosts-events-badge"
            >
              Hosts Events
            </Badge>
          ) : null}
          {priceLabel ? <Badge variant="outline">{priceLabel}</Badge> : null}
        </div>

        {composition === "nova" ? (
          <p className={cn("mt-2 line-clamp-2 flex-1 text-xs leading-5 text-muted-foreground", mediaLayout === "cover" && "min-h-10")}>
            {summaryText ?? "\u00A0"}
          </p>
        ) : summaryText ? (
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {summaryText}
          </p>
        ) : null}
      </div>
    </VenueCardShell>
  );
}
