import type { ApprovalDecision } from "@/lib/events/approval-decision";
import {
  isDraftReadyForPublish,
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

/**
 * The model can call preview_and_publish with an empty or partial draft even
 * when the visible wizard is complete. Prefer the reviewed wizard state unless
 * the tool supplied values make a complete draft on their own.
 */
export function selectPublishDraft(
  argsDraft: Partial<EventDraftState> | undefined,
  fallbackDraft: EventDraftState,
): EventDraftState {
  if (!argsDraft) return fallbackDraft;
  const merged = mergeEventDraft(fallbackDraft, argsDraft);
  return isDraftReadyForPublish(merged) ? merged : fallbackDraft;
}
