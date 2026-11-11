import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VenueCardShell } from "@/components/browse/venue-card-shell";
import {
  buildMatchReason,
  formatRentalPrices,
  rentalBenefitBadges,
  type RentalResultRow,
} from "@/lib/rental-display";
import type { RentalSearchApiParams } from "@/lib/rental-query-parser";
import { approvedExternalSourceUrl } from "@/lib/rentals/external-source";
import { Calendar } from "lucide-react";
import type { ReactNode } from "react";
import type { CardInteractionProps, ResultKind } from "@/components/cards/card-interaction-props";

export type RentalCardProps = RentalResultRow & {
  id: string;
  listingId: string;
  photoUrl?: string;
  /** Override the data-pin-id attribute used for map↔card sync (UX-024).
   *  Defaults to `id` when omitted. */
  pinId?: string | null;
  /** data-testid for the card root element. Defaults to "rental-card". */
  testId?: string;
  selected?: boolean;
  featured?: boolean;
  searchParams?: RentalSearchApiParams;
  onSelect?: (id: string) => void;
  onSchedule?: () => void;
  onSave?: () => void;
  onOpenDetails?: () => void;
  /** SAN-1041 — optional comparison action shown inside the existing card footer. */
  compareSelected?: boolean;
  compareDisabled?: boolean;
  onToggleCompare?: () => void;
  /** Optional contextual action from the existing authorized Concierge thread. */
  nearbyAction?: ReactNode;
  /** Monthly price when available (authoritative for monthly display). */
  price_monthly?: number;
  /**
   * SAN-1349 — server-proven viewing requestability (`can_schedule_viewing` from the
   * search envelope). The Schedule viewing CTA renders ONLY when this is exactly `true`,
   * so an omitted or false flag withholds the action instead of offering one the database
   * would reject.
   */
  canScheduleViewing?: boolean;
  /**
   * SAN-1235 — set when another result row looks like this same apartment ("Also listed as #1").
   * Labelled, never hidden: the rows may be two real feeds for one home.
   */
  duplicateNote?: string;
} & Omit<CardInteractionProps, "onSelect" | "pinId"> & {
  /** Unifies to `() => void` in UX-024; callers pass listing id today. */
  onSelect?: (id: string) => void;
  resultKind?: ResultKind;
};

/** Display a rental search result without inventing map identity or viewing rights. */
export function RentalCard({
  id,
  title,
  neighborhood,
  nightly_price,
  price_monthly,
  currency,
  bedrooms,
  bedrooms_unknown,
  source_url,
  photoUrl,
  availability,
  wifi,
  amenities,
  tags,
  pinId,
  testId = "rental-card",
  selected,
  featured,
  searchParams,
  onSelect,
  onSchedule,
  onOpenDetails,
  compareSelected,
  compareDisabled,
  onToggleCompare,
  nearbyAction,
  canScheduleViewing,
  duplicateNote,
}: RentalCardProps) {
  // The listing's own currency — never assumed USD. A stored monthly rent leads: the nightly figure
  // would only be rent ÷ 30, so it is not shown as an offer (same rule as the /rentals browse card).
  const { nightlyLabel, monthlyLabel } = formatRentalPrices(
    tags?.includes("external-source") || price_monthly != null ? null : nightly_price,
    price_monthly,
    currency,
  );
  // SAN-1502: the validated, normalized URL is BOTH the guard and the destination. Rendering the
  // raw `source_url` would let the checked value and the linked value differ.
  const externalSourceUrl = approvedExternalSourceUrl(source_url);
  const benefits = rentalBenefitBadges({
    id,
    title,
    neighborhood,
    nightly_price,
    bedrooms,
    wifi,
    amenities,
    tags,
  });
  const matchReason = buildMatchReason(
    { id, title, neighborhood, nightly_price, price_monthly, currency, bedrooms, bedrooms_unknown, wifi, amenities, tags },
    searchParams,
  );

  const openCard = () => {
    if (onOpenDetails) onOpenDetails();
    else onSelect?.(id);
  };

  // Wire hover/focus → selected pin highlight (mirrors RestaurantCard pattern)
  const preview = () => onSelect?.(id);

  const photoAlt =
    title && neighborhood
      ? `${title} rental photo in ${neighborhood}`
      : title
        ? `${title} rental photo`
        : neighborhood
          ? `Rental photo in ${neighborhood}`
          : "Listing photo";

  const cardLabel = `Rental: ${title}${neighborhood ? `, ${neighborhood}` : ""}`;

  const interactive = Boolean(onSelect || onOpenDetails);

  // SAN-1349: the viewing action requires the server-proven requestability flag AND a
  // handler. An omitted or false flag withholds the CTA rather than offering an action the
  // database would reject — the same contract the browse card enforces.
  const showScheduleCta = canScheduleViewing === true && Boolean(onSchedule);

  const media = photoUrl ? (
    <div className="w-full shrink-0 sm:w-[232px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl}
        alt={photoAlt}
        width={232}
        height={150}
        className="aspect-[16/10] w-full rounded-lg object-cover sm:aspect-auto sm:h-[150px] sm:w-[232px]"
        loading="lazy"
      />
    </div>
  ) : (
    <div
      className="hidden h-[150px] w-[232px] shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground sm:flex"
      aria-hidden
    >
      Photo
    </div>
  );

  return (
    <VenueCardShell
      testId={testId}
      resultKind="rental"
      pinId={pinId === null ? undefined : pinId ?? id}
      selected={selected}
      featured={featured}
      ariaLabel={cardLabel}
      layout="rental"
      onPreview={onSelect ? preview : undefined}
      bodyRole={interactive ? "button" : undefined}
      bodyTabIndex={interactive ? 0 : undefined}
      onBodyClick={interactive ? openCard : undefined}
      onBodyKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openCard();
              }
            }
          : undefined
      }
      media={media}
    >
      <div className="flex flex-wrap items-center gap-2">
        {featured ? (
          <Badge variant="secondary" className="text-[10px] uppercase">
            Best match
          </Badge>
        ) : null}
        <h3 className="min-w-0 flex-1 text-base font-semibold leading-snug">{title}</h3>
      </div>

      {duplicateNote ? (
        <div className="mt-1">
          <Badge
            variant="outline"
            className="text-[10px] font-normal"
            data-testid={`rental-card-duplicate-${id}`}
            title={duplicateNote}
          >
            {duplicateNote}
          </Badge>
        </div>
      ) : null}

      <p className="mt-1 text-sm text-muted-foreground">
        {neighborhood}
        {bedrooms_unknown ? " · Bedrooms unknown" : bedrooms != null
          ? ` · ${bedrooms === 0 ? "Studio" : `${bedrooms} BR`}` : ""}
      </p>

      {nightlyLabel || monthlyLabel ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {nightlyLabel ? (
            <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-sm font-semibold text-primary" data-testid="rental-price-nightly">
              {nightlyLabel}
            </span>
          ) : null}
          {monthlyLabel ? (
            <span
              data-testid="rental-price-monthly"
              className={
                nightlyLabel
                  ? "text-sm text-muted-foreground"
                  : "inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-lg font-semibold tracking-tight text-primary"
              }
            >
              {monthlyLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      {availability ? (
        <p className="mt-1 text-sm text-muted-foreground">{availability}</p>
      ) : null}

      {matchReason ? (
        <p className="mt-2 min-w-0 break-words text-sm leading-relaxed text-muted-foreground" data-testid="rental-match-reason">
          <span className="font-medium text-foreground">Why it may fit:</span>{" "}
          {matchReason}
        </p>
      ) : null}

      {tags?.includes("self-attested") ? (
        <div className="mt-2 flex flex-wrap gap-1">
          <Badge
            variant="outline"
            className="text-[10px] font-normal"
            data-testid="rental-self-attested-label"
          >
            Not independently verified
          </Badge>
        </div>
      ) : null}

      {benefits.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {benefits.map((b) => (
            <Badge
              key={b}
              variant="outline"
              className="text-[10px] font-normal"
            >
              {b}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mde-rental-card-actions mt-3 flex flex-wrap items-center gap-2">
        {nearbyAction}
        {showScheduleCta ? (
          <Button
            type="button"
            size="sm"
            variant="default"
            className="min-h-card-action flex-1 sm:flex-none lg:min-h-0"
            data-testid="rental-schedule-cta"
            onClick={(e) => {
              e.stopPropagation();
              onSchedule?.();
            }}
          >
            <Calendar className="size-3.5" aria-hidden />
            Schedule viewing
          </Button>
        ) : null}
        {onOpenDetails ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-card-action lg:min-h-0"
            data-testid="rental-details-cta"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetails();
            }}
          >
            Details
          </Button>
        ) : null}
        {onToggleCompare ? (
          <Button
            type="button"
            size="sm"
            variant={compareSelected ? "secondary" : "outline"}
            className="min-h-card-action lg:min-h-0"
            data-testid="rental-compare-toggle"
            aria-pressed={compareSelected === true}
            aria-label={`${compareSelected ? "Remove" : "Add"} ${title} ${compareSelected ? "from" : "to"} comparison`}
            disabled={compareDisabled === true}
            onClick={(event) => {
              event.stopPropagation();
              onToggleCompare();
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {compareSelected ? "✓ Added to comparison" : "Add to comparison"}
          </Button>
        ) : null}
        {tags?.includes("external-source") && externalSourceUrl ? (
          <a
            href={externalSourceUrl}
            target="_blank"
            rel="nofollow noopener noreferrer"
            data-testid="rental-original-listing-cta"
            className="inline-flex min-h-card-action items-center rounded-md border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground lg:min-h-0"
          >
            View original listing
          </a>
        ) : null}
      </div>
    </VenueCardShell>
  );
}
