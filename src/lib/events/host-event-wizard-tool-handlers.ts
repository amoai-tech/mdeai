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


/** All event fields the host assistant may propose in one reviewed draft. */
export type SetEventDraftArgs = Partial<
  Pick<
    EventDraftState,
    | "title"
    | "neighborhood"
    | "dateIso"
    | "venue"
    | "capacity"
    | "priceMinCop"
    | "description"
    | "ticketTiers"
  >
>;

/**
 * Apply every field the host stated in one frontend-tool call.
 *
 * The three single-purpose setters remain as canonical patch primitives, but the
 * agent gets one tool so a complete request cannot stall after the first field.
 */
export function applySetEventDraft(
  current: EventDraftState,
  args: SetEventDraftArgs,
): EventDraftState {
  return mergeEventDraft(current, args);
}

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
 * Local datetimes in the Medellín event wizard mean America/Bogota, UTC-05:00
 * for modern events. Make that offset explicit before preview, hashing and the
 * PostgreSQL timestamptz cast (whose session TimeZone can be UTC).
 * An existing explicit offset or Z is authoritative and must not be changed.
 */
function normalizeReviewedEventDate(draft: EventDraftState): EventDraftState {
  const value = draft.dateIso;
  if (!value || !isValidEventDraftDate(value)) return draft;
  if (/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value)) return draft;
  return { ...draft, dateIso: `${value}-05:00` };
}

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
  if (argsDraft == null) return normalizeReviewedEventDate(fallbackDraft);
  const parsed = publishToolFields.safeParse(argsDraft);
  if (!parsed.success) return normalizeReviewedEventDate(fallbackDraft);
  // A bad AI date must not silently delete its valid description/price/tier edits.
  // Keep the reviewed date and show the other changes in the approval panel.
  const { dateIso, ...fields } = parsed.data;
  const patch = dateIso !== undefined && !isValidEventDraftDate(dateIso)
    ? fields
    : parsed.data;
  const merged = mergeEventDraft(fallbackDraft, patch);
  return normalizeReviewedEventDate(
    isDraftReadyForPublish(merged) ? merged : fallbackDraft,
  );
}
