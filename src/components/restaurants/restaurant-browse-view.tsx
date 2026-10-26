"use client";

import { useMemo } from "react";
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
  const retryHref = buildFilterUrl({ neighborhood, cuisine });

  const pins = useMemo(
    () =>
      results.flatMap((r) => {
        const pin = restaurantToMapPin(r);
        return pin ? [pin] : [];
      }),
    [results],
  );

  useBrowseMapSync(pins, "restaurant");
  useBrowseCardScroll();

  return (
    <>
      <DiscoveryPageContext
        page="restaurants"
        filters={{ neighborhood, cuisine }}
        selectedId={results.find((r) => `restaurant-${r.id}` === selectedPinId)?.id ?? null}
      />
      <DiscoveryWorkspace
        activeSlug="restaurants"
        askComposer={<DiscoveryAskComposer page="restaurants" />}
        rightPanel={<BrowseMapPanel fill />}
        testId="restaurants-browse"
        title="Restaurants"
        subtitle={
          isSample
            ? "Sample listings — live restaurant data is unavailable; these are not contest nominees"
            : "Food & dining in Medellín — browse without chat"
        }
        filterBar={
          <RestaurantBrowseFilters
            neighborhood={neighborhood}
            cuisine={cuisine}
          />
        }
      >
        <aside className="mt-5 flex flex-col gap-4 rounded-2xl border border-border/70 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6" data-testid="restaurant-contests-entry">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-background/80" aria-hidden="true">
              <Trophy className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-semibold tracking-tight">Medellín restaurant contests</h2>
              <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">Explore the restaurants taking part and discover their voting options.</p>
            </div>
          </div>
          <Link className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" href="/contests">
            Explore restaurant contests <ArrowUpRight className="size-4" aria-hidden="true" />
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

          {!error && results.length === 0 ? (
            <EmptyState
              testId="restaurants-empty"
              title="No restaurants matched"
              description="Try another neighborhood or cuisine, or ask the concierge on chat."
              icon={<UtensilsCrossed className="size-8" aria-hidden />}
            />
          ) : null}

          {!error && results.length > 0 ? (
            <div
              className="grid auto-rows-fr gap-4 sm:grid-cols-2"
              aria-label={`${results.length} restaurants`}
              data-testid="restaurants-grid"
            >
              {results.map((r) => {
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
                    mediaLayout="cover"
                  />
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

      <BrowseMapSheet />
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
