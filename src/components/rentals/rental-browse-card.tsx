"use client";

import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Bed, Building2, Calendar, ExternalLink, Heart, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { VenueCardShell } from "@/components/browse/venue-card-shell";
import { VenueCardPlaceholder } from "@/components/browse/venue-card-placeholder";
import { formatRentalPrices } from "@/lib/rental-display";
import { rentalToMapPin } from "@/lib/browse/browse-pin-converters";
import { cn } from "@/lib/utils";
import type { Rental } from "@/mastra/tools/search-rentals";

export function bedroomLabel(bedrooms: number, bedroomsUnknown = false): string {
  // The caller flags an unknown source count; a real 0 still means "Studio".
  if (bedroomsUnknown) return "Bedrooms unknown";
  if (bedrooms === 0) return "Studio";
  return `${bedrooms} BR`;
}

const FEATURED_AMENITIES = ["wifi", "workspace", "kitchen", "gym", "pool", "balcony", "parking"];

const AMENITY_LABELS = new Map(Object.entries({
  wifi: "WiFi",
  workspace: "Workspace",
  kitchen: "Kitchen",
  gym: "Gym",
  pool: "Pool",
  balcony: "Balcony",
  parking: "Parking",
  ac: "A/C",
  "air conditioning": "A/C",
  washer: "Washer",
  dryer: "Dryer",
  dishwasher: "Dishwasher",
  "pet-friendly": "Pet OK",
  "pet friendly": "Pet OK",
  rooftop: "Rooftop",
  concierge: "Concierge",
  "long-stay": "Long-stay",
}));

function amenityLabel(raw: string): string {
  const key = raw.toLowerCase().trim();
  return AMENITY_LABELS.get(key) ?? raw.charAt(0).toUpperCase() + raw.slice(1);
}

function topAmenities(amenities: string[] | null, limit = 3): string[] {
  if (!amenities?.length) return [];
  const lower = amenities.map((a) => a.toLowerCase());
  const featured = FEATURED_AMENITIES.filter((f) => lower.includes(f));
  const rest = lower.filter((a) => !FEATURED_AMENITIES.includes(a));
  return [...featured, ...rest].slice(0, limit).map(amenityLabel);
}

/** Source-linked external ads are read-only on MDE: no pricing guarantees, no viewing request. */
export function isExternalAd(rental: Rental): boolean {
  return rental.tags.some((tag) => tag === "dev-preview" || tag === "external-source");
}

/** The advertiser's own listing, only for an external ad whose URL is on the approved domain. */
export function externalSourceUrlFor(rental: Rental): string | null {
  return isExternalAd(rental) && /^https:\/\/(?:www\.)?fincaraiz\.com\.co\//i.test(rental.source_url)
    ? rental.source_url
    : null;
}

type RentalBrowseCardProps = {
  rental: Rental;
  /** SAN-478 / REAL-011 — per-listing id for Playwright (`rental-card-${id}`). */
  testId?: string;
  /** Query string (with leading `?`) appended to the detail link so the renter's filters survive the trip. */
  detailSearch?: string;
  selected?: boolean;
  onSelect?: () => void;
  /** Hover/focus highlights the pin without moving the map camera. */
  onPreview?: () => void;
  /**
   * SAN-478 — opens the shared viewing modal in place.
   *
   * The card must not navigate to a URL for this action. The previous implementation
   * called `window.open("<listing>/schedule-viewing")`, a route that does not exist, so
   * every renter who clicked "Schedule viewing" on a browse card landed on a 404. The
   * detail card and the chat card already open the modal through `useRentalUi()`; this
   * card now follows the same pattern, which also makes the CTA a truthful signal —
   * without a handler there is nothing to open, so no CTA is rendered.
   */
  onSchedule?: () => void;
  /**
   * SAN-1416 — opens this rental's Details in the page (title, photo and the Details button).
   * When absent the card behaves as before: the title links to the detail page or, for an
   * external ad, to the advertiser's listing.
   */
  onDetails?: () => void;
};

function RentalBrowseCardMedia({
  imageUrl,
  title,
  neighborhood,
  nightlyLabel,
}: {
  imageUrl?: string;
  title: string;
  neighborhood: string;
  nightlyLabel: string | null;
}) {
  // A failed Storage request must fall back to the normal placeholder, not a broken image.
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div className="relative">
      {imageUrl && !imageFailed ? (
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={`${title} rental in ${neighborhood}`}
            className="size-full object-cover"
            loading="lazy"
            data-testid="rental-browse-card-photo"
            onError={() => setImageFailed(true)}
          />
        </div>
      ) : (
        <VenueCardPlaceholder
          label="Apartment"
          icon={<Building2 className="size-5" aria-hidden />}  
          mediaLayout="cover"
          testId="rental-browse-card-photo-placeholder"
        />
      )}
      {nightlyLabel ? (
        <span className="absolute bottom-2 right-2 rounded-full bg-background/90 px-2.5 py-0.5 font-mono text-xs font-semibold text-foreground backdrop-blur-sm">
          {nightlyLabel}
        </span>
      ) : null}
    </div>
  );
}

// skipcq: JS-0067 - React component (ES module); not browser global scope
/** Show a real rental card; map controls require coordinates and viewing requires authorization. */
export function RentalBrowseCard({
  rental,
  testId,
  detailSearch,
  selected,
  onSelect,
  onPreview,
  onSchedule,
  onDetails,
}: RentalBrowseCardProps) {
  // Pass the listing's own currency: a COP monthly rent must not be labelled with a USD symbol.
  // A listing that stores a monthly rent leads with that rent. Its nightly figure is only rent ÷ 30,
  // so it must not be shown as a nightly offer: WE Home (COP 14,500,000 a month) read as
  // "COP 483,333/night" over its photo. An advertiser's listing never showed one either.
  // ponytail: a listing with BOTH a stored nightly and monthly price also shows only the monthly on
  // this long-stay page; add a `nightly_is_derived` flag to Rental if short-stay cards come back.
  const { nightlyLabel, monthlyLabel } = formatRentalPrices(
    isExternalAd(rental) || rental.price_monthly != null ? null : rental.nightly_price,
    rental.price_monthly,
    rental.currency,
  );
  const chips = topAmenities(rental.amenities);
  const hasWifi = rental.wifi || rental.amenities?.some((a) => a.toLowerCase().includes("wifi"));
  const pinId = rentalToMapPin(rental)?.id;
  // SAN-1349: the viewing action requires the explicit requestability proof.
  // SAN-478: it also requires somewhere to send the click. A listing with no canonical
  // owner stays browseable but can never expose a viewing CTA, so the UI cannot advertise
  // an action the database will reject — and with no handler there is nothing to open.
  // Fail closed like the Details panel: an advertiser's listing is never requestable on MDE,
  // whatever its flag says.
  const showScheduleCta = !isExternalAd(rental) && rental.can_schedule_viewing === true && Boolean(onSchedule);
  // The useful next action for an unrequestable external candidate is its source advert.
  const externalSourceUrl = externalSourceUrlFor(rental);
  const preview = () => (onPreview ?? onSelect)?.();
  const interactive = Boolean(onSelect && pinId);

  const handleBodyKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.();
    }
  };

  return (
    <VenueCardShell
      testId={testId ?? `rental-card-${rental.id}`}
      resultKind="rental"
      pinId={pinId}
      composition="nova"
      mediaLayout="cover"
      selected={selected}
      ariaLabel={`Rental: ${rental.title}, ${rental.neighborhood}`}
      onPreview={interactive ? preview : undefined}
      bodyRole={interactive ? "button" : undefined}
      bodyTabIndex={interactive ? 0 : undefined}
      bodyAriaLabel={interactive ? `Select ${rental.title} on map` : undefined}
      onBodyClick={interactive ? () => onSelect?.() : undefined}
      onBodyKeyDown={interactive ? handleBodyKeyDown : undefined}
      media={
        onDetails ? (
          <button
            type="button"
            onClick={onDetails}
            data-testid={`rental-card-photo-details-${rental.id}`}
            aria-label={`Details: ${rental.title}`}
            className="block w-full rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <RentalBrowseCardMedia
              imageUrl={rental.image || undefined}
              title={rental.title}
              neighborhood={rental.neighborhood}
              nightlyLabel={nightlyLabel}
            />
          </button>
        ) : (
          <RentalBrowseCardMedia
            imageUrl={rental.image || undefined}
            title={rental.title}
            neighborhood={rental.neighborhood}
            nightlyLabel={nightlyLabel}
          />
        )
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {onDetails ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid={`rental-details-cta-${rental.id}`}
              onClick={(event) => {
                event.stopPropagation();
                onDetails();
              }}
            >
              Details
            </Button>
          ) : null}
          {showScheduleCta ? (
            <Button
              type="button"
              size="sm"
              variant="default"
              data-testid="rental-schedule-cta"
              className={cn(buttonVariants({ size: "sm", variant: "default" }))}
              onClick={(e) => {
                e.stopPropagation();
                onSchedule?.();
              }}
            >
              <Calendar data-icon="inline-start" aria-hidden />
              Schedule viewing
            </Button>
          ) : null}
          {externalSourceUrl ? (
            <a
              href={externalSourceUrl}
              target="_blank"
              rel="nofollow noopener noreferrer"
              data-testid={`rental-card-source-${rental.id}`}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
              onClick={(event) => event.stopPropagation()}
            >
              <ExternalLink data-icon="inline-start" aria-hidden />
              View original listing
            </a>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            data-testid="rental-save-cta"
            disabled
            title="Save for later (coming soon)"
          >
            <Heart data-icon="inline-start" aria-hidden />
            Save
          </Button>
        </div>
      }
    >
      <p className="text-[11px] font-medium text-muted-foreground">{rental.neighborhood}</p>
      <h3 className="mt-0.5 font-medium leading-snug">
        {onDetails ? (
          <button
            type="button"
            data-testid={`rental-card-link-${rental.id}`}
            className="text-left hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              onDetails();
            }}
          >
            {rental.title}
          </button>
        ) : externalSourceUrl ? (
          <a
            href={externalSourceUrl}
            target="_blank"
            rel="nofollow noopener noreferrer"
            data-testid={`rental-card-link-${rental.id}`}
            className="hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {rental.title}
          </a>
        ) : (
          <Link
            href={`/rentals/${rental.id}${detailSearch ?? ""}`}
            data-testid={`rental-card-link-${rental.id}`}
            className="hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {rental.title}
          </Link>
        )}
      </h3>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="gap-1 font-normal">
          <Bed className="size-3" aria-hidden />
          {bedroomLabel(rental.bedrooms, rental.bedrooms_unknown)}
        </Badge>
        {hasWifi ? (
          <Badge variant="outline" className="gap-1 font-normal">
            <Wifi className="size-3" aria-hidden />
            WiFi
          </Badge>
        ) : null}
        {rental.tags.includes("self-attested") ? (
          <Badge
            variant="outline"
            className="font-normal"
            data-testid="rental-self-attested-label"
          >
            Not independently verified
          </Badge>
        ) : null}
        {chips.map((chip) =>
          chip.toLowerCase() !== "wifi" ? (
            <Badge key={chip} variant="outline" className="font-normal">
              {chip}
            </Badge>
          ) : null,
        )}
      </div>

      {monthlyLabel ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{monthlyLabel}</p>
      ) : null}

      {rental.availability ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">{rental.availability}</p>
      ) : null}
    </VenueCardShell>
  );
}
