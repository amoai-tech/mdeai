"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { BrowseLayout } from "@/components/browse/BrowseLayout";
import { BrowseMapContextShell } from "@/components/browse/BrowseMapContextShell";
import { BrowseMapPanel } from "@/components/browse/BrowseMapPanel";
import { BrowseMapSheet } from "@/components/browse/BrowseMapSheet";
import { RentalBrowseCard } from "@/components/rentals/rental-browse-card";
import { RentalBrowseFilters } from "@/components/rentals/rental-browse-filters";
import { RentalUiProvider, useRentalUi } from "@/components/chat/rental-ui-context";
import { ScheduleViewingModal } from "@/components/modals/schedule-viewing-modal";
import { EmptyState } from "@/components/empty/empty-state";
import { Button } from "@/components/ui/button";
import { useMapContext } from "@/platform/maps/map-context";
import { useBrowseMapSync } from "@/hooks/use-browse-map-sync";
import { useBrowseCardScroll } from "@/hooks/use-browse-card-scroll";
import { rentalToMapPin } from "@/lib/browse/browse-pin-converters";
import type { Rental } from "@/mastra/tools/search-rentals";

function buildRetryHref(filters: {
  neighborhood?: string | null;
  beds?: string | null;
}): string {
  const p = new URLSearchParams();
  if (filters.neighborhood) p.set("neighborhood", filters.neighborhood);
  if (filters.beds) p.set("beds", filters.beds);
  const q = p.toString();
  return q ? `/rentals?${q}` : "/rentals";
}

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
};

/** Keep the visible rental list and its valid map markers on the same selection state. */
function RentalBrowseViewInner({
  results,
  total,
  error,
  neighborhood,
  beds,
}: RentalBrowseViewProps) {
  const { selectedPinId, setSelectedPinId, panToPin } = useMapContext();
  // SAN-478 — the browse card requests a viewing through the same shared modal the detail
  // page and the chat card use, instead of navigating to a route that does not exist.
  const { openScheduleViewing } = useRentalUi();
  const retryHref = buildRetryHref({ neighborhood, beds });

  const pins = useMemo(
    () =>
      results.flatMap((r) => {
        const pin = rentalToMapPin(r);
        return pin ? [pin] : [];
      }),
    [results],
  );

  useBrowseMapSync(pins, "rental");
  const mappedIds = useMemo(() => new Set(pins.map((pin) => pin.id)), [pins]);
  useBrowseCardScroll();

  // SAN-1089: an outage must not read as "0 apartments", and nothing here claims the stock is
  // curated or available now — only that listed rentals are verified and published.
  const subtitle = error
    ? "Long-stay apartments in Medellín"
    : `Verified long-stay apartments — ${formatCountSubtitle(total, results.length)}`;

  return (
    <>
      <BrowseLayout
        testId="rentals-browse"
        title="Rentals in Medellín"
        subtitle={subtitle}
        filterBar={
          <RentalBrowseFilters neighborhood={neighborhood} beds={beds} />
        }
        mapSlot={<BrowseMapPanel />}
      >
        <section className="mt-6" aria-label="Rental listings">
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

          {!error && results.length === 0 ? (
            <EmptyState
              testId="rentals-empty"
              title="No verified rentals currently match these filters"
              description="Try another neighborhood or bedroom count, or ask MDE in chat."
              icon={<Building2 className="size-8" aria-hidden />}
            />
          ) : null}

          {!error && results.length > 0 ? (
            <div
              className="grid gap-4 sm:grid-cols-2"
              aria-label={`${results.length} rentals`}
              data-testid="rentals-grid"
            >
              {results.map((r) => {
                const pinId = `rental-${r.id}`;
                return (
                  <RentalBrowseCard
                    key={r.id}
                    rental={r}
                    testId={`rental-card-${r.id}`}
                    selected={mappedIds.has(pinId) && selectedPinId === pinId}
                    onSelect={mappedIds.has(pinId) ? () => panToPin(pinId) : undefined}
                    onPreview={mappedIds.has(pinId) ? () => setSelectedPinId(pinId) : undefined}
                    onSchedule={() =>
                      openScheduleViewing({
                        listingId: r.id,
                        title: r.title,
                        neighborhood: r.neighborhood,
                      })
                    }
                  />
                );
              })}
            </div>
          ) : null}
        </section>
      </BrowseLayout>

      <BrowseMapSheet />
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
