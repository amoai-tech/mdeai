"use client";

import { useEffect, useState } from "react";
import { isRenderableRemoteImage } from "@/lib/images/remote-image-hosts";
import { reportRentalPhotoFailure } from "@/lib/rentals/rental-photo-telemetry";
import Link from "next/link";
import { Bed, Building2, Calendar, ExternalLink, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { VenueCardShell } from "@/components/browse/venue-card-shell";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { VenueCardPlaceholder } from "@/components/browse/venue-card-placeholder";
import { buildMatchReason, formatRentalPrices } from "@/lib/rental-display";
import type { RentalSearchApiParams } from "@/lib/rental-query-parser";
import { approvedExternalSourceUrl } from "@/lib/rentals/external-source";
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

/**
 * The advertiser's own listing, only for an external ad whose URL is on the approved host
 * allowlist. A blocklist of MDE's own domains would accept any other HTTPS URL, so a bad record
 * could redirect a renter off-site to a phishing page through MDE's UI.
 */
export function externalSourceUrlFor(rental: Rental): string | null {
  if (!isExternalAd(rental)) return null;
  return approvedExternalSourceUrl(rental.source_url);
}

type RentalBrowseCardProps = {
  rental: Rental;
  /** Stable result-set identity. Changes on a new search, not unrelated parent rerenders. */
  resultSet?: readonly Rental[];
  /** Grounded, optional customer query; never a search-score/debug field. */
  matchParams?: RentalSearchApiParams;
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
  selectedForAsk?: boolean;
  onAskSelect?: () => void;
  /** A later row with the same title/area/size/price as an earlier one; labels it instead of hiding it. */
  duplicateNote?: string;
  /** Compact /chat-style browse feed, or existing cover layout. */
  mediaLayout?: "inline" | "cover";
};

function RentalBrowseCardMedia({
  imageUrl,
  title,
  neighborhood,
  nightlyLabel,
  currency,
  mediaLayout,
  onPhotoError,
  omittedPhotos = false,
}: {
  imageUrl?: string;
  title: string;
  neighborhood: string;
  nightlyLabel: string | null;
  currency?: string;
  mediaLayout: "inline" | "cover";
  onPhotoError: (url: string) => void;
  omittedPhotos?: boolean;
}) {
  return (
    <div className="relative">
      {imageUrl ? (
        <div className={cn("relative aspect-[16/10] overflow-hidden rounded-xl bg-muted", mediaLayout === "inline" ? "w-24" : "w-full")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={`${title} rental in ${neighborhood}`}
            className="size-full object-cover"
            loading="lazy"
            data-testid="rental-browse-card-photo"
            onError={() => onPhotoError(imageUrl)}
          />
        </div>
      ) : omittedPhotos ? (
        <div data-testid="rental-card-more-photos" className="flex aspect-[16/10] items-center justify-center rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">
          More listing photos may be available in Details
        </div>
      ) : (
        <VenueCardPlaceholder
          label="Apartment"
          icon={<Building2 className="size-5" aria-hidden />}  
          mediaLayout={mediaLayout}
          testId="rental-browse-card-photo-placeholder"
        />
      )}
      {nightlyLabel && mediaLayout === "cover" ? (
        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-0.5 font-mono text-xs font-semibold text-foreground backdrop-blur-sm">
          {nightlyLabel}
          {currency?.toUpperCase() === "USD" ? (
            <span
              className="rounded bg-foreground/10 px-1 text-[10px] font-normal"
              data-testid="rental-card-nightly-currency"
            >
              USD
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

/**
 * SAN-1695 — photos come only from the authorized rental search result.
 * The primary cover remains first, and the limited search gallery never
 * pretends to contain all photos when Details has more.
 */
function rentalBrowsePhotos(rental: Rental): string[] {
  // Browser image requests must never target arbitrary listing-supplied hosts.
  // This is the same approved-host rule used by next/image, not a second allowlist.
  return [...new Set([rental.image, ...(rental.images ?? [])].filter(
    (url): url is string => typeof url === "string" && isRenderableRemoteImage(url),
  ))].slice(0, 12);
}

function RentalBrowseCardGallery({
  rental,
  photos,
  onDetails,
  nightlyLabel,
  onPhotoError,
}: {
  rental: Rental;
  photos: string[];
  onDetails?: () => void;
  nightlyLabel: string | null;
  onPhotoError: (url: string) => void;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!api) return;
    const update = () => setCurrentIndex(api.selectedScrollSnap());
    update();
    api.on("select", update);
    api.on("reInit", update);
    return () => {
      api.off("select", update);
      api.off("reInit", update);
    };
  }, [api, photos.length]);

  return (
    <Carousel setApi={setApi} className="w-full" aria-label={`Photos of ${rental.title}`}>
      <CarouselContent className="ml-0">
        {photos.map((url, index) => (
          <CarouselItem key={url} className="pl-0">
            <div className="aspect-[16/10] overflow-hidden rounded-xl bg-muted">
                {onDetails ? (
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); onDetails(); }}
                    data-testid={index === 0
                      ? `rental-card-photo-details-${rental.id}`
                      : `rental-card-photo-details-${rental.id}-${index}`}
                    aria-label={`Details: ${rental.title} (photo ${index + 1})`}
                    className="block size-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`${rental.title}, photo ${index + 1} in ${rental.neighborhood}`}
                      loading="lazy" className="size-full object-cover" data-testid="rental-browse-card-photo"
                      onError={() => onPhotoError(url)} />
                  </button>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={url} alt={`${rental.title}, photo ${index + 1} in ${rental.neighborhood}`}
                    loading="lazy" className="size-full object-cover" data-testid="rental-browse-card-photo"
                    onError={() => onPhotoError(url)} />
                )}
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="left-2 size-11 bg-background/90" aria-label={`Previous photo of ${rental.title}`} />
      <CarouselNext className="right-2 size-11 bg-background/90" aria-label={`Next photo of ${rental.title}`} />
      <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground"
        data-testid={`rental-photo-counter-${rental.id}`}>
        {Math.min(currentIndex + 1, photos.length)} of {photos.length} photos{(rental.photo_count ?? 0) > photos.length ? " shown" : ""}
      </span>
      {nightlyLabel ? (
        <span className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-0.5 font-mono text-xs font-semibold text-foreground backdrop-blur-sm">
          {nightlyLabel}
          {rental.currency?.toUpperCase() === "USD" ? (
            <span className="rounded bg-foreground/10 px-1 text-[10px] font-normal" data-testid="rental-card-nightly-currency">
              USD
            </span>
          ) : null}
        </span>
      ) : null}
    </Carousel>
  );
}

// skipcq: JS-0067 - React component (ES module); not browser global scope
/** Show a real rental card; map controls require coordinates and viewing requires authorization. */
export function RentalBrowseCard({
  rental,
  resultSet,
  matchParams,
  testId,
  detailSearch,
  selected,
  onSelect,
  onPreview,
  onSchedule,
  onDetails,
  selectedForAsk,
  onAskSelect,
  duplicateNote,
  mediaLayout = "cover",
}: RentalBrowseCardProps) {
  // Pass the listing's own currency: a COP monthly rent must not be labelled with a USD symbol.
  // A listing that stores a monthly rent leads with that rent. Its nightly figure is only rent ÷ 30,
  // so it must not be shown as a nightly offer: WE Home (COP 14,500,000 a month) read as
  // "COP 483,333/night" over its photo. An advertiser's listing never showed one either.
  // ponytail: a listing with BOTH a stored nightly and monthly price also shows only the monthly on
  // this long-stay page; add a `nightly_is_derived` flag to Rental if short-stay cards come back.
  const { nightlyLabel, monthlyLabel } = formatRentalPrices(
    isExternalAd(rental) || rental.price_monthly != null || rental.nightly_price <= 0 ? null : rental.nightly_price,
    rental.price_monthly,
    rental.currency,
  );
  const chips = topAmenities(rental.amenities);
  // The parent keeps one stable array for each search. A new result set retries
  // failed photos, even when the same listing ID and URLs return. A parent rerender
  // that recreates a Rental object must NOT trigger an image-error retry loop.
  const photoResultSet = resultSet ?? rental;
  const [failedPhotos, setFailedPhotos] = useState<{ resultSet: readonly Rental[] | Rental; urls: string[] }>(
    () => ({ resultSet: photoResultSet, urls: [] }),
  );
  const failedPhotoUrls = failedPhotos.resultSet === photoResultSet ? failedPhotos.urls : [];
  const photos = rentalBrowsePhotos(rental).filter((url) => !failedPhotoUrls.includes(url));
  const omittedPhotos = (rental.photo_count ?? 0) > (rental.images?.length ?? (rental.image ? 1 : 0));
  const showPhotoGallery = mediaLayout === "cover" && photos.length > 1;
  const handlePhotoError = (url: string) => {
    reportRentalPhotoFailure(url);
    setFailedPhotos((previous) => {
      const urls = previous.resultSet === photoResultSet ? previous.urls : [];
      return urls.includes(url) ? previous : { resultSet: photoResultSet, urls: [...urls, url] };
    });
  };
  const matchReason = buildMatchReason(rental, matchParams);
  const hasWifi = rental.wifi || rental.amenities?.some((a) => a.toLowerCase().includes("wifi"));
  const pinId = rentalToMapPin(rental)?.id;
  // SAN-1349: the viewing action requires the explicit requestability proof.
  // SAN-478: it also requires somewhere to send the click. A listing with no canonical
  // owner stays browseable but can never expose a viewing CTA, so the UI cannot advertise
  // an action the database will reject — and with no handler there is nothing to open.
  // Fail closed like the Details panel: an advertiser's listing is never requestable on MDE,
  // whatever its flag says.
  const showScheduleCta = rental.can_schedule_viewing === true && Boolean(onSchedule);
  // The useful next action for an unrequestable external candidate is its source advert.
  const externalSourceUrl = externalSourceUrlFor(rental);
  const preview = () => (onPreview ?? onSelect)?.();
  const interactive = Boolean(onSelect && pinId);

  return (
    <VenueCardShell
      testId={testId ?? `rental-card-${rental.id}`}
      extraData={{ "data-listing-id": rental.id }}
      resultKind="rental"
      pinId={pinId}
      composition="nova"
      mediaLayout={mediaLayout}
      selected={selected}
      ariaLabel={`Rental: ${rental.title}, ${rental.neighborhood}`}
      onPreview={interactive ? preview : undefined}
      media={
        showPhotoGallery ? (
          <RentalBrowseCardGallery
            rental={rental}
            photos={photos}
            onDetails={onDetails}
            nightlyLabel={nightlyLabel}
            onPhotoError={handlePhotoError}
          />
        ) : onDetails ? (
          <button
            type="button"
            onClick={onDetails}
            data-testid={`rental-card-photo-details-${rental.id}`}
            aria-label={`Details: ${rental.title}`}
            className={cn("block rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", mediaLayout === "inline" ? "w-24 shrink-0 self-start" : "w-full")}
          >
            <RentalBrowseCardMedia
              imageUrl={photos[0]}
              onPhotoError={handlePhotoError}
              omittedPhotos={omittedPhotos}
              title={rental.title}
              neighborhood={rental.neighborhood}
              nightlyLabel={nightlyLabel}
              currency={rental.currency}
              mediaLayout={mediaLayout}
            />
          </button>
        ) : (
          <RentalBrowseCardMedia
            imageUrl={photos[0]}
            onPhotoError={handlePhotoError}
            omittedPhotos={omittedPhotos}
            title={rental.title}
            neighborhood={rental.neighborhood}
            nightlyLabel={nightlyLabel}
            currency={rental.currency}
            mediaLayout={mediaLayout}
          />
        )
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {interactive ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid={`rental-card-map-select-${rental.id}`}
              aria-label={`Show ${rental.title} on the map`}
              className="min-h-card-action lg:min-h-0"
              onClick={() => onSelect?.()}
              onFocus={preview}
            >
              Show on map
            </Button>
          ) : null}
          {onAskSelect ? <Button type="button" size="sm" variant={selectedForAsk ? "secondary" : "outline"}
            className="min-h-card-action lg:min-h-0"
            aria-pressed={Boolean(selectedForAsk)} data-testid="rental-ask-select" onClick={onAskSelect}>
            {selectedForAsk ? "Clear selection" : "Ask about this"}
          </Button> : null}
          {onDetails ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="min-h-card-action lg:min-h-0"
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
              className={cn(buttonVariants({ size: "sm", variant: "default" }), "min-h-card-action lg:min-h-0")}
              onClick={(e) => {
                e.stopPropagation();
                onSchedule?.();
              }}
            >
              <Calendar data-icon="inline-start" aria-hidden />
              {isExternalAd(rental) ? 'Request MDE follow-up' : 'Schedule viewing'}
            </Button>
          ) : null}
          {isExternalAd(rental) && rental.source_provider ? (
            <span
              data-testid={`rental-card-source-label-${rental.id}`}
              className="self-center text-[11px] text-muted-foreground"
            >
              Source: {rental.source_provider}
            </span>
          ) : null}
          {externalSourceUrl ? (
            <a
              href={externalSourceUrl}
              target="_blank"
              rel="nofollow noopener noreferrer"
              data-testid={`rental-card-source-${rental.id}`}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }), "min-h-card-action lg:min-h-0")}
              onClick={(event) => event.stopPropagation()}
            >
              <ExternalLink data-icon="inline-start" aria-hidden />
              View original listing
            </a>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-[11px] font-medium text-muted-foreground">{rental.neighborhood}</p>
        {duplicateNote ? (
          <Badge
            variant="outline"
            className="font-normal text-[10px]"
            data-testid={`rental-card-duplicate-${rental.id}`}
            title={duplicateNote}
          >
            {duplicateNote}
          </Badge>
        ) : null}
      </div>
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
        <Badge variant="outline" className="font-normal" data-testid={`rental-furnishing-${rental.id}`}>
          {rental.furnished === true ? "Furnished listed" :
            rental.furnished === false ? "Unfurnished listed" : "Furnishing not specified"}
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

      {mediaLayout === "inline" && nightlyLabel ? (
        // Inline cards have no photo overlay, so the stored nightly price is shown here. Checked
        // before `monthlyLabel`: that label is always set when a nightly price exists (derived,
        // marked "~"), which made this branch unreachable and showed "~$2,340/mo" for $78/night.
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium">{nightlyLabel}</p>
          {rental.currency?.toUpperCase() === "USD" ? (
            <Badge variant="outline" className="font-normal text-[10px]" data-testid="rental-card-currency">
              USD
            </Badge>
          ) : null}
        </div>
      ) : monthlyLabel ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <p className={cn(mediaLayout === "cover" ? "text-base font-semibold text-foreground" : "text-xs text-muted-foreground")}>{monthlyLabel}</p>
          {rental.currency?.toUpperCase() === "USD" ? (
            <Badge variant="outline" className="font-normal text-[10px]" data-testid="rental-card-currency">
              USD
            </Badge>
          ) : null}
        </div>
      ) : !nightlyLabel ? (
        <p className="mt-1.5 text-xs text-muted-foreground">Price not provided</p>
      ) : null}

      {matchReason ? (
        <p className="mt-1.5 min-w-0 break-words text-xs leading-relaxed text-muted-foreground" data-testid="rental-match-reason">
          <span className="font-medium text-foreground">Why it may fit:</span>{" "}{matchReason}
        </p>
      ) : null}

      {rental.availability ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">{rental.availability}</p>
      ) : null}
    </VenueCardShell>
  );
}
