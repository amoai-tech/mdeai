"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { DiscoveryWorkspace } from "@/components/browse/DiscoveryWorkspace";
import { BrowseMapContextShell } from "@/components/browse/BrowseMapContextShell";
import { BrowseMapPanel } from "@/components/browse/BrowseMapPanel";
import { BrowseMapSheet } from "@/components/browse/BrowseMapSheet";
import { RentalBrowseCard } from "@/components/rentals/rental-browse-card";
import { RentalBrowseFilters } from "@/components/rentals/rental-browse-filters";
import { RentalDetailsPanel, RentalDetailsSheet } from "@/components/rentals/rental-details-panel";
import { RentalAskComposer, type RentalAskResults } from "@/components/rentals/rental-ask-composer";
import { LeadConfirmationBanner } from "@/components/chat/lead-confirmation-banner";
import { RentalUiProvider, useRentalUi } from "@/components/chat/rental-ui-context";
import { ScheduleViewingModal } from "@/components/modals/schedule-viewing-modal";
import { EmptyState } from "@/components/empty/empty-state";
import { Button } from "@/components/ui/button";
import { useMapContext } from "@/platform/maps/map-context";
import { useBrowseMapSync } from "@/hooks/use-browse-map-sync";
import { useBrowseCardScroll } from "@/hooks/use-browse-card-scroll";
import { useIsLgUp } from "@/hooks/use-is-lg-up";
import { rentalToMapPin } from "@/lib/browse/browse-pin-converters";
import { RENTAL_RESULTS_GRID } from "@/lib/rentals/browse-grid";
import { buildRetryHref } from "@/lib/rentals/browse-retry-href";
import type { Rental } from "@/mastra/tools/search-rentals";
import { buildRentalsUrl, rentalsQueryString } from "@/lib/rentals/browse-filters";
import { formatDateOnly } from "@/lib/rentals/date-only";

function formatCountSubtitle(total: number, shown: number): string {
  if (total === 0) return "0 apartments";
  if (total === 1) return "1 apartment";
  if (shown < total) return `${total} apartments (showing ${shown})`;
  return `${total} apartments`;
}

export type RentalBrowseViewProps = {
  results: Rental[];
  total: number;
  error: string | null;
  neighborhood: string | null;
  beds: string | null;
  /** Stay dates from the URL (SAN-486): first and last day, inclusive. */
  from?: string | null;
  through?: string | null;
  /** Why the dates were refused; when set no search ran and no results are shown. */
  dateError?: string | null;
  /** Only for local previews, never changes actual rental eligibility. */
  previewMode?: boolean;
};

/** Keep the visible rental list and its valid map markers on the same selection state. */
function RentalBrowseViewInner({
  results,
  total,
  error,
  neighborhood,
  beds,
  from = null,
  through = null,
  dateError = null,
  previewMode = false,
}: RentalBrowseViewProps) {
  const { selectedPinId, setSelectedPinId, panToPin } = useMapContext();
  // SAN-478 — the browse card requests a viewing through the same shared modal the detail
  // page and the chat card use, instead of navigating to a route that does not exist.
  const { openScheduleViewing } = useRentalUi();
  // SAN-1421 — an answer asked for on this page replaces the list and its pins until the renter
  // clears it, so the cards always describe the question they can still see.
  const [ask, setAsk] = useState<RentalAskResults | null>(null);
  const shownResults = ask?.results ?? results;
  const shownTotal = ask?.total ?? total;
  const filterState = { neighborhood, beds, from, through };
  // A preview fixture failure must retry the preview, not send the user to the public browse.
  const retryHref = previewMode ? buildRetryHref({ neighborhood, beds }, true) : buildRentalsUrl(filterState);
  // Cards link to their detail page with the current filters, so "Back to results" returns to them.
  const detailSearch = rentalsQueryString(filterState);
  const stayLabel =
    !dateError && (from || through)
      ? from && through
        ? `${formatDateOnly(from)} – ${formatDateOnly(through)}`
        : formatDateOnly((from ?? through)!)
      : null;

  const pins = useMemo(
    () =>
      shownResults.flatMap((r) => {
        const pin = rentalToMapPin(r);
        return pin ? [pin] : [];
      }),
    [shownResults],
  );

  useBrowseMapSync(pins, "rental");
  const mappedIds = useMemo(() => new Set(pins.map((pin) => pin.id)), [pins]);
  useBrowseCardScroll();

  // SAN-1416 — Details open in the page (right column on desktop, sheet on phones). The selection
  // is plain local state, so closing it can never reset the filters, the card list or its scroll.
  // If a new search drops the open rental, `detailsRental` becomes null and the panel closes.
  const isLgUp = useIsLgUp();
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const detailsRental = useMemo(
    () => (detailsId ? (shownResults.find((r) => r.id === detailsId) ?? null) : null),
    [detailsId, shownResults],
  );
  const closeDetails = useCallback(() => setDetailsId(null), []);
  const scheduleFor = (r: Rental) => () =>
    openScheduleViewing({ listingId: r.id, title: r.title, neighborhood: r.neighborhood });

  // Public browse includes source-linked external ads alongside verified inventory.
  // Do not claim every result is verified or available for MDE viewing requests.
  const subtitle = ask
    ? `Ask MDE — ${formatCountSubtitle(shownTotal, shownResults.length)}`
    : previewMode
    ? `Development-only rental candidates — ${formatCountSubtitle(total, results.length)}`
    : error
      ? "Long-stay apartments in Medellín"
      : dateError
        ? "Long-stay rentals in Medellín"
        : `Long-stay rentals — ${formatCountSubtitle(total, results.length)}${stayLabel ? ` · open ${stayLabel}` : ""}`;

  return (
    <>
      <DiscoveryWorkspace
        testId="rentals-browse"
        activeSlug="rentals"
        title="Rentals in Medellín"
        subtitle={subtitle}
        filterBar={
          previewMode ? (
            <p className="text-sm text-muted-foreground">Preview only — filters and bookings are disabled.</p>
          ) : (
            <RentalBrowseFilters
              neighborhood={neighborhood}
              beds={beds}
              from={from}
              through={through}
              dateError={dateError}
            />
          )
        }
        rightPanel={
          <BrowseMapPanel
            fill
            overlay={
              detailsRental && isLgUp ? (
                <RentalDetailsPanel
                  rental={detailsRental}
                  onClose={closeDetails}
                  onSchedule={scheduleFor(detailsRental)}
                />
              ) : undefined
            }
          />
        }
        askComposer={<RentalAskComposer onResults={setAsk} />}
      >
        <section className="mt-4" aria-label="Rental listings">
          {/* A saved viewing request must be visible where it was made, not only in the chat. */}
          <LeadConfirmationBanner />
          {error ? (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
              data-testid="rentals-error"
            >
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                render={<Link href={retryHref} />}
              >
                Retry
              </Button>
            </div>
          ) : null}

          {!error && dateError ? (
            <EmptyState
              testId="rentals-date-invalid"
              title="Check your dates"
              description={`${dateError} Fix them above to see apartments open for your stay.`}
              icon={<Building2 className="size-8" aria-hidden />}
            />
          ) : null}

          {ask ? (
            <div
              data-testid="rental-ask-answer"
              className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1">
                <span className="text-muted-foreground">Answer to: </span>
                <span className="font-medium">{ask.query}</span>
              </span>
              {ask.budgetNotice ? (
                <span className="w-full text-xs text-muted-foreground">{ask.budgetNotice}</span>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => setAsk(null)} data-testid="rental-ask-answer-clear">
                Clear
              </Button>
            </div>
          ) : null}

          {!error && !dateError && shownResults.length === 0 ? (
            <EmptyState
              testId="rentals-empty"
              title="No rentals currently match these filters"
              description={
                stayLabel
                  ? "None are open for the whole stay you chose. Try other dates, another neighborhood or bedroom count, or ask MDE in chat."
                  : "Try another neighborhood or bedroom count, or ask MDE in chat."
              }
              icon={<Building2 className="size-8" aria-hidden />}
            />
          ) : null}

          {!error && !dateError && shownResults.length > 0 ? (
            <div
              className={RENTAL_RESULTS_GRID}
              aria-label={`${shownResults.length} rentals`}
              data-testid="rentals-grid"
            >
              {shownResults.map((r) => {
                const pinId = `rental-${r.id}`;
                return (
                  <RentalBrowseCard
                    key={r.id}
                    rental={r}
                    detailSearch={detailSearch}
                    testId={`rental-card-${r.id}`}
                    selected={mappedIds.has(pinId) && selectedPinId === pinId}
                    onSelect={mappedIds.has(pinId) ? () => panToPin(pinId) : undefined}
                    onPreview={mappedIds.has(pinId) ? () => setSelectedPinId(pinId) : undefined}
                    onSchedule={scheduleFor(r)}
                    onDetails={() => {
                      setDetailsId(r.id);
                      // A mapped rental also becomes the selected pin; an unmapped one gets none.
                      if (mappedIds.has(pinId)) panToPin(pinId);
                    }}
                  />
                );
              })}
            </div>
          ) : null}
        </section>
      </DiscoveryWorkspace>

      <BrowseMapSheet raised />
      {detailsRental && !isLgUp ? (
        <RentalDetailsSheet
          rental={detailsRental}
          onClose={closeDetails}
          onSchedule={scheduleFor(detailsRental)}
        />
      ) : null}
    </>
  );
}

/** Supply the shared rental UI and map contexts for the browse workspace. */
export function RentalBrowseView(props: RentalBrowseViewProps) {
  return (
    <RentalUiProvider>
      <BrowseMapContextShell>
        <RentalBrowseViewInner {...props} />
      </BrowseMapContextShell>
      <ScheduleViewingModal />
    </RentalUiProvider>
  );
}
