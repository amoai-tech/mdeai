"use client";

import { useCallback, useMemo, useState } from "react";
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
import { EmptyState } from "@/components/empty/empty-state";
import { Button } from "@/components/ui/button";
import { useMapContext } from "@/platform/maps/map-context";
import { useBrowseMapSync } from "@/hooks/use-browse-map-sync";
import { useBrowseCardScroll } from "@/hooks/use-browse-card-scroll";
import { restaurantToMapPin } from "@/lib/browse/browse-pin-converters";
import type { Restaurant } from "@/mastra/tools/search-restaurants";

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

function RestaurantBrowseViewInner({
  results,
  error,
  neighborhood,
  cuisine,
  isSample = false,
}: RestaurantBrowseViewProps) {
  const { selectedPinId, setSelectedPinId } = useMapContext();
  const desktop = useIsLgUp();
  const retryHref = buildFilterUrl({ neighborhood, cuisine });
  const [searched, setSearched] = useState<{ scope: string; rows: Restaurant[] } | null>(null);
  const [selectedForAskId, setSelectedForAskId] = useState<string | null>(null);
  const shownResults = searched?.scope === retryHref ? searched.rows : results;
  const selectedRestaurant = shownResults.find((r) => `restaurant-${r.id}` === selectedPinId) ?? null;
  const selectedForAsk = shownResults.some((r) => r.id === selectedForAskId) ? selectedForAskId : null;
  const closeDetails = useCallback(() => setSelectedPinId(null), [setSelectedPinId]);
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
        selectedId={selectedForAsk ?? selectedRestaurant?.id ?? null}
      />
      <DiscoveryWorkspace
        activeSlug="restaurants"
        askComposer={<DiscoveryAskComposer page="restaurants" onAgentResults={onAgentResults} />}
        rightPanel={<BrowseMapPanel fill overlay={selectedRestaurant && desktop ? <RestaurantDetailsPanel restaurant={selectedRestaurant} onClose={closeDetails} /> : undefined} />}
        testId="restaurants-browse"
        title="Restaurants"
        subtitle={
          isSample
            ? "Sample listings — live restaurant data is unavailable; these are not contest nominees"
            : searched?.scope === retryHref ? `Ask MDE — ${shownResults.length} restaurants` : "Food & dining in Medellín"
        }
        filterBar={
          <RestaurantBrowseFilters
            neighborhood={neighborhood}
            cuisine={cuisine}
          />
        }
      >
        <aside className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-3" data-testid="restaurant-contests-entry">
          <Trophy className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Medellín restaurant contests</h2>
            <p className="hidden text-xs text-muted-foreground sm:block">Explore participating restaurants and their voting options.</p>
          </div>
          <Link className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" href="/contests" aria-label="Explore restaurant contests">
            Explore contests <ArrowUpRight className="size-3.5" aria-hidden="true" />
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
                return (
                  <div key={r.id} className="flex flex-col gap-2">
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
                    onSelect={() => setSelectedPinId(pinId)}
                    testId={`restaurant-card-${r.id}`}
                    composition="nova"
                    mediaLayout="inline"
                  />
                  <button type="button" data-testid="restaurant-ask-select" aria-pressed={selectedForAsk === r.id}
                    className="inline-flex min-h-11 items-center justify-center rounded-md border px-3 text-sm font-medium"
                    onClick={() => { setSelectedPinId(null); setSelectedForAskId((current) => current === r.id ? null : r.id); }}>
                    {selectedForAsk === r.id ? "Clear selection" : "Ask about this"}
                  </button>
                  <Link
                    className="inline-flex min-h-11 items-center justify-center rounded-md border px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    data-testid={`restaurant-detail-link-${r.id}`}
                    href={"/restaurants/" + r.id}
                  >
                    View details
                  </Link>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      </DiscoveryWorkspace>

      <BrowseMapSheet raised />
      {selectedRestaurant && !desktop ? <RestaurantDetailsSheet restaurant={selectedRestaurant} onClose={closeDetails} /> : null}
    </>
  );
}

export function RestaurantBrowseView(props: RestaurantBrowseViewProps) {
  return (
    <BrowseMapContextShell>
      <RestaurantBrowseViewInner {...props} />
    </BrowseMapContextShell>
  );
}
