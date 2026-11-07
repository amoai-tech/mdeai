"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { useVenueAskSelection } from "@/components/chat/use-venue-ask-selection";
import { BrowseMapContextShell } from "@/components/browse/BrowseMapContextShell";
import { BrowseMapPanel } from "@/components/browse/BrowseMapPanel";
import { BrowseMapSheet } from "@/components/browse/BrowseMapSheet";
import { useMapContext, useMapPinSelect } from "@/platform/maps/map-context";
import { useBrowseMapSync } from "@/hooks/use-browse-map-sync";
import { useBrowseCardScroll } from "@/hooks/use-browse-card-scroll";
import { useIsLgUp } from "@/hooks/use-is-lg-up";
import { countWithNoun } from "@/lib/format/count-with-noun";
import { useEscapeToClose } from "@/hooks/use-escape-to-close";
import { venueToMapPin } from "@/lib/browse/browse-pin-converters";
import { DiscoveryGroundedResults, hasVenueBrowseMapPins } from "@/components/chat/discovery-grounded-results";
import type { DiscoveryAgentResult } from "@/components/chat/discovery-tool-results";
import type { GroundedToolRow } from "@/lib/parse-grounded-tool-result";
import { MoonStar } from "lucide-react";
import { DiscoveryWorkspace } from "@/components/browse/DiscoveryWorkspace";
import { DiscoveryAskComposer } from "@/components/chat/discovery-ask-composer";
import { DiscoveryPageContext } from "@/components/chat/discovery-page-context";
import { EmptyState } from "@/components/empty/empty-state";
import { Button } from "@/components/ui/button";
import { VenueBrowseCard } from "@/components/browse/venue-browse-card";
import {
  VenueBrowseDetailsPanel,
  VenueBrowseDetailsSheet,
} from "@/components/browse/venue-browse-details";
import { NightlifeBrowseFilters } from "@/components/nightlife/nightlife-browse-filters";
import type { NightlifeListing, NightlifeVibe } from "@/lib/nightlife-browse";

/** Current filter URL for this page, or the bare path when no filter is set. */
function buildFilterUrl(filters: {
  neighborhood?: string | null;
  vibe?: NightlifeVibe | null;
}): string {
  const params = new URLSearchParams();
  if (filters.neighborhood) params.set("neighborhood", filters.neighborhood);
  if (filters.vibe) params.set("vibe", filters.vibe);
  const query = params.toString();
  return query ? `/nightlife?${query}` : "/nightlife";
}

type NightlifeBrowseViewProps = {
  results: NightlifeListing[];
  error: string | null;
  neighborhood: string | null;
  vibe: NightlifeVibe | null;
};

/** Results, map and right column for nightlife, driven by the shared map selection. */
function NightlifeBrowseViewInner({
  results,
  error,
  neighborhood,
  vibe,
}: NightlifeBrowseViewProps) {
  const { selectedPinId } = useMapContext();
  const selectPin = useMapPinSelect();
  const desktop = useIsLgUp();
  useBrowseCardScroll();
  const retryHref = buildFilterUrl({ neighborhood, vibe });
  /** Preference labels for the rows currently on screen; empty for a name search. */
  const [searchPreferences, setSearchPreferences] = useState<string[]>([]);
  const [searched, setSearched] = useState<{
    scope: string;
    rows: GroundedToolRow[];
    // Who produced these rows: the concierge, or the public catalogue for a guest search.
    source: "agent" | "catalog";
  } | null>(null);
  const activeRows = searched?.scope === retryHref ? searched.rows : null;
  // Only real source coordinates become browse pins; AI search owns its grounded pins separately.
  const basePins = useMemo(() => results.flatMap((r) => {
    const pin = venueToMapPin(r);
    return pin ? [pin] : [];
  }), [results]);
  useBrowseMapSync(activeRows === null && !error ? basePins : [], "venue");
  // Escape closes the desktop panel (the phone Sheet already does).
  const { selectedId, selectForAsk, clearAskSelection } = useVenueAskSelection(
    activeRows, results.map((r) => r.id),
  );
  const onAgentResults = useCallback((result: DiscoveryAgentResult) => {
    if (result.page === "nightlife") {
      setSearched({ scope: retryHref, rows: result.rows, source: "agent" });
      clearAskSelection();
    }
  }, [retryHref, clearAskSelection]);

  const notice = (
    <p
      className="mt-4 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
      data-testid="nightlife-safety-notice"
    >
      Safety: use licensed taxis at night and stay in busy, well-lit areas.
    </p>
  );

  // A result set without valid positions keeps its cards but never shows an empty map.
  const hasMap = hasVenueBrowseMapPins(basePins, activeRows, error);

  // SAN-1638: Details is its own state, deliberately independent of the map pin, so a venue
  // with no coordinates still opens. Deriving the open record from the rows currently on screen
  // closes the panel when a filter removes it and stops a late search from repointing it.
  // SAN-1638: closing Details puts keyboard focus back on the control that opened it.
  const detailsTriggerRef = useRef<HTMLElement | null>(null);
  // SAN-1638: the panel has its own id. Details writes the Ask context; Ask never opens the panel.
  const [detailsId, setDetailsId] = useState<string | null>(null);
  // Resolved only from the rows actually on screen. An Ask MDE search replaces the catalogue grid
  // with grounded rows, so a Details panel for the old catalogue must close instead of floating
  // over unrelated results.
  const displayedListings = activeRows === null ? results : [];
  // The map/Ask selection is the newer action whenever it moves away from the open panel; close
  // instead of leaving the panel and the highlighted pin describing different venues.
  if (detailsId && selectedId !== detailsId) {
    setDetailsId(null);
  }
  const detailsListing = displayedListings.find((listing) => listing.id === detailsId) ?? null;
  const closeDetails = useCallback(() => {
    setDetailsId(null);
    clearAskSelection();
    requestAnimationFrame(() => detailsTriggerRef.current?.focus());
  }, [clearAskSelection]);

  // Escape closes the desktop panel (the phone Sheet already does).
  useEscapeToClose(Boolean(detailsListing && desktop), closeDetails);

  return (
    <>
    <DiscoveryPageContext page="nightlife" filters={{ neighborhood, vibe }} selectedId={selectedId} />
    <DiscoveryWorkspace
      activeSlug="nightlife"
      askComposer={
        <DiscoveryAskComposer
          page="nightlife"
          onAgentResults={onAgentResults}
          hasSelectedItem={Boolean(selectedId)}
          onClearSelection={clearAskSelection}
          guestVenues={{
            kind: "nightlife",
            neighborhood,
            // Catalogue search, not the concierge: grounded venue rows, rendered by the same cards.
            onResults: (rows) => setSearched({ scope: retryHref, rows, source: "catalog" }),
            onSearchMeta: ({ preferences }) => setSearchPreferences(preferences),
            onClear: () => {
              setSearched(null);
              setSearchPreferences([]);
            },
          }}
        />
      }
      rightPanel={
        desktop && detailsListing ? (
          hasMap ? (
            <BrowseMapPanel
              fill
              overlay={
                <VenueBrowseDetailsPanel
                  kind="nightlife"
                  listing={detailsListing}
                  onClose={closeDetails}
                />
              }
            />
          ) : (
            // No coordinate-backed pins: Details still gets the right column, with no fake map.
            <div className="relative h-full">
              <VenueBrowseDetailsPanel
                kind="nightlife"
                listing={detailsListing}
                onClose={closeDetails}
              />
            </div>
          )
        ) : hasMap ? (
          <BrowseMapPanel fill />
        ) : undefined
      }
      testId="nightlife-page"
      title="Nightlife"
      subtitle={
        error
          ? "Clubs & bars in Medellín"
          : searched?.source === "catalog" && activeRows
            ? activeRows.length === 0
              ? "No nightlife venues matched"
              : `${searchPreferences.length > 0 ? "Suggestions" : "Search results"} — ${countWithNoun(activeRows.length, "nightlife venue", "nightlife venues")}`
            : `${countWithNoun((activeRows === null ? results : activeRows).length, "nightlife venue", "nightlife venues")} in Medellín`
      }
      mobileMapTrigger={hasMap ? <BrowseMapSheet inline /> : null}
      filterBar={<NightlifeBrowseFilters neighborhood={neighborhood} vibe={vibe} />}
      notice={notice}
    >
      <section className="mt-6" aria-label="Nightlife listings">
        <DiscoveryGroundedResults rows={activeRows} selectedId={selectedId} onSelectRow={selectForAsk}
          label={searched?.source === "catalog" ? "Search results" : "Ask MDE"} />
        {error ? (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
            data-testid="nightlife-error"
          >
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              nativeButton={false}
              render={<Link href={retryHref} />}
            >
              Retry
            </Button>
          </div>
        ) : null}

        {!error && activeRows === null && results.length === 0 ? (
          <EmptyState
            testId="nightlife-empty"
            title="No nightlife venues matched"
            description="Try another neighborhood or vibe, or ask the concierge on chat."
            icon={<MoonStar className="size-8" aria-hidden />}
          />
        ) : null}

        {!error && activeRows === null && results.length > 0 ? (
          <div
            className="mx-auto flex w-full max-w-3xl flex-col gap-3"
            aria-label={`${results.length} nightlife venues`}
            data-testid="nightlife-grid"
          >
            {results.map((listing) => (
              <VenueBrowseCard
                key={listing.id}
                kind="nightlife"
                listing={listing}
                selectedForAsk={selectedId === listing.id}
                detailsOpen={detailsListing?.id === listing.id}
                pinId={basePins.some((pin) => pin.id === `venue-${listing.id}`) ? `venue-${listing.id}` : undefined}
                selectedForMap={selectedPinId === `venue-${listing.id}`}
                onMapSelect={basePins.some((pin) => pin.id === `venue-${listing.id}`) ? () => selectPin(`venue-${listing.id}`) : undefined}
                onAskSelect={() => {
                  // Context only: never opens Details, and closes a panel for another record.
                  setDetailsId(null);
                  selectForAsk(selectedId === listing.id ? null : listing.id);
                }}
                onDetails={(trigger) => {
                  detailsTriggerRef.current = trigger;
                  // SAN-1638: the panel record is also the Ask MDE record, so the concierge can
                  // never answer about a venue the visitor is no longer looking at. Selecting
                  // context does not send a message.
                  selectForAsk(listing.id);
                  setDetailsId(listing.id);
                }}
                composition="nova"
                mediaLayout="inline"
              />
            ))}
          </div>
        ) : null}
      </section>
    </DiscoveryWorkspace>
    {detailsListing && !desktop ? (
      <VenueBrowseDetailsSheet
        kind="nightlife"
        listing={detailsListing}
        onClose={closeDetails}
      />
    ) : null}
    </>
  );
}

/** Nightlife browse shell that provides the shared map state. */
export function NightlifeBrowseView(props: NightlifeBrowseViewProps) {
  return <BrowseMapContextShell><NightlifeBrowseViewInner {...props} /></BrowseMapContextShell>;
}
