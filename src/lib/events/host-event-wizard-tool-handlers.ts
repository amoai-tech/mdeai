import type { ApprovalDecision } from "@/lib/events/approval-decision";
import {
  EventDraftStateSchema,
  isDraftReadyForPublish,
  isValidEventDraftDate,
  mergeEventDraft,
  type EventDraftState,
  type EventTicketTierDraft,
} from "@/lib/types";

export type SetEventBasicsArgs = {
  title: string;
  neighborhood: string;
  dateIso: string;
};

export type SetVenueArgs = {
  venue: string;
  capacity: number | string;
};

export type SetPricingArgs = {
  priceMinCop: number;
  description?: string;
  ticketTiers?: EventTicketTierDraft[];
};

/** Pure patch helpers — shared by v1 bridge semantics and v2 useFrontendTool handlers. */
export function applySetEventBasics(
  current: EventDraftState,
  args: SetEventBasicsArgs,
): EventDraftState {
  return mergeEventDraft(current, {
    title: args.title,
    neighborhood: args.neighborhood,
    dateIso: args.dateIso,
  });
}

export function applySetVenue(
  current: EventDraftState,
  args: SetVenueArgs,
): EventDraftState {
  return mergeEventDraft(current, {
    venue: args.venue,
    capacity: Number(args.capacity),
  });
}

export function applySetPricing(
  current: EventDraftState,
  args: SetPricingArgs,
): EventDraftState {
  const tiers = Array.isArray(args.ticketTiers)
    ? args.ticketTiers
    : current.ticketTiers;
  return mergeEventDraft(current, {
    priceMinCop: Number(args.priceMinCop),
    description:
      typeof args.description === "string"
        ? args.description
        : current.description,
    ticketTiers: tiers,
  });
}

/**
 * HITL decision → draft patch. Approved path returns null — onPublished owns published state.
 * Mirrors v1 host-event-copilot-bridge race guard.
 */
export function publishDecisionDraftPatch(
  decision: ApprovalDecision,
): Partial<EventDraftState> | null {
  if (decision === "rejected") return { status: "rejected" };
  if (decision !== "approved") return { status: "draft" };
  return null;
}

// Reviewable event fields only. Model tool arguments cannot claim publication
// status or forge approval/receipt identity.
const publishToolFields = EventDraftStateSchema.pick({
  title: true,
  neighborhood: true,
  dateIso: true,
  venue: true,
  priceMinCop: true,
  capacity: true,
  description: true,
  coverPhotoPath: true,
  ticketTiers: true,
}).partial();

/**
 * Empty tool args use the current reviewed wizard. Valid partial AI fields
 * merge over that wizard, and the HITL panel shows the exact merged draft before
 * approval. A malformed AI date is discarded by itself, preserving other valid
 * proposed fields and the reviewed date. Other invalid or unpublishable values
 * fall back to the wizard. Server validation remains authoritative.
 */
export function selectPublishDraft(
  argsDraft: unknown,
  fallbackDraft: EventDraftState,
): EventDraftState {
  if (argsDraft == null) return fallbackDraft;
  const parsed = publishToolFields.safeParse(argsDraft);
  if (!parsed.success) return fallbackDraft;
  // A bad AI date must not silently delete its valid description/price/tier edits.
  // Keep the reviewed date and show the other changes in the approval panel.
  const { dateIso, ...fields } = parsed.data;
  const patch = dateIso !== undefined && !isValidEventDraftDate(dateIso)
    ? fields
    : parsed.data;
  const merged = mergeEventDraft(fallbackDraft, patch);
  return isDraftReadyForPublish(merged) ? merged : fallbackDraft;
}
