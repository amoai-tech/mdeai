"use client";

import { MapPin, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { VenueBrowseKind, VenueBrowseListing } from "@/components/browse/venue-browse-card";

/**
 * SAN-1638 — read-only Details for the two venue categories that have no public [id] route.
 *
 * It is deliberately typed to `VenueBrowseListing`: exactly the fields the browse catalog
 * already returns. Nothing here can invent a rating, opening hours, a photo or a price,
 * because those values do not exist on the input and are never defaulted.
 *
 * The richer chat-only café/nightlife panels use a different (enriched) contract, so this
 * component does not accept their payloads and they are not fed into it.
 */
const KIND_LABEL: Record<VenueBrowseKind, string> = {
  cafe: "Café",
  nightlife: "Nightlife",
};

/** "third-wave" -> "Third Wave"; venue tags are stored kebab-cased. */
function formatTag(tag: string): string {
  return tag
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** The read-only body shared by the desktop panel and the phone Sheet. */
function VenueBrowseDetailsBody({
  kind,
  listing,
  onClose,
}: {
  kind: VenueBrowseKind;
  listing: VenueBrowseListing;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4 bg-background p-5 pb-8" data-testid="venue-browse-details">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-xl font-semibold">{listing.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {[KIND_LABEL[kind], listing.neighborhood].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Close ${listing.name} details`}
          data-testid="venue-browse-details-close"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {listing.tags.length ? (
        <div className="flex flex-wrap gap-1.5">
          {listing.tags.slice(0, 5).map((tag) => (
            <Badge key={tag} variant="secondary">
              {formatTag(tag)}
            </Badge>
          ))}
          {listing.tags.length > 5 ? (
            <Badge variant="outline" data-testid="venue-browse-details-more-tags">
              +{listing.tags.length - 5}
            </Badge>
          ) : null}
        </div>
      ) : null}

      {/* Only source-backed text. No "open now", no invented rating or hours. */}
      {listing.summary ? (
        <p className="text-sm leading-6" data-testid="venue-browse-details-summary">
          {listing.summary}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          No sourced description is available for this venue yet.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <a
          href={listing.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="venue-browse-details-directions"
          className="inline-flex min-h-card-action items-center gap-1.5 rounded-lg border px-4 text-sm font-medium"
        >
          <MapPin className="size-4" aria-hidden />
          Directions
        </a>
      </div>
    </div>
  );
}

/**
 * Desktop Details. It sits over the live map when the page has one, and alone in the right
 * column when it does not — the column must never mount a map just to hold this panel.
 */
export function VenueBrowseDetailsPanel(props: {
  kind: VenueBrowseKind;
  listing: VenueBrowseListing;
  onClose: () => void;
}) {
  return (
    <section data-details-panel
      data-testid="venue-browse-details-panel"
      aria-label={`${props.listing.name} details`}
      className="absolute inset-0 z-20 overflow-y-auto rounded-xl border bg-background shadow-xl"
    >
      <VenueBrowseDetailsBody {...props} />
    </section>
  );
}

/**
 * Phone Details. Reuses the shared Sheet primitive so focus trapping, Escape and the modal
 * semantics stay the ones the rest of the app already uses.
 */
export function VenueBrowseDetailsSheet(props: {
  kind: VenueBrowseKind;
  listing: VenueBrowseListing;
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
        <SheetTitle className="sr-only">{props.listing.name}</SheetTitle>
        <VenueBrowseDetailsBody {...props} />
      </SheetContent>
    </Sheet>
  );
}
