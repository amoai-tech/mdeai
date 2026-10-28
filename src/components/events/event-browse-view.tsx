"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiscoveryAgentResult } from "@/components/chat/discovery-tool-results";
import { CalendarDays } from "lucide-react";
import { BrowseMapContextShell } from "@/components/browse/BrowseMapContextShell";
import { BrowseMapPanel } from "@/components/browse/BrowseMapPanel";
import { BrowseMapSheet } from "@/components/browse/BrowseMapSheet";
import { DiscoveryWorkspace } from "@/components/browse/DiscoveryWorkspace";
import { DiscoveryAskComposer } from "@/components/chat/discovery-ask-composer";
import { DiscoveryPageContext } from "@/components/chat/discovery-page-context";
import { EventBrowseCard } from "@/components/events/event-browse-card";
import { EventBrowseFilters } from "@/components/events/event-browse-filters";
import { EmptyState } from "@/components/empty/empty-state";
import { Button } from "@/components/ui/button";
import { useBrowseCardScroll } from "@/hooks/use-browse-card-scroll";
import { useBrowseMapSync } from "@/hooks/use-browse-map-sync";
import { eventToMapPin } from "@/lib/browse/browse-pin-converters";
import type { PublishedEventListItem } from "@/lib/events/list-published-events";
import { useMapContext } from "@/platform/maps/map-context";
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

function EventBrowseViewInner({
  results,
  total,
  error,
  category,
  neighborhood,
  dateWindow,
  price,
}: EventBrowseViewProps) {
  const { selectedPinId, setSelectedPinId, panToPin } = useMapContext();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{ scope: string; rows: PublishedEventListItem[] } | null>(null);
  // A failure and an in-flight lookup belong to the filter scope they started in, with the IDs to retry, so a
  // filter change can never leave an old error or Retry standing under different filters.
  const [lookupFailure, setLookupFailure] = useState<{ scope: string; message: string; ids: string[] } | null>(null);
  const [loadingScope, setLoadingScope] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const scope = buildFilterUrl({ category, neighborhood, dateWindow, price });
  useEffect(() => () => inFlight.current?.abort(), []);

  // Re-fetch returned IDs through the canonical public event catalog: tool prices
  // are NOT ticket-tier prices and must never drive a "Free" or checkout CTA.
  const resolveIds = useCallback(async (ids: string[]) => {
    // A newer search aborts the older one; the aborted response is ignored below, so it can never
    // replace the newer results.
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLookupFailure(null);
    setLoadingScope(scope);
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
      if (!controller.signal.aborted) {
        // The failed search must not leave the previous search's results standing as its answer:
        // fall back to the canonical browse results for the current filters and offer Retry.
        setResolved(null);
        setLookupFailure({ scope, ids, message: e instanceof Error ? e.message : "Could not load events." });
      }
    } finally {
      if (!controller.signal.aborted) setLoadingScope(null);
    }
  }, [scope]);
  const onAgentResults = useCallback((result: DiscoveryAgentResult) => {
    if (result.page === "events") void resolveIds(result.ids);
  }, [resolveIds]);
  const shownEvents = resolved?.scope === scope ? resolved.rows : results;
  // One selected event drives the card highlight, the marker and the Ask MDE context. It is valid only
  // while its real card is in the current result set.
  const selectedId = shownEvents.some((event) => event.id === selectedEventId) ? selectedEventId : null;
  // Pins come only from the events shown right now and only from saved coordinates, so a filter or
  // Ask change replaces them together with the cards and an event without a position stays card-only.
  const pins = useMemo(
    () => (error ? [] : shownEvents.flatMap((event) => {
      const pin = eventToMapPin(event);
      return pin ? [pin] : [];
    })),
    [shownEvents, error],
  );
  useBrowseMapSync(pins, "event");
  useBrowseCardScroll();
  const pinIds = useMemo(() => new Set(pins.map((pin) => pin.id)), [pins]);
  const hasMap = pins.length > 0;

  // Select (or clear) an event everywhere at once. An event with no saved position stays selectable for
  // Ask MDE; it simply has no marker, and any other marker selection is cleared.
  const selectEvent = useCallback((id: string | null) => {
    setSelectedEventId(id);
    if (id && pinIds.has(`event-${id}`)) panToPin(`event-${id}`);
    else setSelectedPinId(null);
  }, [pinIds, panToPin, setSelectedPinId]);

  // A marker click (or closing its info card) arrives through the shared map context; mirror it into the
  // one selected event instead of keeping a second selection. This adjusts our own state while rendering
  // (the documented pattern for state derived from other state), so there is no effect and no extra render pass.
  const [prevPinId, setPrevPinId] = useState<string | null>(null);
  if (selectedPinId !== prevPinId) {
    setPrevPinId(selectedPinId);
    if (selectedPinId?.startsWith("event-")) {
      const id = selectedPinId.slice("event-".length);
      if (id !== selectedEventId && shownEvents.some((event) => event.id === id)) setSelectedEventId(id);
    } else if (prevPinId?.startsWith("event-") && selectedEventId === prevPinId.slice("event-".length)) {
      // The info card was closed: clear Ask too, but only if that same event was the selected one.
      setSelectedEventId(null);
    }
  }

  // Filters or Ask results changed and the selected event is gone: forget it now, so it cannot reappear
  // when the filter is cleared. Its marker selection is cleared by the shared pin sync when the pin leaves.
  const shownKey = shownEvents.map((event) => event.id).join(",");
  const [prevShownKey, setPrevShownKey] = useState(shownKey);
  if (shownKey !== prevShownKey) {
    setPrevShownKey(shownKey);
    if (selectedEventId && !shownEvents.some((event) => event.id === selectedEventId)) setSelectedEventId(null);
  }

  const retryHref = buildFilterUrl({
    category,
    neighborhood,
    dateWindow,
    price,
  });
  const countLabel =
    total === 1 ? "1 upcoming event listing" : `${total} upcoming event listings`;

  return (
    <>
    <DiscoveryPageContext page="events" filters={{ category, neighborhood, dateWindow, price }} selectedId={selectedId} />
    <DiscoveryWorkspace
      activeSlug="events"
      askComposer={<DiscoveryAskComposer page="events" onAgentResults={onAgentResults} guestEvents={{
        category, neighborhood, dateWindow,
        onEventIds: (ids) => void resolveIds(ids),
      }} />}
      rightPanel={hasMap ? <BrowseMapPanel fill /> : undefined}
      mobileMapTrigger={hasMap ? <BrowseMapSheet inline /> : null}
      testId="events-browse"
      title="Events in Medellín"
      subtitle={`Published events — ${countLabel}`}
      filterBar={
        <EventBrowseFilters
          category={category}
          neighborhood={neighborhood}
          dateWindow={dateWindow}
          price={price}
        />
      }
    >
      <section className="@container mt-6" aria-label="Event listings">
        {loadingScope === scope ? <p role="status" className="mb-3 text-sm">Confirming event details…</p> : null}
        {lookupFailure?.scope === scope ? (
          <div role="alert" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-destructive" data-testid="events-lookup-error">
            <span>{lookupFailure.message} Showing all events for these filters.</span>
            <Button type="button" variant="outline" size="sm" data-testid="events-lookup-retry"
              onClick={() => void resolveIds(lookupFailure.ids)}>
              Retry
            </Button>
          </div>
        ) : null}
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
            className={hasMap ? "grid w-full grid-cols-1 gap-3" : "grid w-full grid-cols-1 gap-3 @3xl:grid-cols-2"}
            aria-label={`${shownEvents.length} events`}
            data-testid="events-grid"
          >
            {shownEvents.map((event) => {
              const pinId = `event-${event.id}`;
              const onMap = pinIds.has(pinId);
              return (
              <EventBrowseCard key={event.id} event={event} mediaLayout="inline"
                pinId={onMap ? pinId : undefined}
                selectedForAsk={selectedId === event.id}
                onAskSelect={() => selectEvent(selectedId === event.id ? null : event.id)} />
              );
            })}
          </div>
        ) : null}
      </section>
    </DiscoveryWorkspace>
    </>
  );
}

export function EventBrowseView(props: EventBrowseViewProps) {
  return <BrowseMapContextShell><EventBrowseViewInner {...props} /></BrowseMapContextShell>;
}
