"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { DiscoveryAgentResult } from "@/components/chat/discovery-tool-results";
import Link from "next/link";
import { ArrowUpRight, Trophy, UtensilsCrossed } from "lucide-react";
import { DiscoveryWorkspace } from "@/components/browse/DiscoveryWorkspace";
import { DiscoveryAskComposer } from "@/components/chat/discovery-ask-composer";
import { DiscoveryPageContext } from "@/components/chat/discovery-page-context";
import { BrowseMapContextShell } from "@/components/browse/BrowseMapContextShell";
import { BrowseMapPanel } from "@/components/browse/BrowseMapPanel";
import { BrowseMapSheet } from "@/components/browse/BrowseMapSheet";
import { RestaurantCard } from "@/components/copilot/restaurant-card";
import { RestaurantBrowseFilters } from "@/components/restaurants/restaurant-browse-filters";
import { RestaurantDetailsPanel, RestaurantDetailsSheet } from "@/components/restaurants/restaurant-details-panel";
import { useIsLgUp } from "@/hooks/use-is-lg-up";
import { useEscapeToClose } from "@/hooks/use-escape-to-close";
import { EmptyState } from "@/components/empty/empty-state";
import { Button } from "@/components/ui/button";
import { useMapContext, useMapPinSelect } from "@/platform/maps/map-context";
import { useBrowseMapSync } from "@/hooks/use-browse-map-sync";
import { useBrowseCardScroll } from "@/hooks/use-browse-card-scroll";
import { restaurantToMapPin } from "@/lib/browse/browse-pin-converters";
import type { Restaurant } from "@/mastra/tools/search-restaurants";

/** Current filter URL for this page, or the bare path when no filter is set. */
function buildFilterUrl(filters: {
  neighborhood?: string | null;
  cuisine?: string | null;
}): string {
  const params = new URLSearchParams();
  if (filters.neighborhood) params.set("neighborhood", filters.neighborhood);
  if (filters.cuisine) params.set("cuisine", filters.cuisine);
  const query = params.toString();
  return query ? `/restaurants?${query}` : "/restaurants";
}

type RestaurantBrowseViewProps = {
  results: Restaurant[];
  error: string | null;
  neighborhood: string | null;
  cuisine: string | null;
  /** True when results are the curated sample set, not live restaurant inventory. */
  isSample?: boolean;
};

/** Results, map and right column for restaurants, driven by the shared map selection. */
function RestaurantBrowseViewInner({
  results,
  error,
  neighborhood,
  cuisine,
  isSample = false,
}: RestaurantBrowseViewProps) {
  const { selectedPinId, setSelectedPinId } = useMapContext();
  const selectPin = useMapPinSelect();
  const desktop = useIsLgUp();
  const retryHref = buildFilterUrl({ neighborhood, cuisine });
  const [searched, setSearched] = useState<{ scope: string; rows: Restaurant[] } | null>(null);
  const [selectedForAskId, setSelectedForAskId] = useState<string | null>(null);
  // SAN-1638: the panel has its own id. Opening Details writes the Ask context; pressing Ask never
  // opens the panel (on a phone that would cover the composer), and pressing Ask while another
  // panel is open closes that panel so the two cannot describe different restaurants.
  const [detailsId, setDetailsId] = useState<string | null>(null);
  // SAN-1638: closing Details puts keyboard focus back on the control that opened it.
  // The control that opened Details, remembered with its record: a map pin can take the panel
  // over, and Close must not pull focus onto an older card's button.
  const detailsTriggerRef = useRef<{ el: HTMLElement; forId: string } | null>(null);
  const shownResults = searched?.scope === retryHref ? searched.rows : results;
  // A pin selection opened Details before this task; keep that. Details has its own id for the
  // card action, but an explicit pin pick is the more deliberate choice, so it wins.
  // The panel follows Details only. Selecting a pin highlights the map — it no longer swaps the
  // panel — which is what cafés and nightlife already do, and it is what makes "View on map" mean
  // the same thing on all three pages instead of opening Details over the map it just moved.
  const openRestaurantId = detailsId;
  const detailsRestaurant = shownResults.find((r) => r.id === openRestaurantId) ?? null;
  // Forget an id whose record left the results, so it cannot reopen on a later search.
  if (detailsId && !shownResults.some((r) => r.id === detailsId)) {
    setDetailsId(null);
  }
  if (selectedForAskId && !shownResults.some((r) => r.id === selectedForAskId)) {
    setSelectedForAskId(null);
  }
  const selectedForAsk = shownResults.some((r) => r.id === selectedForAskId) ? selectedForAskId : null;
  // Close clears the whole selection — panel, map pin and Ask context — so nothing is left
  // pointing at a restaurant the visitor has closed, and focus returns to the control that opened it.
  const closeDetails = useCallback(() => {
    setDetailsId(null);
    setSelectedPinId(null);
    setSelectedForAskId(null);
    requestAnimationFrame(() => {
      const trigger = detailsTriggerRef.current;
      if (trigger && trigger.forId === openRestaurantId) trigger.el.focus();
    });
  }, [openRestaurantId, setSelectedPinId]);
  // Escape closes the desktop panel (the phone Sheet already does).
  useEscapeToClose(Boolean(detailsRestaurant && desktop), closeDetails);

  const onAgentResults = useCallback((result: DiscoveryAgentResult) => {
    if (result.page === "restaurants") {
      setSelectedForAskId(null);
      setSearched({ scope: retryHref, rows: result.rows });
    }
  }, [retryHref]);

  const pins = useMemo(
    () =>
      shownResults.flatMap((r) => {
        const pin = restaurantToMapPin(r);
        return pin ? [pin] : [];
      }),
    [shownResults],
  );

  useBrowseMapSync(pins, "restaurant");
  useBrowseCardScroll();

  return (
    <>
      <DiscoveryPageContext
        page="restaurants"
        filters={{ neighborhood, cuisine }}
        selectedId={selectedForAsk}
      />
      <DiscoveryWorkspace
        activeSlug="restaurants"
        askComposer={<DiscoveryAskComposer page="restaurants" onAgentResults={onAgentResults} hasSelectedItem={Boolean(selectedForAsk)} onClearSelection={() => { setSelectedForAskId(null); setSelectedPinId(null); }} guestRestaurants={{
          neighborhood,
          cuisine,
          // Guest search is catalog search: the public endpoint returns grounded rows and the
          // existing cards and map render them. Nothing reaches the agent runtime.
          onResults: (rows: Restaurant[]) => setSearched({ scope: retryHref, rows }),
        }} />}
        rightPanel={<BrowseMapPanel fill overlay={detailsRestaurant && desktop ? <RestaurantDetailsPanel restaurant={detailsRestaurant} onClose={closeDetails} /> : undefined} />}
        testId="restaurants-browse"
        title="Restaurants"
        subtitle={
          isSample
            ? "Sample listings — live restaurant data is unavailable; these are not contest nominees"
            : searched?.scope === retryHref ? `Ask MDE — ${shownResults.length} restaurants` : "Food & dining in Medellín"
        }
        mobileMapTrigger={<BrowseMapSheet inline />}
        filterBar={<RestaurantBrowseFilters neighborhood={neighborhood} cuisine={cuisine} />}
      >
        <aside className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-3" data-testid="restaurant-contests-entry">
          <Trophy className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Medellín restaurant contests</h2>
            <p className="hidden text-xs text-muted-foreground sm:block">Explore participating restaurants and their voting options.</p>
          </div>
          <Link className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" href="/contests">
            Explore restaurant contests <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </aside>
        <section className="mt-6" aria-label="Restaurant listings">
          {error ? (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
              data-testid="restaurants-error"
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

          {!error && shownResults.length === 0 ? (
            <EmptyState
              testId="restaurants-empty"
              title="No restaurants matched"
              description="Try another neighborhood or cuisine, or ask the concierge on chat."
              icon={<UtensilsCrossed className="size-8" aria-hidden />}
            />
          ) : null}

          {!error && shownResults.length > 0 ? (
            <div
              className="flex flex-col gap-3"
              aria-label={`${shownResults.length} restaurants`}
              data-testid="restaurants-grid"
            >
              {shownResults.map((r) => {
                const pinId = `restaurant-${r.id}`;
                // `restaurantToMapPin` drops rows without coordinates, so this is the one
                // source of truth for "the map can show this restaurant".
                const hasPin = pins.some((pin) => pin.id === pinId);
                return (
                  <RestaurantCard
                    key={r.id}
                    title={r.name}
                    neighborhood={r.neighborhood}
                    cuisine={r.cuisine}
                    priceTier={r.priceTier}
                    rating={r.rating}
                    imageUrl={r.imageUrl}
                    mapsUrl={r.mapsUrl}
                    aiSummary={r.aiSummary}
                    pinId={pinId}
                    selected={selectedPinId === pinId}
                    // Same rule as cafés and nightlife: the map action exists only when
                    // `restaurantToMapPin` produced a pin for this row.
                    onMapSelect={hasPin ? () => selectPin(pinId) : undefined}
                    // Card body selects on the map, exactly like café and nightlife cards.
                    // Omitted for rows the map cannot show, so the card never announces a
                    // selection it cannot complete.
                    onSelect={hasPin ? () => selectPin(pinId) : undefined}
                    selectedForAsk={selectedForAsk === r.id}
                    detailsOpen={openRestaurantId === r.id}
                    // Ask selects context only: it clears the map/details preview and
                    // toggles our own selection. Nothing is sent until the visitor submits.
                    onAskSelect={() => {
                      // Ask sets context only. It never opens Details (which would cover the
                      // composer on a phone) and it closes any panel describing another record.
                      setSelectedPinId(null);
                      setDetailsId(null);
                      setSelectedForAskId((current) =>
                        current === r.id ? null : r.id,
                      );
                    }}
                    onDetails={(trigger) => {
                      detailsTriggerRef.current = { el: trigger, forId: r.id };
                      // Details is the newer, explicit choice: release a pin that would otherwise
                      // win the lookup and leave the panel showing a different restaurant.
                      setSelectedPinId(null);
                      setSelectedForAskId(r.id);
                      setDetailsId(r.id);
                    }}
                    detailsTestId={`restaurant-details-open-${r.id}`}
                    testId={`restaurant-card-${r.id}`}
                    composition="nova"
                    mediaLayout="inline"
                  />
                );
              })}
            </div>
          ) : null}
        </section>
      </DiscoveryWorkspace>

      {detailsRestaurant && !desktop ? <RestaurantDetailsSheet restaurant={detailsRestaurant} onClose={closeDetails} /> : null}
    </>
  );
}

/** Restaurant browse shell that provides the shared map state. */
export function RestaurantBrowseView(props: RestaurantBrowseViewProps) {
  return (
    <BrowseMapContextShell>
      <RestaurantBrowseViewInner {...props} />
    </BrowseMapContextShell>
  );
}
