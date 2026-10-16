"use client";

import Link from "next/link";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { Building2, Calendar, ExternalLink, MapPin, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { GalleryImage } from "@/components/rentals/gallery-image";
import { bedroomLabel, externalSourceUrlFor, isExternalAd } from "@/components/rentals/rental-browse-card";
import { formatRentalPrices } from "@/lib/rental-display";
import type { Rental } from "@/mastra/tools/search-rentals";

/**
 * SAN-1416 — read-only Details for a rental that is already on the page.
 *
 * It renders only what the search result carries: nothing is fetched and no value is invented.
 * Unknown stays unknown, a listing without coordinates gets no map link, and the viewing
 * request is offered only when the server marked the listing requestable
 * (`can_schedule_viewing`), exactly as the card does.
 */

type DetailsProps = {
  rental: Rental;
  onClose: () => void;
  /** Present only where a viewing can be requested; still gated on `can_schedule_viewing`. */
  onSchedule?: () => void;
};

/** Photos for the carousel: the approved list when present, else the single card photo. */
function photosOf(rental: Rental): string[] {
  if (rental.images && rental.images.length > 0) return rental.images;
  return rental.image ? [rental.image] : [];
}

function PhotoCarousel({ rental }: { rental: Rental }) {
  const photos = photosOf(rental);
  if (photos.length === 0) {
    return (
      <div
        data-testid="rental-details-no-photos"
        className="flex aspect-[16/10] w-full items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground"
      >
        <Building2 className="mr-2 size-5" aria-hidden /> No photos available
      </div>
    );
  }
  return (
    <Carousel opts={{ loop: false, align: "start" }} data-testid="rental-details-gallery">
      <CarouselContent>
        {photos.map((src, index) => (
          <CarouselItem key={src}>
            <GalleryImage
              src={src}
              alt={`${rental.title} photo ${index + 1} of ${photos.length}`}
              testId={`rental-details-photo-${index + 1}`}
              className="aspect-[16/10] w-full rounded-xl bg-muted object-cover"
              loading={index === 0 ? "eager" : "lazy"}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      {photos.length > 1 ? (
        <>
          <CarouselPrevious className="left-2" />
          <CarouselNext className="right-2" />
        </>
      ) : null}
    </Carousel>
  );
}

/** Facts, price, location and the allowed actions. The close control is supplied by the host. */
function DetailsBody({ rental, onSchedule }: Pick<DetailsProps, "rental" | "onSchedule">) {
  const external = isExternalAd(rental);
  const { nightlyLabel, monthlyLabel } = formatRentalPrices(
    external ? null : rental.nightly_price,
    rental.price_monthly,
    rental.currency,
  );
  const price = monthlyLabel ?? nightlyLabel;
  const sourceUrl = externalSourceUrlFor(rental);
  const hasCoordinates = rental.latitude != null && rental.longitude != null;
  // Fail closed: an external ad is never requestable on MDE, whatever its flag says.
  const showSchedule = !external && rental.can_schedule_viewing === true && Boolean(onSchedule);

  return (
    <div className="space-y-4">
      <PhotoCarousel rental={rental} />
      {rental.photo_count != null && rental.photo_count > photosOf(rental).length ? (
        <Link
          href={`/rentals/${rental.id}`}
          data-testid="rental-details-all-photos-link"
          className="block text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Showing {photosOf(rental).length} of {rental.photo_count} photos — see all photos
        </Link>
      ) : null}

      <div>
        <p className="font-mono text-xl font-semibold" data-testid="rental-details-price">
          {price ?? <span className="text-muted-foreground">Price data pending</span>}
        </p>
        {rental.availability ? (
          <p className="mt-1 text-xs text-muted-foreground" data-testid="rental-details-availability">
            {rental.availability}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="font-normal" data-testid="rental-details-bedrooms">
          {bedroomLabel(rental.bedrooms, rental.bedrooms_unknown)}
        </Badge>
        {/* SAN-1449: same disclosure the card shows; a self-attested listing is not reviewed by MDE. */}
        {rental.tags.includes("self-attested") ? (
          <Badge variant="outline" className="font-normal" data-testid="rental-details-self-attested-label">
            Not independently verified
          </Badge>
        ) : null}
      </div>

      <section aria-label="Amenities">
        <h3 className="mb-1.5 font-serif text-sm font-semibold">Amenities</h3>
        {rental.amenities.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" data-testid="rental-details-amenities">
            {rental.amenities.map((amenity) => (
              <Badge key={amenity} variant="outline" className="font-normal">
                {amenity}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Amenities not listed.</p>
        )}
      </section>

      <section aria-label="Location">
        <h3 className="mb-1 font-serif text-sm font-semibold">Location</h3>
        <p className="text-sm text-muted-foreground">{rental.neighborhood || "Neighborhood not listed"}</p>
        {hasCoordinates ? (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${rental.latitude},${rental.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="rental-details-map-link"
            className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <MapPin className="size-3.5" aria-hidden /> View on map
          </a>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground" data-testid="rental-details-no-location">
            Exact location not available, so this listing has no map pin.
          </p>
        )}
      </section>

      {external ? (
        <p
          className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
          data-testid="rental-details-external-note"
        >
          Listed by the original advertiser. MDE has not verified this listing and cannot schedule a
          viewing for it.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {showSchedule ? (
          <Button type="button" onClick={onSchedule} data-testid="rental-details-schedule-cta">
            <Calendar data-icon="inline-start" aria-hidden />
            Schedule viewing
          </Button>
        ) : null}
        {sourceUrl ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <a
                href={sourceUrl}
                target="_blank"
                rel="nofollow noopener noreferrer"
                data-testid="rental-details-source-link"
              />
            }
          >
            <ExternalLink data-icon="inline-start" aria-hidden />
            View original listing
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function CloseButton({
  onClose,
  buttonRef,
}: {
  onClose: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <Button
      ref={buttonRef}
      type="button"
      variant="ghost"
      size="icon-sm"
      className="size-11 shrink-0"
      aria-label="Close details"
      data-testid="rental-details-close"
      onClick={onClose}
    >
      <X aria-hidden />
    </Button>
  );
}

/**
 * Desktop: fills the map column (drawn over the map by `BrowseMapPanel`'s `overlay` slot).
 * Escape or Close dismisses it, and focus returns to whatever opened it.
 */
export function RentalDetailsPanel({ rental, onClose, onSchedule }: DetailsProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // preventScroll: the column is sticky and already on screen. Without it Chrome scrolls the
    // page to the column's un-stuck position, throwing the visitor back to the top of the list.
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <aside
      aria-labelledby="rental-details-title"
      data-testid="rental-details-panel"
      className="absolute inset-0 z-10 overflow-y-auto bg-card p-4"
      onKeyDown={onKeyDown}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{rental.neighborhood}</p>
          <h2 id="rental-details-title" className="font-serif text-lg font-semibold leading-snug">
            {rental.title}
          </h2>
        </div>
        <CloseButton onClose={onClose} buttonRef={closeRef} />
      </div>
      <DetailsBody rental={rental} onSchedule={onSchedule} />
    </aside>
  );
}

/** Phone and tablet: a bottom sheet over the results. The sheet handles Escape and focus return. */
export function RentalDetailsSheet({ rental, onClose, onSchedule }: DetailsProps) {
  return (
    <Sheet open onOpenChange={(open) => {
        if (!open) onClose();
      }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[90vh] overflow-y-auto p-4"
        data-testid="rental-details-sheet"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{rental.neighborhood}</p>
            <SheetTitle className="font-serif text-lg font-semibold leading-snug">{rental.title}</SheetTitle>
            <SheetDescription className="sr-only">Rental details</SheetDescription>
          </div>
          <CloseButton onClose={onClose} />
        </div>
        <DetailsBody rental={rental} onSchedule={onSchedule} />
      </SheetContent>
    </Sheet>
  );
}
