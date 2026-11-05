"use client";

import { useMemo } from "react";
import { z } from "zod";
import { useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";
import { createGenerativeUI } from "@copilotkit/react-core/v2/generative-ui";
import { RentalCard as ExistingRentalCard } from "@/components/copilot/rental-card";
import { useOptionalConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { useOptionalRentalUi } from "@/components/chat/rental-ui-context";
import { useOptionalMapContext } from "@/platform/maps/map-context";
import { useOptionalRentalFastPath } from "@/components/chat/rental-fast-path-context";
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
  return useMemo(() => {
    const fromAgent = collectRentalResults(messages);
    const fromFastPath = fastPath?.toolResults ?? (fastPath?.toolResult ? [fastPath.toolResult] : []);
    return findRentalRow(mergeRentalResults(fromFastPath, fromAgent), listingId);
  }, [fastPath?.toolResult, fastPath?.toolResults, listingId, messages]);
}

/** One existing rental card, hydrated only from the current authorized tool result. */
function MdeRentalCard({ listingId }: { listingId: string }) {
  const row = useRentalRow(listingId);
  const map = useOptionalMapContext();
  const rentalUi = useOptionalRentalUi();
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

export const mdeUI = createGenerativeUI({
  id: "mde/discovery@1",
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
  },
});
