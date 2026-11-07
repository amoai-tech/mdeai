"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import type { AbstractAgent } from "@copilotkit/react-core/v2";
import { useOptionalConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { useEventSearchFastPath } from "@/hooks/use-event-search-fast-path";
import { ToolErrorChip } from "@/components/copilot/tool-error-chip";
import { CafeResultCard } from "@/components/copilot/cafe-result-card";
import { RentalCard } from "@/components/copilot/rental-card";
import { NearbyRentalAction } from "@/components/copilot/a2ui/mde-ui-catalog";
import { isStoredRentalUuid } from "@/lib/cafe-search-fast-path";
import type { RentalSearchMeta } from "@/components/chat/rental-fast-path-context";
import { EventCard } from "@/components/copilot/event-card";
import { DomainResults } from "@/components/copilot/domain-results";
import { ToolPinsSync } from "@/components/copilot/tool-pins-sync";
import { useCurrentSearchToolResult } from "@/components/copilot/search-tool-result-ownership";
import { EmptyState } from "@/components/empty/empty-state";
import { WebCitationList } from "@/components/copilot/web-citation-list";
import {
  useRentalUi,
  type CafeVenueDetail,
  type NightlifeVenueDetail,
} from "@/components/chat/rental-ui-context";
import { readGroundedVenueKind } from "@/lib/grounded-venue-kind";
import type { ParsedGroundedToolResult } from "@/lib/parse-grounded-tool-result";
import { useEventSearchResults } from "@/components/chat/event-search-results-context";
import { RichCardResultsRegistrar } from "@/components/chat/rich-card-results-context";
import { useMapContext } from "@/platform/maps/map-context";
import { normalizeToolEnvelope, unwrapAgUiToolPayload } from "@/lib/normalize-tool-envelope";
import { visibleEventSearchReasons } from "@/lib/event-search-fast-path";
import { toDetailRental } from "@/lib/rentals/chat-rental-detail";
import { emptyRentalNotice, unappliedRentalNotice } from "@/lib/rental-display";
import { duplicateListingNotes } from "@/lib/rentals/duplicate-listings";
import { normalizeToolOutput } from "@/platform/maps/normalize-tool-output";
import { parseGroundedToolResult } from "@/lib/parse-grounded-tool-result";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function rentalPinId(listingId: string) {
  return `rental-${listingId}`;
}

function eventPinId(eventId: string) {
  return `event-${eventId}`;
}

function groundedPinId(id: string) {
  return `grounded-${id}`;
}

type GroundedRow = ParsedGroundedToolResult["results"][number];

function groundedRowToBase(row: GroundedRow, rank: number) {
  return {
    pinId: groundedPinId(row.id),
    title: row.title,
    placeId: row.placeId,
    mapsUrl: row.mapsUrl,
    directionsUrl: row.directionsUrl,
    reviewsUrl: row.reviewsUrl,
    rating: row.rating,
    userRatingCount: row.userRatingCount,
    priceLevel: row.priceLevel,
    openNow: row.openNow,
    formattedAddress: row.formattedAddress,
    primaryType: row.primaryType,
    summary: row.summary,
    photoName: row.photoName,
    photoAuthorAttributions: row.photoAuthorAttributions,
    fieldMaskVersion: row.fieldMaskVersion,
    groundingSource: row.groundingSource,
    rank,
  };
}

function toCafeVenueDetail(row: GroundedRow, rank: number): CafeVenueDetail {
  return {
    kind: "cafe",
    ...groundedRowToBase(row, rank),
  };
}

function toNightlifeVenueDetail(
  row: GroundedRow,
  rank: number,
): NightlifeVenueDetail {
  return {
    kind: "nightlife",
    ...groundedRowToBase(row, rank),
  };
}

function useGroundedListScroll(listRef: RefObject<HTMLDivElement | null>) {
  const { selectedPinId } = useMapContext();
  useEffect(() => {
    if (!selectedPinId || !listRef.current) return;
    const card = listRef.current.querySelector(
      `[data-pin-id="${selectedPinId}"]`,
    );
    card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedPinId, listRef]);
}

export function GroundedPlaceResults({ result }: { result: unknown }) {
  const venueKind = readGroundedVenueKind(result);
  if (venueKind === "nightlife") {
    return <GroundedNightlifeResults result={result} />;
  }
  return <GroundedCafeResults result={result} />;
}

export function GroundedNightlifeResults({ result }: { result: unknown }) {
  const { selectedPinId, panToPin } = useMapContext();
  const { openNightlifeDetail, openNightlifeBooking } = useRentalUi();
  const listRef = useRef<HTMLDivElement>(null);
  const { results: rows } = parseGroundedToolResult(result);
  const nightlifeRows = rows.map((r, index) =>
    toNightlifeVenueDetail(r, index + 1),
  );
  const mappedPinIds = new Set(normalizeToolOutput("grounded", result).pins.map((pin) => pin.id));

  useGroundedListScroll(listRef);

  return (
    <>
      <RichCardResultsRegistrar category="grounded" count={rows.length} />
      <ToolPinsSync category="grounded" result={result} />
      {rows.length === 0 ? (
        <EmptyState
          testId="grounded-empty"
          title="No nightlife venues found"
          description="Try salsa bars, rooftop cocktails, or another neighborhood."
        />
      ) : (
        <div ref={listRef} className="flex flex-col gap-2 py-2">
          {nightlifeRows.map((detail) => (
            <CafeResultCard
              key={detail.pinId}
              testId="nightlife-card"
              resultKind="nightlife"
              detailsTestId="nightlife-details-cta"
              bookingTestId="nightlife-booking-cta"
              mediaPlaceholderLabel="Bar"
              pinId={mappedPinIds.has(detail.pinId) ? detail.pinId : undefined}
              rank={detail.rank ?? 1}
              title={detail.title}
              mapsUrl={detail.mapsUrl}
              directionsUrl={detail.directionsUrl}
              reviewsUrl={detail.reviewsUrl}
              rating={detail.rating}
              userRatingCount={detail.userRatingCount}
              priceLevel={detail.priceLevel}
              openNow={detail.openNow}
              primaryType={detail.primaryType}
              summary={detail.summary}
              formattedAddress={detail.formattedAddress}
              photoName={detail.photoName}
              photoAuthorAttributions={detail.photoAuthorAttributions}
              placeId={detail.placeId}
              fieldMaskVersion={detail.fieldMaskVersion}
              groundingSource={detail.groundingSource}
              selected={selectedPinId === detail.pinId}
              onSelect={mappedPinIds.has(detail.pinId) ? () => panToPin(detail.pinId) : undefined}
              onOpenDetails={() =>
                openNightlifeDetail(detail, nightlifeRows)
              }
              onBookRequest={() => openNightlifeBooking(detail)}
            />
          ))}
        </div>
      )}
    </>
  );
}

export function GroundedCafeResults({ result }: { result: unknown }) {
  const { selectedPinId, panToPin } = useMapContext();
  const { openCafeDetail, openCafeBooking } = useRentalUi();
  const listRef = useRef<HTMLDivElement>(null);
  const { results: rows } = parseGroundedToolResult(result);
  const cafeRows = rows.map((r, index) => toCafeVenueDetail(r, index + 1));
  const mappedPinIds = new Set(normalizeToolOutput("grounded", result).pins.map((pin) => pin.id));

  useGroundedListScroll(listRef);

  return (
    <>
      <RichCardResultsRegistrar category="grounded" count={rows.length} />
      <ToolPinsSync category="grounded" result={result} />
      {rows.length === 0 ? (
        <EmptyState
          testId="grounded-empty"
          title="No places found"
          description="Try a different query or area."
        />
      ) : (
        <div ref={listRef} className="flex flex-col gap-2 py-2">
          {cafeRows.map((detail) => (
            <CafeResultCard
              key={detail.pinId}
              testId="grounded-card"
              resultKind="cafe"
              pinId={mappedPinIds.has(detail.pinId) ? detail.pinId : undefined}
              rank={detail.rank ?? 1}
              title={detail.title}
              mapsUrl={detail.mapsUrl}
              directionsUrl={detail.directionsUrl}
              reviewsUrl={detail.reviewsUrl}
              rating={detail.rating}
              userRatingCount={detail.userRatingCount}
              priceLevel={detail.priceLevel}
              openNow={detail.openNow}
              primaryType={detail.primaryType}
              summary={detail.summary}
              formattedAddress={detail.formattedAddress}
              photoName={detail.photoName}
              photoAuthorAttributions={detail.photoAuthorAttributions}
              placeId={detail.placeId}
              fieldMaskVersion={detail.fieldMaskVersion}
              groundingSource={detail.groundingSource}
              selected={selectedPinId === detail.pinId}
              onSelect={mappedPinIds.has(detail.pinId) ? () => panToPin(detail.pinId) : undefined}
              onOpenDetails={() => openCafeDetail(detail, cafeRows)}
              onBookRequest={() => openCafeBooking(detail)}
            />
          ))}
        </div>
      )}
    </>
  );
}

/** Render rental tool results with map actions only for their validated pins. */
export function RentalResults({
  result,
  searchMeta,
}: {
  result: unknown;
  searchMeta?: RentalSearchMeta;
}) {
  const { selectedPinId, panToPin } = useMapContext();
  const { openScheduleViewing, openVenueDetail } = useRentalUi();
  // Nearby is a question on the Concierge thread; broker chat has no such provider.
  const concierge = useOptionalConciergeCoAgent();
  const listRef = useRef<HTMLDivElement>(null);
  const envelope = normalizeToolEnvelope(result);
  const rows = (envelope.results ?? []) as Array<{
    id: string;
    title: string;
    neighborhood: string;
    nightly_price?: number;
    price_monthly?: number;
    /** The listing's own currency; the search envelope already carries it. */
    currency?: string;
    bedrooms?: number;
    bedrooms_unknown?: boolean;
    source_url?: string;
    photo_url?: string;
    image_url?: string;
    amenities?: string[];
    tags?: string[];
    wifi?: boolean;
    availability?: string;
    host_name?: string;
    /** SAN-1349 — server-proven viewing requestability from the search envelope. */
    can_schedule_viewing?: boolean;
    schedule_viewing_url?: string | null;
  }>;
  const unappliedRequests = envelope.unappliedRequests ?? [];
  // With results there are cards to check; with none, only the admission itself is truthful.
  const unappliedNote = rows.length
    ? unappliedRentalNotice(unappliedRequests)
    : undefined;
  const emptyUnappliedNote = rows.length
    ? ""
    : emptyRentalNotice(unappliedRequests);
  const searchParams = searchMeta?.params;
  // Intelligent search ranks a bounded candidate pool; only the structured
  // Supabase count is exact. Never present a candidate count as exhaustive.
  const isNaturalLanguageSearch = Boolean(searchParams?.queryText?.trim());
  const totalMatches = !isNaturalLanguageSearch &&
    typeof envelope.total === "number" &&
    Number.isSafeInteger(envelope.total) && envelope.total >= rows.length
      ? envelope.total : null;
  // Use the same validated tool pins that the map receives; never select a phantom pin.
  const mappedRentalIds = useMemo(
    () => new Set(normalizeToolOutput("rental", result).pins.map((pin) => pin.id)),
    [result],
  );
  // SAN-1235 — the same duplicate rule the /rentals page uses. Two feeds for one home must not
  // look like two apartments in a chat answer, which is exactly what the production envelope did.
  const duplicateNotes = duplicateListingNotes(rows);

  useEffect(() => {
    if (!selectedPinId || !listRef.current) return;
    const card = listRef.current.querySelector(
      `[data-pin-id="${selectedPinId}"]`,
    );
    card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedPinId]);

  return (
    <>
      <RichCardResultsRegistrar category="rental" count={rows.length} />
      <ToolPinsSync category="rental" result={result} />
      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
          data-testid="rental-results-count">
          <span className="text-muted-foreground">
            {totalMatches != null && totalMatches > rows.length
              ? `Showing ${rows.length} of ${totalMatches} matching apartments`
              : isNaturalLanguageSearch
                ? `${rows.length} suggested apartment${rows.length === 1 ? "" : "s"}`
                : `${rows.length} matching apartment${rows.length === 1 ? "" : "s"}`}
          </span>
          <Link href="/rentals" className="font-medium text-primary underline-offset-4 hover:underline"
            data-testid="rental-browse-all-link">
            Browse all apartments
          </Link>
        </div>
      ) : null}
      {rows.length > 0 && envelope.budgetNote ? (
        <p className="text-xs text-muted-foreground" data-testid="rental-budget-comparison-note">
          {envelope.budgetNote}
        </p>
      ) : null}
      {rows.length > 0 && unappliedNote ? (
        // Same sentence the fast path appends, so an agent answer cannot leave a pet or
        // furnishing request undisclosed.
        <p className="text-xs text-muted-foreground" data-testid="rental-unapplied-requests-note">
          {unappliedNote}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          testId="rentals-empty"
          className="mde-map-fab-safe"
          title="No rentals matched"
          description={
            [envelope.budgetNote, emptyUnappliedNote].filter(Boolean).join(" ") ||
            "Try another neighborhood or fewer filters."
          }
          suggestions={[
            { label: "Rentals in Laureles", testId: "rentals-empty-suggest-laureles" },
            { label: "Poblado 2BR", testId: "rentals-empty-suggest-poblado" },
          ]}
        />
      ) : (
        <div ref={listRef} className="flex flex-col gap-2 py-2">
          {rows.map((r, index) => {
          const pinId = rentalPinId(r.id);
          const hasPin = mappedRentalIds.has(pinId);
          // SAN-1504: the complete result, when this row is one, so the panel and phone sheet show
          // monthly price, photos, source and coordinates instead of the reduced pop-up fields.
          const detailRental = toDetailRental(r);
          const openDetail = () => {
            if (hasPin) panToPin(pinId);
            openVenueDetail({
              kind: "rental",
              listingId: r.id,
              pinId,
              pinned: hasPin,
              rental: detailRental ?? undefined,
              title: r.title,
              neighborhood: r.neighborhood,
              nightlyPrice: r.nightly_price,
              bedrooms: r.bedrooms,
              photoUrl: r.photo_url ?? r.image_url,
              amenities: r.amenities,
              availability: r.availability,
              hostName: r.host_name,
              canScheduleViewing: r.can_schedule_viewing === true,
            });
          };
          return (
            <RentalCard
              key={r.id}
              id={pinId}
              pinId={hasPin ? pinId : null}
              listingId={r.id}
              title={r.title}
              neighborhood={r.neighborhood}
              nightly_price={r.nightly_price}
              price_monthly={r.price_monthly}
              currency={r.currency}
              bedrooms={r.bedrooms}
              bedrooms_unknown={r.bedrooms_unknown}
              source_url={r.source_url}
              photoUrl={r.photo_url ?? r.image_url}
              wifi={r.wifi}
              amenities={r.amenities}
              tags={r.tags}
              availability={r.availability}
              duplicateNote={duplicateNotes.get(r.id)}
              featured={index === 0}
              searchParams={searchParams}
              selected={hasPin && selectedPinId === pinId}
              onSelect={hasPin ? () => panToPin(pinId) : undefined}
              // A source-linked ad gets the read-only details when it is a complete rental; the old
              // reduced pop-up never offered it, and still does not.
              onOpenDetails={r.tags?.includes("external-source") && !detailRental ? undefined : openDetail}
              canScheduleViewing={r.can_schedule_viewing === true}
              onSchedule={() =>
                openScheduleViewing({
                  listingId: r.id,
                  title: r.title,
                  neighborhood: r.neighborhood,
                })
              }
              nearbyAction={
                hasPin && concierge && isStoredRentalUuid(r.id)
                  ? <NearbyRentalAction listingId={r.id} pinId={pinId} onSelect={panToPin} />
                  : undefined
              }
            />
          );
        })}
        </div>
      )}
    </>
  );
}

/** Provider-required hooks live only in this child, which is never rendered in deterministic E2E. */
function LiveEventSearchSuggestions({ agent, isReady }: { agent: AbstractAgent; isReady: boolean }) {
  // Use the same event fast path as the chat composer, so clicking a suggestion
  // finishes a real search and updates cards, pins and transcript (not just an agent turn).
  const { handleUserMessage } = useEventSearchFastPath();
  const pendingRef = useRef(false);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const sendQuery = async (query: string) => {
    if (!isReady || agent.isRunning || pendingRef.current) return;
    pendingRef.current = true;
    setSearching(true);
    setFailed(false);
    try {
      if (!(await handleUserMessage(query))) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      pendingRef.current = false;
      setSearching(false);
    }
  };

  return (
    <>
      <EmptyState
        testId="events-empty"
        title="No events found"
        className="mde-map-fab-safe"
        description="Try a different date range or neighborhood."
        suggestions={[
          { label: "Events this weekend", testId: "events-empty-suggest-weekend", disabled: !isReady || agent.isRunning || searching, onClick: () => void sendQuery("Show events this weekend in Medellín") },
          { label: "Salsa in Poblado", testId: "events-empty-suggest-salsa", disabled: !isReady || agent.isRunning || searching, onClick: () => void sendQuery("Show salsa events in El Poblado") },
        ]}
      />
      {searching || !isReady || agent.isRunning ? <p className="text-xs text-muted-foreground">Searching…</p> : null}
      {failed ? <ToolErrorChip testId="events-suggestion-error" message="Couldn't run that search. Please try again." /> : null}
    </>
  );
}

/** The deterministic chat shares this UI but intentionally has no CopilotKitProvider. */
function EventSearchEmptyState() {
  const concierge = useOptionalConciergeCoAgent();
  if (concierge?.agent) {
    return <LiveEventSearchSuggestions agent={concierge.agent} isReady={concierge.isReady} />;
  }
  return (
    <EmptyState
      testId="events-empty"
      title="No events found"
      className="mde-map-fab-safe"
      description="Try a different date range or neighborhood."
      suggestions={[
        { label: "Events this weekend", testId: "events-empty-suggest-weekend", disabled: true },
        { label: "Salsa in Poblado", testId: "events-empty-suggest-salsa", disabled: true },
      ]}
    />
  );
}

type EventResultRow = {
  id: string;
  title: string;
  venue: string;
  neighborhood: string;
  startsAt: string;
  pricePerTicket: number | null;
  canBuyTickets?: boolean;
  ticketUrl?: string;
  currency?: string;
  imageUrl?: string;
  sourceUrl?: string;
};

export function EventResults({ result }: { result: unknown }) {
  const { selectedPinId, panToPin } = useMapContext();
  const { openVenueDetail } = useRentalUi();
  const { setRows, setWebCitations } = useEventSearchResults();
  const isCurrent = useCurrentSearchToolResult();
  const listRef = useRef<HTMLDivElement>(null);
  const raw = unwrapAgUiToolPayload(result);
  const validEnvelope = Boolean(raw) && typeof raw === "object" && !Array.isArray(raw) &&
    Array.isArray((raw as { results?: unknown }).results);
  const envelope = normalizeToolEnvelope(result);
  const reasons = visibleEventSearchReasons(envelope.rankExplanation ?? []);
  const searchUnavailable = !validEnvelope ||
    (envelope.source === "fallback" && (envelope.results?.length ?? 0) === 0);
  // SAN-1422 — an event without trusted coordinates is a usable card with no pin, so it must not
  // pan, select or highlight a map target that does not exist.
  const pinnedIds = useMemo(
    () => new Set(normalizeToolOutput("event", result).pins.map((pin) => pin.id)),
    [result],
  );
  const [selectedEvent, setSelectedEvent] = useState<EventResultRow | null>(null);
  const recoveryHandled = useRef(new Set<string>());
  const openSelectedEventDetail = () => {
    if (!selectedEvent) return;
    const pinId = `event-${selectedEvent.id}`;
    const hasPin = pinnedIds.has(pinId);
    const ticketUrl = selectedEvent.ticketUrl ?? `/events/${encodeURIComponent(selectedEvent.id)}`;
    setSelectedEvent(null);
    if (hasPin) panToPin(pinId);
    openVenueDetail({
      kind: "event",
      eventId: selectedEvent.id,
      pinId,
      title: selectedEvent.title,
      neighborhood: selectedEvent.neighborhood,
      venue: selectedEvent.venue,
      startsAt: selectedEvent.startsAt,
      pricePerTicket: selectedEvent.pricePerTicket,
      currency: selectedEvent.currency,
      canBuyTickets: selectedEvent.canBuyTickets === true,
      imageUrl: selectedEvent.imageUrl,
      ticketUrl,
      sourceUrl: selectedEvent.sourceUrl,
    });
  };

  const rows = (envelope.results ?? []) as Array<{
    id: string;
    title: string;
    venue: string;
    neighborhood: string;
    startsAt: string;
    pricePerTicket: number | null;
    canBuyTickets?: boolean;
    ticketUrl?: string;
    currency?: string;
    imageUrl?: string;
    sourceUrl?: string;
  }>;
  const rowsRef = useRef<EventResultRow[]>([]);
  useEffect(() => {
    rowsRef.current = (envelope.results ?? []) as EventResultRow[];
  }, [envelope.results]);

  useEffect(() => {
    // Historical EventResults stay mounted. Only the current result set may
    // recover, otherwise one event opens duplicate Quick view dialogs.
    if (!isCurrent) return;
    let recoveryTimer: number | undefined;
    /**
     * Open Quick view for an explicitly requested event and REPORT whether it opened.
     *
     * The caller used to show "Here is the event card." before this ran, so a request
     * that could not open anything still confirmed success. Every path now answers with
     * `mde:event-card-recovery-result`, and the caller only confirms on `opened: true`.
     */
    const onRecovery = (event: Event) => {
      const detail = (event as CustomEvent<{ eventId?: unknown; requestId?: unknown }>).detail ?? {};
      const eventId = typeof detail.eventId === "string" ? detail.eventId : null;
      const requestId = typeof detail.requestId === "string" ? detail.requestId : null;

      const answer = (opened: boolean) => {
        window.dispatchEvent(
          new CustomEvent("mde:event-card-recovery-result", {
            detail: { eventId, requestId, opened },
          }),
        );
      };

      if (!eventId) return answer(false);
      // Deduplicate the SAME request, not the same event: a repeated "show the first
      // event as a card" is a new request and must open again.
      const key = requestId ?? eventId;
      if (recoveryHandled.current.has(key)) return answer(false);
      const row = rowsRef.current.find((value) => value.id === eventId);
      if (!row) return answer(false);

      // Scope the "already rendered" check to THIS event: another event's card must not
      // suppress this one.
      const renderedSelector = `[data-testid="a2ui-event-card"][data-event-id="${eventId}"]`;
      /**
       * Which existing card satisfies this request?
       *
       * A request-scoped call knows the event it asked for, so only that event's card
       * counts. A LEGACY call (no requestId) cannot know which event the model answered
       * with, so any rendered card satisfies it — otherwise a model card for event #3
       * would be followed by a Quick view for event #1.
       */
      const existingCard = () =>
        requestId
          ? document.querySelector<HTMLElement>(renderedSelector)
          : document.querySelector<HTMLElement>('[data-testid="a2ui-event-card"]');
      const alreadyRendered = existingCard();
      if (alreadyRendered) {
        alreadyRendered.scrollIntoView({ block: "nearest", behavior: "smooth" });
        return answer(true);
      }

      window.clearTimeout(recoveryTimer);
      recoveryTimer = window.setTimeout(() => {
        const settledCard = existingCard();
        if (settledCard) {
          settledCard.scrollIntoView({ block: "nearest", behavior: "smooth" });
          return answer(true);
        }
        recoveryHandled.current.add(key);
        setSelectedEvent(row as EventResultRow);
        answer(true);
      }, 500);
    };
    window.addEventListener("mde:event-card-recovery", onRecovery);
    return () => {
      window.removeEventListener("mde:event-card-recovery", onRecovery);
      window.clearTimeout(recoveryTimer);
    };
  }, [isCurrent]);

  useEffect(() => {
    if (!isCurrent) return;
    const parsed = normalizeToolEnvelope(result);
    const list = (parsed.results ?? []) as Array<{
      id: string;
      title: string;
      venue?: string;
      neighborhood?: string;
      startsAt: string;
      pricePerTicket?: number | null;
      currency?: string;
      canBuyTickets?: boolean;
      ticketUrl?: string;
      imageUrl?: string;
      sourceUrl?: string;
      mapsUrl?: string | null;
    }>;
    const validCitations = (parsed.webGrounding?.citations ?? []).filter(
      (c): c is { title: string; url: string; snippet?: string | null } =>
        typeof c.url === "string" &&
        c.url.startsWith("http") &&
        typeof c.title === "string",
    );
    if (list.length === 0) {
      setRows([]);
      setWebCitations(validCitations);
      return;
    }
    setRows(
      list.map((e) => ({
        id: e.id,
        title: e.title,
        venue: e.venue ?? "Medellín",
        neighborhood: e.neighborhood ?? "Medellín",
        startsAt: e.startsAt,
        pricePerTicket: e.pricePerTicket ?? null,
        currency: e.currency,
        canBuyTickets: e.canBuyTickets,
        ticketUrl: e.ticketUrl,
        imageUrl: e.imageUrl,
        sourceUrl: e.sourceUrl ?? e.mapsUrl ?? undefined,
      })),
    );
    setWebCitations(validCitations);
  }, [result, setRows, setWebCitations, isCurrent]);

  useEffect(() => {
    if (!selectedPinId || !listRef.current) return;
    const card = listRef.current.querySelector(
      `[data-pin-id="${selectedPinId}"]`,
    );
    card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedPinId]);

  return (
    <>
      <RichCardResultsRegistrar category="event" count={rows.length} />
      <ToolPinsSync category="event" result={result} />
      {rows.length > 0 && reasons.length > 0 ? (
        <div
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          data-testid="rank-explanation-event"
        >
          <p className="font-medium text-foreground">Why these events</p>
          <ul className="mt-1 list-inside list-disc">
            {reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </div>
      ) : null}
      {searchUnavailable ? (
        <ToolErrorChip
          testId="events-search-error"
          message="Event search is temporarily unavailable. Please try again."
        />
      ) : rows.length === 0 ? (
        <EventSearchEmptyState />
      ) : (
        <div ref={listRef} className="flex flex-col gap-2 py-2">
          {rows.map((e) => {
          const pinId = eventPinId(e.id);
          const hasPin = pinnedIds.has(pinId);
          const ticketUrl = e.ticketUrl ?? `/events/${e.id}`;
          const selectOnMap = () => {
            if (hasPin) panToPin(pinId);
          };
          const openDetail = () => {
            selectOnMap();
            openVenueDetail({
              kind: "event",
              eventId: e.id,
              pinId,
              title: e.title,
              neighborhood: e.neighborhood,
              venue: e.venue,
              startsAt: e.startsAt,
              pricePerTicket: e.pricePerTicket,
              currency: e.currency,
              canBuyTickets: e.canBuyTickets === true,
              imageUrl: e.imageUrl,
              ticketUrl,
            });
          };
          return (
            <div key={e.id} className="flex flex-col gap-1">
              <EventCard
                id={pinId}
                eventId={e.id}
                title={e.title}
                venue={e.venue}
                neighborhood={e.neighborhood}
                startsAt={e.startsAt}
                pricePerTicket={e.pricePerTicket}
                canBuyTickets={e.canBuyTickets === true}
                currency={e.currency}
                imageUrl={e.imageUrl}
                ticketUrl={ticketUrl}
                sourceUrl={e.sourceUrl}
                selected={hasPin && selectedPinId === pinId}
                onSelect={selectOnMap}
                onOpenDetails={openDetail}
              />
              <button
                type="button"
                data-testid="event-show-card"
                className="min-h-11 self-start rounded-md border border-border px-3 text-xs"
                onClick={() => setSelectedEvent(e as EventResultRow)}
              >
                Quick view
              </button>
            </div>
          );
        })}
        </div>
      )}
      {envelope.webGrounding &&
      ((envelope.webGrounding.citations?.length ?? 0) > 0 ||
        envelope.webGrounding.metadata?.reason) ? (
        <WebCitationList
          citations={
            (envelope.webGrounding.citations ?? []) as Array<{
              title: string;
              url: string;
              snippet?: string | null;
            }>
          }
          reason={
            typeof envelope.webGrounding.metadata?.reason === "string"
              ? envelope.webGrounding.metadata.reason
              : null
          }
        />
      ) : null}
      <Dialog open={Boolean(selectedEvent)} onOpenChange={(open) => { if (!open) setSelectedEvent(null); }}>
        <DialogContent className="max-w-md p-3" data-testid="event-card-modal">
          <DialogHeader className="sr-only">
            <DialogTitle>{selectedEvent?.title ?? "Event card"}</DialogTitle>
          </DialogHeader>
          {selectedEvent ? (
            <EventCard
              id={`event-${selectedEvent.id}`}
              eventId={selectedEvent.id}
              title={selectedEvent.title}
              venue={selectedEvent.venue}
              neighborhood={selectedEvent.neighborhood}
              startsAt={selectedEvent.startsAt}
              pricePerTicket={selectedEvent.pricePerTicket}
              canBuyTickets={selectedEvent.canBuyTickets === true}
              currency={selectedEvent.currency}
              imageUrl={selectedEvent.imageUrl}
              ticketUrl={selectedEvent.ticketUrl ?? `/events/${encodeURIComponent(selectedEvent.id)}`}
              sourceUrl={selectedEvent.sourceUrl}
              onOpenDetails={openSelectedEventDetail}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RestaurantResults({ result }: { result: unknown }) {
  return (
    <DomainResults
      category="restaurant"
      result={result}
      testId="restaurant-card"
    />
  );
}

export function AttractionResults({ result }: { result: unknown }) {
  return (
    <DomainResults
      category="attraction"
      result={result}
      testId="attraction-card"
    />
  );
}
