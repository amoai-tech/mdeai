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
import { Calendar, Heart } from "lucide-react";
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
  /** Monthly price when available (authoritative for monthly display). */
  price_monthly?: number;
  /**
   * SAN-1349 — server-proven viewing requestability (`can_schedule_viewing` from the
   * search envelope). The Schedule viewing CTA renders ONLY when this is exactly `true`,
   * so an omitted or false flag withholds the action instead of offering one the database
   * would reject.
   */
  canScheduleViewing?: boolean;
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
  onSave,
  onOpenDetails,
  canScheduleViewing,
}: RentalCardProps) {
  // The listing's own currency — never assumed USD. A stored monthly rent leads: the nightly figure
  // would only be rent ÷ 30, so it is not shown as an offer (same rule as the /rentals browse card).
  const { nightlyLabel, monthlyLabel } = formatRentalPrices(
    tags?.includes("external-source") || price_monthly != null ? null : nightly_price,
    price_monthly,
    currency,
  );
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
    { id, title, neighborhood, nightly_price, bedrooms, wifi, amenities, tags },
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
    <div className="w-full shrink-0 sm:w-[200px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl}
        alt={photoAlt}
        width={200}
        height={120}
        className="aspect-[16/10] w-full rounded-md object-cover sm:aspect-auto sm:h-[120px] sm:w-[200px]"
        loading="lazy"
      />
    </div>
  ) : (
    <div
      className="hidden h-[120px] w-[200px] shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground sm:flex"
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
        <h3 className="min-w-0 flex-1 font-medium leading-snug">{title}</h3>
      </div>

      <p className="mt-0.5 text-xs text-muted-foreground">
        {neighborhood}
        {bedrooms_unknown ? " · Bedrooms unknown" : bedrooms != null
          ? ` · ${bedrooms === 0 ? "Studio" : `${bedrooms} BR`}` : ""}
      </p>

      {nightlyLabel || monthlyLabel ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {nightlyLabel ? (
            <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {nightlyLabel}
            </span>
          ) : null}
          {monthlyLabel ? (
            <span
              className={
                nightlyLabel
                  ? "text-xs text-muted-foreground"
                  : "inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
              }
            >
              {monthlyLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      {availability ? (
        <p className="mt-1 text-xs text-muted-foreground">{availability}</p>
      ) : null}

      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
        {matchReason}
      </p>

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

      <div className="mt-3 flex flex-wrap gap-2">
        {onOpenDetails ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="rental-details-cta"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetails();
            }}
          >
            Details
          </Button>
        ) : null}
        {tags?.includes("external-source") && approvedExternalSourceUrl(source_url) ? (
          <a
            href={source_url}
            target="_blank"
            rel="nofollow noopener noreferrer"
            data-testid="rental-original-listing-cta"
            className="inline-flex h-8 items-center rounded-md border px-3 text-sm"
          >
            View original listing
          </a>
        ) : null}
        {showScheduleCta ? (
          <Button
            type="button"
            size="sm"
            variant="default"
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
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="rental-save-cta"
          disabled
          title="Save for later (coming soon)"
          onClick={(e) => {
            e.stopPropagation();
            onSave?.();
          }}
        >
          <Heart className="size-3.5" aria-hidden />
          Save
        </Button>
      </div>
    </VenueCardShell>
  );
}
