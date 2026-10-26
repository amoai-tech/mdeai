"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
import { ToolErrorChip } from "@/components/copilot/tool-error-chip";
import { CafeResultCard } from "@/components/copilot/cafe-result-card";
import { RentalCard } from "@/components/copilot/rental-card";
import type { RentalSearchMeta } from "@/components/chat/rental-fast-path-context";
import { EventCard } from "@/components/copilot/event-card";
import { DomainResults } from "@/components/copilot/domain-results";
import { ToolPinsSync } from "@/components/copilot/tool-pins-sync";
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
import { normalizeToolOutput } from "@/platform/maps/normalize-tool-output";
import { parseGroundedToolResult } from "@/lib/parse-grounded-tool-result";

const CUSTOMER_VISIBLE_RENTAL_RANK_FACTORS = new Set([
  "hybrid_semantic",
  "neighborhood_profile",
  "neighborhood",
  "digital_nomad_score",
]);

export function filterCustomerVisibleRentalRankExplanation<
  T extends { factor: string },
>(entries: T[]): T[] {
  return entries.filter((entry) =>
    CUSTOMER_VISIBLE_RENTAL_RANK_FACTORS.has(entry.factor),
  );
}

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
              pinId={detail.pinId}
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
              onSelect={() => panToPin(detail.pinId)}
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
              pinId={detail.pinId}
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
              onSelect={() => panToPin(detail.pinId)}
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
  const rankExplanation = filterCustomerVisibleRentalRankExplanation(
    envelope.rankExplanation ?? [],
  );
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
      {rows.length > 0 && rankExplanation.length > 0 ? (
        <div
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          data-testid="rank-explanation-rental"
        >
          <p className="font-medium text-foreground">Why these rentals</p>
          <ul className="mt-1 list-inside list-disc">
            {rankExplanation.map((entry) => (
              <li key={`${entry.factor}-${entry.note}`}>
                {entry.factor}: {entry.note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          testId="rentals-empty"
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
            />
          );
        })}
        </div>
      )}
    </>
  );
}

/** Real follow-up actions for empty event results, using the existing Concierge agent. */
function EventSearchEmptyState() {
  const { agent, isReady } = useAgent({ agentId: "conciergeAgent" });
  const { copilotkit } = useCopilotKit();
  const [failed, setFailed] = useState(false);
  const sendQuery = async (query: string) => {
    if (!isReady || agent.isRunning) return;
    setFailed(false);
    try {
      agent.addMessage({ id: crypto.randomUUID(), role: "user", content: query });
      await copilotkit.runAgent({ agent });
    } catch {
      setFailed(true);
    }
  };
  return (
    <>
      <EmptyState
        testId="events-empty"
        title="No events found"
        description="Try a different date range or neighborhood."
        suggestions={[
          { label: "Events this weekend", testId: "events-empty-suggest-weekend", disabled: !isReady || agent.isRunning, onClick: () => void sendQuery("Show events this weekend in Medellín") },
          { label: "Salsa in Poblado", testId: "events-empty-suggest-salsa", disabled: !isReady || agent.isRunning, onClick: () => void sendQuery("Show salsa events in El Poblado") },
        ]}
      />
      {!isReady || agent.isRunning ? <p className="text-xs text-muted-foreground">Searching…</p> : null}
      {failed ? <ToolErrorChip testId="events-suggestion-error" message="Couldn't run that search. Please try again." /> : null}
    </>
  );
}

export function EventResults({ result }: { result: unknown }) {
  const { selectedPinId, panToPin } = useMapContext();
  const { openVenueDetail } = useRentalUi();
  const { setRows, setWebCitations } = useEventSearchResults();
  const listRef = useRef<HTMLDivElement>(null);
  const raw = unwrapAgUiToolPayload(result);
  const validEnvelope = !!raw && typeof raw === "object" && !Array.isArray(raw) &&
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
  const rows = (envelope.results ?? []) as Array<{
    id: string;
    title: string;
    venue: string;
    neighborhood: string;
    startsAt: string;
    pricePerTicket: number;
    currency?: string;
    imageUrl?: string;
    sourceUrl?: string;
  }>;

  useEffect(() => {
    const parsed = normalizeToolEnvelope(result);
    const list = (parsed.results ?? []) as Array<{
      id: string;
      title: string;
      venue?: string;
      neighborhood?: string;
      startsAt: string;
      pricePerTicket?: number;
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
        pricePerTicket: e.pricePerTicket ?? 0,
        imageUrl: e.imageUrl,
        sourceUrl: e.sourceUrl ?? e.mapsUrl ?? undefined,
      })),
    );
    setWebCitations(validCitations);
  }, [result, setRows, setWebCitations]);

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
          const ticketUrl = `/events/${e.id}`;
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
              imageUrl: e.imageUrl,
              ticketUrl,
            });
          };
          return (
            <EventCard
              key={e.id}
              id={pinId}
              eventId={e.id}
              title={e.title}
              venue={e.venue}
              neighborhood={e.neighborhood}
              startsAt={e.startsAt}
              pricePerTicket={e.pricePerTicket}
              currency={e.currency}
              imageUrl={e.imageUrl}
              ticketUrl={ticketUrl}
              sourceUrl={e.sourceUrl}
              selected={hasPin && selectedPinId === pinId}
              onSelect={selectOnMap}
              onOpenDetails={openDetail}
            />
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
