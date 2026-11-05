"use client";

import { useMemo } from "react";
import { z } from "zod";
import { createGenerativeUI } from "@copilotkit/react-core/v2/generative-ui";
import { RentalCard as ExistingRentalCard } from "@/components/copilot/rental-card";
import { useOptionalConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { useOptionalRentalUi } from "@/components/chat/rental-ui-context";
import { useOptionalMapContext } from "@/platform/maps/map-context";
import { normalizeToolOutput } from "@/platform/maps/normalize-tool-output";
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

function toolNameByCallId(messages: readonly {
  role?: string;
  toolCalls?: Array<{ id?: string; function?: { name?: string } }>;
}[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const call of message.toolCalls ?? []) {
      if (call.id && call.function?.name) names.set(call.id, call.function.name);
    }
  }
  return names;
}

/** The latest finished rental tool result on the current agent thread. */
function useCurrentRentalResult(): unknown | null {
  const concierge = useOptionalConciergeCoAgent();
  return useMemo(() => {
    const messages = concierge?.agent?.messages ?? [];
    if (messages.length === 0) return null;
    const names = toolNameByCallId(messages);
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role !== "tool" || !message.toolCallId) continue;
      if (!names.has(message.toolCallId) || !rentalToolNames.has(names.get(message.toolCallId) ?? "")) continue;
      if (!isFinishedToolPayload(message.content, { rowArray: true })) continue;
      return message.content;
    }
    return null;
  }, [concierge?.agent?.messages]);
}

/** Resolve an opaque id only against the latest authorized tool result. */
export function findRentalRow(
  result: unknown,
  listingId: string,
): RentalToolRow | null {
  if (!result) return null;
  const rows = (normalizeToolEnvelope(result).results ?? []) as RentalToolRow[];
  return rows.find((candidate) => candidate.id === listingId) ?? null;
}

function useRentalRow(listingId: string): { row: RentalToolRow | null; result: unknown | null } {
  const result = useCurrentRentalResult();
  const row = useMemo(() => findRentalRow(result, listingId), [listingId, result]);
  return { row, result };
}

/** One existing rental card, hydrated only from the current authorized tool result. */
function MdeRentalCard({ listingId }: { listingId: string }) {
  const { row, result } = useRentalRow(listingId);
  const map = useOptionalMapContext();
  const rentalUi = useOptionalRentalUi();
  const selectedPinId = map?.selectedPinId;
  const panToPin = map?.panToPin;
  const openVenueDetail = rentalUi?.openVenueDetail;
  const openScheduleViewing = rentalUi?.openScheduleViewing;

  const hasPin = useMemo(() => {
    if (!result) return false;
    return normalizeToolOutput("rental", result).pins.some((pin) => pin.id === `rental-${listingId}`);
  }, [listingId, result]);

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
  } : undefined;

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
