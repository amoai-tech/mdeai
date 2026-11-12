"use client";

import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { useGroundedSearchFastPath } from "@/hooks/use-grounded-search-fast-path";
import { useSession } from "@/hooks/use-session";
import { isStoredRentalUuid } from "@/lib/cafe-search-fast-path";
import { useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";
import { useOptionalEventLocalChat } from "@/components/chat/event-local-chat-context";
import { createGenerativeUI, standardUI } from "@copilotkit/react-core/v2/generative-ui";
import { RentalCard as ExistingRentalCard } from "@/components/copilot/rental-card";
import { EventCard as ExistingEventCard } from "@/components/copilot/event-card";
import { useOptionalEventBrowseSelection } from "@/components/events/event-browse-selection-context";
import { useOptionalConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { useOptionalRentalUi } from "@/components/chat/rental-ui-context";
import { useOptionalMapContext } from "@/platform/maps/map-context";
import { useOptionalRentalFastPath } from "@/components/chat/rental-fast-path-context";
import { useOptionalEventFastPath } from "@/components/chat/event-fast-path-context";
import { RENTAL_BED_OPTIONS, normalizeBedSelection, useRentalFilterStore } from "@/components/rentals/rental-filter-draft";
import { EVENT_A2UI_ID_PATTERN } from "@/lib/events/a2ui-id";
import { isFinishedToolPayload, normalizeToolEnvelope } from "@/lib/normalize-tool-envelope";
import { toDetailRental } from "@/lib/rentals/chat-rental-detail";
import {
  MASTRA_COPILOT_TOOL_ACTIONS,
  MASTRA_TOOL_IDS,
} from "@/platform/copilot/mastra-tool-action-names";
import type { RentalResultRow } from "@/lib/rental-display";

type RentalToolRow = RentalResultRow & {
  photo_url?: string;
  image_url?: string;
  can_schedule_viewing?: boolean;
};

const rentalToolNames = new Set<string>([
  MASTRA_COPILOT_TOOL_ACTIONS.rentals,
  MASTRA_TOOL_IDS.rentals,
]);

const eventToolNames = new Set<string>([
  MASTRA_COPILOT_TOOL_ACTIONS.events,
  MASTRA_TOOL_IDS.events,
]);

type RentalMessage = {
  role?: string;
  toolCallId?: string;
  content?: unknown;
  toolCalls?: Array<{ id?: string; function?: { name?: string } }>;
};

function toolNameByCallId(messages: readonly RentalMessage[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const call of message.toolCalls ?? []) {
      if (call.id && call.function?.name) names.set(call.id, call.function.name);
    }
  }
  return names;
}

/**
 * Every finished rental result on this agent thread, newest first. A card must
 * survive a later search; using only the newest result broke every earlier card.
 * This is thread-local, so it cannot read another conversation's results.
 */
export function collectRentalResults(messages: readonly RentalMessage[]): unknown[] {
  const names = toolNameByCallId(messages);
  const results: unknown[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "tool" || !message.toolCallId) continue;
    if (!rentalToolNames.has(names.get(message.toolCallId) ?? "")) continue;
    if (!isFinishedToolPayload(message.content, { rowArray: true })) continue;
    results.push(message.content);
  }
  return results;
}

/** Prefer the concierge context, then fall back to the active CopilotKit agent (broker chat). */
export function selectRentalMessages(
  conciergeMessages: readonly RentalMessage[] | undefined,
  agentMessages: readonly RentalMessage[] | undefined,
): readonly RentalMessage[] {
  return conciergeMessages?.length ? conciergeMessages : agentMessages ?? [];
}

/** Canonical public details page, used where the chat owns no detail sheet (broker/Ask MDE). */
export function rentalDetailHref(listingId: string): string {
  return `/rentals/${encodeURIComponent(listingId)}`;
}

/** Canonical event details page when the chat owns no event sheet. */
export function eventDetailHref(eventId: string): string {
  return `/events/${encodeURIComponent(eventId)}`;
}

export type EventToolRow = {
  id: string;
  title: string;
  venue: string;
  neighborhood: string;
  startsAt: string;
  pricePerTicket: number | null;
  canBuyTickets?: boolean;
  currency?: string;
  imageUrl?: string;
  ticketUrl?: string;
  sourceUrl?: string;
};

/** Every finished event result on this thread, newest first. */
export function collectEventResults(messages: readonly RentalMessage[]): unknown[] {
  const names = toolNameByCallId(messages);
  const results: unknown[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "tool" || !message.toolCallId) continue;
    if (!eventToolNames.has(names.get(message.toolCallId) ?? "")) continue;
    if (!isFinishedToolPayload(message.content, { rowArray: true })) continue;
    results.push(message.content);
  }
  return results;
}

export function selectEventMessages(
  conciergeMessages: readonly RentalMessage[] | undefined,
  agentMessages: readonly RentalMessage[] | undefined,
): readonly RentalMessage[] {
  return selectRentalMessages(conciergeMessages, agentMessages);
}

/** Fast-path results are newest-first; keep agent results after them, deduped. */
export function mergeEventResults(
  fastPathResults: readonly unknown[],
  agentResults: readonly unknown[],
): unknown[] {
  return [...fastPathResults, ...agentResults].filter(
    (result, index, all) => all.indexOf(result) === index,
  );
}

/** Resolve an event UUID only from real event results on this thread. */
export function findEventRow(
  results: readonly unknown[],
  eventId: string,
): EventToolRow | null {
  if (!EVENT_A2UI_ID_PATTERN.test(eventId)) return null;
  for (const result of results) {
    const rows = (normalizeToolEnvelope(result).results ?? []) as EventToolRow[];
    const row = rows.find((candidate) => candidate.id === eventId);
    if (row) return row;
  }
  return null;
}

/** Fast-path results are newest-first; keep agent results after them, deduped by identity. */
export function mergeRentalResults(
  fastPathResults: readonly unknown[],
  agentResults: readonly unknown[],
): unknown[] {
  return [...fastPathResults, ...agentResults].filter(
    (result, index, all) => all.indexOf(result) === index,
  );
}

/** Resolve an opaque id only from real rental results on this thread. */
export function findRentalRow(
  results: readonly unknown[],
  listingId: string,
): RentalToolRow | null {
  for (const result of results) {
    const rows = (normalizeToolEnvelope(result).results ?? []) as RentalToolRow[];
    const row = rows.find((candidate) => candidate.id === listingId);
    if (row) return row;
  }
  return null;
}

function useRentalMessages(): readonly RentalMessage[] {
  const concierge = useOptionalConciergeCoAgent();
  // Broker chat mounts ChatProvider without ConciergeCoAgentProvider; the
  // active CopilotKit agent is still the same conciergeAgent.
  const { agent } = useAgent({
    agentId: "conciergeAgent",
    updates: [UseAgentUpdate.OnMessagesChanged],
  });
  return selectRentalMessages(
    concierge?.agent?.messages as RentalMessage[] | undefined,
    agent?.messages as RentalMessage[] | undefined,
  );
}

function useRentalRow(listingId: string): RentalToolRow | null {
  const messages = useRentalMessages();
  const fastPath = useOptionalRentalFastPath();
  const fromAgent = collectRentalResults(messages);
  const fromFastPath = fastPath?.toolResults ?? (fastPath?.toolResult ? [fastPath.toolResult] : []);
  return findRentalRow(mergeRentalResults(fromFastPath, fromAgent), listingId);
}

/**
 * Nearby is a question on the current CopilotKit thread, not a second Places
 * client. This child is mounted only under a ConciergeCoAgentProvider;
 * broker chat deliberately has no such provider.
 */
export function NearbyRentalAction({
  listingId, pinId, onSelect,
}: {
  listingId: string;
  pinId: string;
  onSelect?: (_pinId: string) => void;
}) {
  const { searchNearbyRental } = useGroundedSearchFastPath();
  const { user, loading } = useSession();
  const { agent } = useAgent({ agentId: "conciergeAgent", updates: [UseAgentUpdate.OnRunStatusChanged] });
  const agentRunning = Boolean(agent?.isRunning);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  if (loading || !user || user.is_anonymous) return null;

  return (
    <>
    <Button
      type="button"
      size="sm"
      variant="outline"
      data-testid="rental-nearby-cta"
      className="min-h-card-action lg:min-h-0"
      disabled={pending || agentRunning}
      // Keep Enter/Space on the button from bubbling to the card's key handler,
      // which would open Details instead of starting Nearby.
      onKeyDown={(event) => event.stopPropagation()}
      onClick={async (event) => {
        event.stopPropagation();
        if (pending || agentRunning) return;
        setPending(true);
        setError(false);
        try {
          onSelect?.(pinId);
          // One grounded Nearby path; server resolves RLS-authorized rental coordinates.
          const started = await searchNearbyRental(listingId);
          if (!started) setError(true);
        } catch {
          setError(true);
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? "Finding cafés…" : "Show nearby cafés"}
    </Button>
    {error ? <span role="alert" className="text-xs text-destructive">Nearby search did not start. Try again.</span> : null}
    </>
  );
}

/** One existing rental card, hydrated only from the current authorized tool result. */
function MdeRentalCard({ listingId }: { listingId: string }) {
  const row = useRentalRow(listingId);
  const map = useOptionalMapContext();
  const rentalUi = useOptionalRentalUi();
  const concierge = useOptionalConciergeCoAgent();
  // Nearby needs the event-local chat stack (it starts a grounded search through
  // it). The Rentals page renders these cards without that stack, where mounting
  // it would throw and the renderer would show a fallback instead of the card.
  const canRenderNearby = Boolean(useOptionalEventLocalChat());
  const selectedPinId = map?.selectedPinId;
  const panToPin = map?.panToPin;
  const openVenueDetail = rentalUi?.openVenueDetail;
  const openScheduleViewing = rentalUi?.openScheduleViewing;

  // Only a pin that is really on the current map may be selected/highlighted.
  // A historical card after a newer search stays usable in Details, without
  // claiming a pin that the newer search removed.
  const hasPin = map?.pins.some((pin) => pin.id === `rental-${listingId}`) ?? false;

  if (!row) {
    return (
      <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground" data-testid="a2ui-rental-unavailable">
        That rental is not in the current authorized results.
      </div>
    );
  }

  const pinId = `rental-${row.id}`;
  const detailRental = toDetailRental(row);
  const openDetail = openVenueDetail ? () => {
    if (hasPin) panToPin?.(pinId);
    openVenueDetail({
      kind: "rental",
      listingId: row.id,
      pinId,
      pinned: hasPin,
      rental: detailRental ?? undefined,
      title: row.title,
      neighborhood: row.neighborhood,
      nightlyPrice: row.nightly_price,
      bedrooms: row.bedrooms,
      photoUrl: row.photo_url ?? row.image_url,
      amenities: row.amenities,
      availability: row.availability,
      hostName: row.host_name,
      canScheduleViewing: row.can_schedule_viewing === true,
    });
  } : () => {
    // Broker chat and the Ask MDE sheet have no rental detail provider. Reuse
    // the canonical public details page instead of mounting a second sheet.
    window.open(rentalDetailHref(row.id), "_blank", "noopener,noreferrer");
  };

  return (
    <div data-testid="a2ui-rental-card" data-listing-id={row.id}>
      <ExistingRentalCard
        id={pinId}
        pinId={hasPin ? pinId : null}
        listingId={row.id}
        title={row.title}
        neighborhood={row.neighborhood}
        nightly_price={row.nightly_price}
        price_monthly={row.price_monthly}
        currency={row.currency}
        bedrooms={row.bedrooms}
        bedrooms_unknown={row.bedrooms_unknown}
        source_url={row.source_url}
        photoUrl={row.photo_url ?? row.image_url}
        wifi={row.wifi}
        amenities={row.amenities}
        tags={row.tags}
        availability={row.availability}
        selected={hasPin && selectedPinId === pinId}
        onSelect={hasPin ? () => panToPin?.(pinId) : undefined}
        onOpenDetails={row.tags?.includes("external-source") && !detailRental ? undefined : openDetail}
        nearbyAction={hasPin && concierge && canRenderNearby && isStoredRentalUuid(row.id) ? <NearbyRentalAction listingId={row.id} pinId={pinId} onSelect={panToPin} /> : undefined}
        canScheduleViewing={row.can_schedule_viewing === true}
        onSchedule={openScheduleViewing ? () => openScheduleViewing({
          listingId: row.id,
          title: row.title,
          neighborhood: row.neighborhood,
        }) : undefined}
      />
    </div>
  );
}

function useEventRow(eventId: string): EventToolRow | null {
  const messages = useRentalMessages();
  const fastPath = useOptionalEventFastPath();
  const fromAgent = collectEventResults(messages);
  const fromFastPath = fastPath?.toolResults ?? (fastPath?.toolResult ? [fastPath.toolResult] : []);
  return findEventRow(mergeEventResults(fromFastPath, fromAgent), eventId);
}

/** One existing event card, hydrated only from authorized event results. */
function MdeEventCard({ eventId }: { eventId: string }) {
  const row = useEventRow(eventId);
  const map = useOptionalMapContext();
  const rentalUi = useOptionalRentalUi();
  const selectedPinId = map?.selectedPinId;
  const panToPin = map?.panToPin;
  const openVenueDetail = rentalUi?.openVenueDetail;
  // The Events page publishes its own selection; the rental UI context does not
  // exist there, so without this fallback the Details button would be a no-op.
  const eventSelection = useOptionalEventBrowseSelection();

  if (!row) {
    return (
      <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground" data-testid="a2ui-event-unavailable">
        That event is not in the current authorized results.
      </div>
    );
  }

  const pinId = `event-${row.id}`;
  const hasPin = map?.pins.some((pin) => pin.id === pinId) ?? false;
  const ticketUrl = row.ticketUrl ?? eventDetailHref(row.id);
  const openDetail = eventSelection
    ? () => {
        // The Events grid can show native Details only for its current rows.
        // Older authorized results still have a canonical public Details page.
        if (!eventSelection.openEventDetail(row.id)) {
          window.open(eventDetailHref(row.id), "_blank", "noopener,noreferrer");
        }
      }
    : openVenueDetail ? () => {
    if (hasPin) panToPin?.(pinId);
    openVenueDetail({
      kind: "event",
      eventId: row.id,
      pinId,
      title: row.title,
      neighborhood: row.neighborhood,
      venue: row.venue,
      startsAt: row.startsAt,
      pricePerTicket: row.pricePerTicket,
      currency: row.currency,
      canBuyTickets: row.canBuyTickets === true,
      imageUrl: row.imageUrl,
      ticketUrl,
      sourceUrl: row.sourceUrl,
    });
  } : undefined;

  return (
    <div data-testid="a2ui-event-card" data-event-id={row.id}>
      <ExistingEventCard
        id={pinId}
        eventId={row.id}
        title={row.title}
        venue={row.venue}
        neighborhood={row.neighborhood}
        startsAt={row.startsAt}
        pricePerTicket={row.pricePerTicket}
        canBuyTickets={row.canBuyTickets === true}
        currency={row.currency}
        imageUrl={row.imageUrl}
        ticketUrl={ticketUrl}
        sourceUrl={row.sourceUrl}
        detailsHref={openDetail ? undefined : eventDetailHref(row.id)}
        selected={hasPin && selectedPinId === pinId}
        onSelect={hasPin ? () => panToPin?.(pinId) : undefined}
        onOpenDetails={openDetail}
      />
    </div>
  );
}

/**
 * SAN-1655 — the bedroom control the agent may render on the Rentals panel.
 *
 * The standard `Select` cannot carry a user edit: `writable` is a catalog
 * definition field and the installed standard definition does not declare it,
 * while `overrides` only replaces the renderer. This component therefore owns
 * the small wrapper around MDE's own markup. The value lives in the page's
 * draft, not in the model's payload, so a later AI turn cannot reset it.
 */
function MdeBedroomFilter({ label }: { label?: string }) {
  const draft = useRentalFilterStore();
  // The catalog also renders outside the Rentals page; there the value could
  // never be applied, so do not offer it.
  if (!draft.connected) return null;
  return (
    <label className="flex w-full flex-col gap-1 text-sm">
      <span className="font-medium text-foreground">{label ?? "Bedrooms"}</span>
      <select
        aria-label={label ?? "Bedrooms"}
        className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        value={draft.draft.beds ?? ""}
        onChange={(event) => draft.setBeds(normalizeBedSelection(event.target.value))}
      >
        {RENTAL_BED_OPTIONS.map((option) => (
          <option key={option.label} value={option.value ?? ""}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

/** SAN-1655 — Apply goes through the page's real filter action, never a new service. */
function MdeApplyFilters({
  label,
  onApplyRentalFilters,
}: {
  label?: string;
  onApplyRentalFilters?: () => void;
}) {
  const draft = useRentalFilterStore();
  // No page draft and no registered action means nothing could be applied: show
  // the control disabled with the reason instead of a dead click.
  const ready = Boolean(draft.connected && onApplyRentalFilters);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        disabled={!ready}
        title={ready ? undefined : "Filters are not connected on this page."}
        onClick={() => onApplyRentalFilters?.()}
      >
        {label ?? "Apply filters"}
      </Button>
      {draft?.applyError ? (
        <p role="alert" className="text-xs text-destructive">{draft.applyError}</p>
      ) : null}
    </div>
  );
}

/**
 * SAN-1654 — the official Standard Catalog is the base of MDE's one catalog, so
 * the agent can arrange and label real cards instead of only ever rendering one.
 *
 * The kept vocabulary is deliberately tiny and is documented prop-by-prop in
 * the server guide (`src/mastra/lib/generative-ui-context.ts`). The model does
 * not receive the upstream component schemas: MDE builds its own guide from a
 * presence flag, so a component the guide does not document is a component the
 * model would have to guess at. Two consequences:
 *
 * - **Controls are omitted until they are wired.** Button, Pressable and every
 *   input (Form, TextField, Select, CheckBox, Radio, Slider, DateTimeInput,
 *   SegmentedControl, ChoicePicker, Tabs) render a dead control when no
 *   catalog function is registered: a fake "Book viewing" next to real
 *   listings. RentalCard already owns grounded Details and viewing actions.
 *   SAN-1655/SAN-1658 add these back together with their functions.
 * - **Table is exposed for short, tool-grounded comparisons** using its
 *   columns/rows data form, documented in the server guide. TableSection,
 *   TableRow and TableCell stay omitted: the data form does not need them.
 *   Charts and maps need peer libraries MDE does not install, HtmlView/Svg
 *   would let the model author markup, and Image/Link/Citation would accept
 *   model-chosen URLs.
 *
 * Every omitted name must still exist in the installed `standardUI`, and the
 * exposed set must equal exactly what the guide documents — both enforced by
 * `mde-ui-catalog.test.ts`, so an SDK upgrade cannot silently drift.
 */
export const MDE_OMITTED_STANDARD_COMPONENTS = [
  // Optional peer libraries MDE does not ship (chart.js, maplibre-gl, lucide).
  "Chart",
  "Icon",
  "Map",
  // Model-authored markup or model-chosen URLs.
  "HtmlView",
  "Svg",
  "Image",
  "ImageGrid",
  "Link",
  "LinkCard",
  "Citation",
  // Controls with no registered catalog function yet (SAN-1655 / SAN-1658).
  "Button",
  "Pressable",
  "Form",
  "TextField",
  "TextArea",
  "Select",
  "CheckBox",
  "Radio",
  "RadioGroup",
  "Slider",
  "DateTimeInput",
  "SegmentedControl",
  "ChoicePicker",
  "Tabs",
  // Nested data structures the guide does not teach yet.
  "TableSection",
  "TableRow",
  "TableCell",
  "List",
  "ListItem",
  "EntityCard",
  // Media, overlay and typographic ornament with no discovery answer behind it.
  "AudioPlayer",
  "Blockquote",
  "Bold",
  "Carousel",
  "CarouselItem",
  "CarouselMediaItem",
  "Code",
  "Favicon",
  "FlashcardFlip",
  "Flow",
  "FlowItem",
  "Italic",
  "Markdown",
  "Math",
  "Modal",
  "Popover",
  "PopoverContent",
  "PopoverTrigger",
  "PulseIndicator",
  "ShimmerText",
  "Strikethrough",
  "Tooltip",
  "Underline",
  "Video",
] as const;

export const mdeUI = createGenerativeUI({
  id: "mde/discovery@1",
  extends: [standardUI.omit(MDE_OMITTED_STANDARD_COMPONENTS)],
  // Live page filters, published read-only for the model. The editable draft
  // lives in the page provider so the agent can never overwrite a user's edit.
  state: {
    rentalFilters: z.object({ beds: z.string().nullable() }),
  },
  // Renderer-only action: the page decides what "apply" means.
  functions: {
    applyRentalFilters: { parameters: z.object({}) },
  },
  components: {
    RentalCard: {
      component: MdeRentalCard,
      description:
        "Show one real rental from the current authorized search by its listingId. The component resolves price, location, source and viewing authority from the stored result; never pass or invent listing facts.",
      props: z.object({ listingId: z.string().min(1) }),
      // Gemini often adds an empty `children: []` to a card node. Accept that
      // harmless shape so a valid card is not rejected; this component renders
      // no child content of its own.
      slots: { children: "multiple" },
    },
    EventCard: {
      component: MdeEventCard,
      description:
        "Show one real event from the current authorized search by its eventId UUID. The component resolves venue, date, price, image and ticket link from the stored result; never pass or invent event facts.",
      props: z.object({ eventId: z.string().regex(EVENT_A2UI_ID_PATTERN) }),
      slots: { children: "multiple" },
    },
    BedroomFilter: {
      component: MdeBedroomFilter,
      description:
        "A bedroom-count selector for the Rentals page. Render it when the renter asks to adjust or choose bedrooms. The value is the renter's draft (Any, Studio, 1 BR, 2 BR, 3 BR+); it changes the page only when Apply filters is pressed.",
      props: z.object({ label: z.string().optional() }),
    },
    ApplyFiltersButton: {
      component: MdeApplyFilters,
      description:
        "Applies the bedroom selection shown beside it to the real Rentals page filters. Only render it together with BedroomFilter.",
      props: z.object({ label: z.string().optional() }),
      events: { onApplyRentalFilters: { parameters: z.object({}) } },
    },
  },
});
