"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DiscoveryAgentResult } from "@/components/chat/discovery-tool-results";
import { CalendarDays } from "lucide-react";
import { DiscoveryWorkspace } from "@/components/browse/DiscoveryWorkspace";
import { DiscoveryAskComposer } from "@/components/chat/discovery-ask-composer";
import { DiscoveryPageContext } from "@/components/chat/discovery-page-context";
import { EventBrowseCard } from "@/components/events/event-browse-card";
import { EventBrowseFilters } from "@/components/events/event-browse-filters";
import { EmptyState } from "@/components/empty/empty-state";
import { Button } from "@/components/ui/button";
import type { PublishedEventListItem } from "@/lib/events/list-published-events";
import type { DateWindow, EventCategory } from "@/mastra/tools/search-events";

function buildFilterUrl(filters: {
  category?: EventCategory | null;
  neighborhood?: string | null;
  dateWindow?: DateWindow | null;
  price?: "free" | "paid" | null;
}): string {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.neighborhood) params.set("neighborhood", filters.neighborhood);
  if (filters.dateWindow && filters.dateWindow !== "any") {
    params.set("dateWindow", filters.dateWindow);
  }
  if (filters.price) params.set("price", filters.price);
  const query = params.toString();
  return query ? `/events?${query}` : "/events";
}

type EventBrowseViewProps = {
  results: PublishedEventListItem[];
  total: number;
  error: string | null;
  category: EventCategory | null;
  neighborhood: string | null;
  dateWindow: DateWindow | null;
  price: "free" | "paid" | null;
};

export function EventBrowseView({
  results,
  total,
  error,
  category,
  neighborhood,
  dateWindow,
  price,
}: EventBrowseViewProps) {
  const [resolved, setResolved] = useState<{ scope: string; rows: PublishedEventListItem[] } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [loadingIds, setLoadingIds] = useState(false);
  const inFlight = useRef<AbortController | null>(null);
  const scope = buildFilterUrl({ category, neighborhood, dateWindow, price });
  useEffect(() => () => inFlight.current?.abort(), []);

  // Re-fetch returned IDs through the canonical public event catalog: tool prices
  // are NOT ticket-tier prices and must never drive a "Free" or checkout CTA.
  const resolveIds = useCallback(async (ids: string[]) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLookupError(null);
    setLoadingIds(true);
    try {
      if (ids.length === 0) {
        setResolved({ scope, rows: [] });
        return;
      }
      const url = "/api/events/public?limit=20&ids=" + encodeURIComponent(ids.join(","));
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error("Could not confirm event details. Please try again.");
      const payload: unknown = await res.json();
      if (!payload || typeof payload !== "object" || !("results" in payload) || !Array.isArray(payload.results)) {
        throw new Error("Invalid event catalog response.");
      }
      const allowed = new Set(ids);
      const rows = payload.results.filter((r: unknown): r is PublishedEventListItem =>
        r !== null && typeof r === "object" && "id" in r && typeof r.id === "string" &&
        allowed.has(r.id) && "title" in r && typeof r.title === "string" &&
        "startsAt" in r && typeof r.startsAt === "string") as PublishedEventListItem[];
      if (!controller.signal.aborted) setResolved({ scope, rows });
    } catch (e) {
      if (!controller.signal.aborted) setLookupError(e instanceof Error ? e.message : "Could not load events.");
    } finally {
      if (!controller.signal.aborted) setLoadingIds(false);
    }
  }, [scope]);
  const onAgentResults = useCallback((result: DiscoveryAgentResult) => {
    if (result.page === "events") void resolveIds(result.ids);
  }, [resolveIds]);
  const shownEvents = resolved?.scope === scope ? resolved.rows : results;
  const retryHref = buildFilterUrl({
    category,
    neighborhood,
    dateWindow,
    price,
  });
  const countLabel =
    total === 1 ? "1 upcoming event" : `${total} upcoming events`;

  return (
    <>
    <DiscoveryPageContext page="events" filters={{ category, neighborhood, dateWindow, price }} />
    <DiscoveryWorkspace
      activeSlug="events"
      askComposer={<DiscoveryAskComposer page="events" onAgentResults={onAgentResults} guestEvents={{
        category, neighborhood, dateWindow,
        onEventIds: (ids) => void resolveIds(ids),
      }} />}
      testId="events-browse"
      title="Events in Medellín"
      subtitle={`Real published events — ${countLabel}`}
      filterBar={
        <EventBrowseFilters
          category={category}
          neighborhood={neighborhood}
          dateWindow={dateWindow}
          price={price}
        />
      }
    >
      <section className="mt-6" aria-label="Event listings">
        {loadingIds ? <p role="status" className="mb-3 text-sm">Confirming event details…</p> : null}
        {lookupError ? <p role="alert" className="mb-3 text-sm text-destructive">{lookupError}</p> : null}
        {resolved?.scope === scope ? <p data-testid="guest-event-results-count" className="mb-3 text-sm text-muted-foreground">{shownEvents.length} matching events from the public catalog. Ticket prices and booking actions come from actual ticket tiers.</p> : null}
        {error ? (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
            data-testid="events-error"
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

        {!error && shownEvents.length === 0 ? (
          <div className="space-y-4">
            <EmptyState
              testId="events-empty"
              title="No events match"
              description="Try another date, category, or neighborhood — or ask the concierge on chat."
              icon={<CalendarDays className="size-8" aria-hidden />}
            />
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href="/chat" />}
              >
                Ask the concierge
              </Button>
            </div>
          </div>
        ) : null}

        {!error && shownEvents.length > 0 ? (
          <div
            className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-label={`${shownEvents.length} events`}
            data-testid="events-grid"
          >
            {shownEvents.map((event) => (
              <EventBrowseCard key={event.id} event={event} />
            ))}
          </div>
        ) : null}
      </section>
    </DiscoveryWorkspace>
    </>
  );
}
