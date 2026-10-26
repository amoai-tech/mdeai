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
import { MoonStar } from "lucide-react";
import { DiscoveryWorkspace } from "@/components/browse/DiscoveryWorkspace";
import { DiscoveryAskComposer } from "@/components/chat/discovery-ask-composer";
import { DiscoveryPageContext } from "@/components/chat/discovery-page-context";
import { EmptyState } from "@/components/empty/empty-state";
import { Button } from "@/components/ui/button";
import { VenueBrowseCard } from "@/components/browse/venue-browse-card";
import { NightlifeBrowseFilters } from "@/components/nightlife/nightlife-browse-filters";
import type { NightlifeListing, NightlifeVibe } from "@/lib/nightlife-browse";

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

function NightlifeBrowseViewInner({
  results,
  error,
  neighborhood,
  vibe,
}: NightlifeBrowseViewProps) {
  const retryHref = buildFilterUrl({ neighborhood, vibe });
  const [searched, setSearched] = useState<{ scope: string; rows: GroundedToolRow[] } | null>(null);
  const activeRows = searched?.scope === retryHref ? searched.rows : null;
  const onAgentResults = useCallback((result: DiscoveryAgentResult) => {
    if (result.page === "nightlife") setSearched({ scope: retryHref, rows: result.rows });
  }, [retryHref]);
  const { selectedPinId } = useMapContext();
  const selectedId = activeRows?.find((r) => "grounded-" + r.id === selectedPinId)?.id ?? null;

  const notice = (
    <p
      className="mt-4 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
      data-testid="nightlife-safety-notice"
    >
      Safety: use licensed taxis at night and stay in busy, well-lit areas.
    </p>
  );

  return (
    <>
    <DiscoveryPageContext page="nightlife" filters={{ neighborhood, vibe }} selectedId={selectedId} />
    <DiscoveryWorkspace
      activeSlug="nightlife"
      askComposer={<DiscoveryAskComposer page="nightlife" onAgentResults={onAgentResults} />}
      rightPanel={activeRows ? <BrowseMapPanel fill /> : undefined}
      testId="nightlife-page"
      title="Nightlife"
      subtitle="Clubs & bars in Medellín"
      filterBar={
        <NightlifeBrowseFilters neighborhood={neighborhood} vibe={vibe} />
      }
      notice={notice}
    >
      <section className="mt-6" aria-label="Nightlife listings">
        <DiscoveryGroundedResults rows={activeRows} />
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
            className="grid auto-rows-fr gap-4 sm:grid-cols-2"
            aria-label={`${results.length} nightlife venues`}
            data-testid="nightlife-grid"
          >
            {results.map((listing) => (
              <VenueBrowseCard
                key={listing.id}
                kind="nightlife"
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

export function NightlifeBrowseView(props: NightlifeBrowseViewProps) {
  return <BrowseMapContextShell><NightlifeBrowseViewInner {...props} /></BrowseMapContextShell>;
}
