"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { BrowseMapContextShell } from "@/components/browse/BrowseMapContextShell";
import { BrowseMapPanel } from "@/components/browse/BrowseMapPanel";
import { BrowseMapSheet } from "@/components/browse/BrowseMapSheet";
import { DiscoveryGroundedResults } from "@/components/chat/discovery-grounded-results";
import type { DiscoveryAgentResult } from "@/components/chat/discovery-tool-results";
import { useMapContext } from "@/platform/maps/map-context";
import type { GroundedToolRow } from "@/lib/parse-grounded-tool-result";
import { Coffee } from "lucide-react";
import { DiscoveryWorkspace } from "@/components/browse/DiscoveryWorkspace";
import { DiscoveryAskComposer } from "@/components/chat/discovery-ask-composer";
import { DiscoveryPageContext } from "@/components/chat/discovery-page-context";
import { EmptyState } from "@/components/empty/empty-state";
import { Button } from "@/components/ui/button";
import { VenueBrowseCard } from "@/components/browse/venue-browse-card";
import { CafeBrowseFilters } from "@/components/cafes/cafe-browse-filters";
import type { CafeFeature, CafeListing } from "@/lib/cafe-browse";

function buildFilterUrl(filters: {
  neighborhood?: string | null;
  feature?: CafeFeature | null;
}): string {
  const params = new URLSearchParams();
  if (filters.neighborhood) params.set("neighborhood", filters.neighborhood);
  if (filters.feature) params.set("feature", filters.feature);
  const query = params.toString();
  return query ? `/cafes?${query}` : "/cafes";
}

type CafeBrowseViewProps = {
  results: CafeListing[];
  error: string | null;
  neighborhood: string | null;
  feature: CafeFeature | null;
};

function CafeBrowseViewInner({
  results,
  error,
  neighborhood,
  feature,
}: CafeBrowseViewProps) {
  const retryHref = buildFilterUrl({ neighborhood, feature });
  const [searched, setSearched] = useState<{ scope: string; rows: GroundedToolRow[] } | null>(null);
  const activeRows = searched?.scope === retryHref ? searched.rows : null;
  const onAgentResults = useCallback((result: DiscoveryAgentResult) => {
    if (result.page === "cafes") setSearched({ scope: retryHref, rows: result.rows });
  }, [retryHref]);
  const { selectedPinId } = useMapContext();
  const selectedId = activeRows?.find((r) => "grounded-" + r.id === selectedPinId)?.id ?? null;

  return (
    <>
    <DiscoveryPageContext page="cafes" filters={{ neighborhood, feature }} selectedId={selectedId} />
    <DiscoveryWorkspace
      activeSlug="cafes"
      askComposer={<DiscoveryAskComposer page="cafes" onAgentResults={onAgentResults} />}
      rightPanel={activeRows ? <BrowseMapPanel fill /> : undefined}
      testId="cafes-browse"
      title="Cafés"
      subtitle="Specialty coffee & workspace spots in Medellín"
      filterBar={
        <CafeBrowseFilters neighborhood={neighborhood} feature={feature} />
      }
    >
      <section className="mt-6" aria-label="Café listings">
        <DiscoveryGroundedResults rows={activeRows} />
        {error ? (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
            data-testid="cafes-error"
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
            testId="cafes-empty"
            title="No cafés matched"
            description="Try another neighborhood or feature, or ask the concierge on chat."
            icon={<Coffee className="size-8" aria-hidden />}
          />
        ) : null}

        {!error && activeRows === null && results.length > 0 ? (
          <div
            className="grid auto-rows-fr gap-4 sm:grid-cols-2"
            aria-label={`${results.length} cafés`}
            data-testid="cafes-grid"
          >
            {results.map((listing) => (
              <VenueBrowseCard
                key={listing.id}
                kind="cafe"
                listing={listing}
                composition="nova"
                mediaLayout="cover"
              />
            ))}
          </div>
        ) : null}
      </section>
    </DiscoveryWorkspace>
    {activeRows ? <BrowseMapSheet /> : null}
    </>
  );
}

export function CafeBrowseView(props: CafeBrowseViewProps) {
  return <BrowseMapContextShell><CafeBrowseViewInner {...props} /></BrowseMapContextShell>;
}
