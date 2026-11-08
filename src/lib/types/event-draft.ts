import { z } from "zod";

export const EventDraftStatus = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "published",
]);

export const EventTicketTierDraft = z.object({
  name: z.string().min(1).max(80),
  priceCop: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
});

export const EventDraftStateSchema = z.object({
  title: z.string().max(120).default(""),
  neighborhood: z.string().default(""),
  dateIso: z.string().optional(),
  venue: z.string().default(""),
  priceMinCop: z.number().int().nonnegative().default(0),
  capacity: z.number().int().nonnegative().default(0),
  description: z.string().default(""),
  coverPhotoPath: z.string().optional(),
  ticketTiers: z.array(EventTicketTierDraft).default([]),
  approvalRequestId: z.string().uuid().optional(),
  publishedEventId: z.string().uuid().optional(),
  publishedSlug: z.string().optional(),
  status: EventDraftStatus.default("draft"),
});

export type EventDraftState = z.infer<typeof EventDraftStateSchema>;
export type EventTicketTierDraft = z.infer<typeof EventTicketTierDraft>;

export const EMPTY_EVENT_DRAFT: EventDraftState = EventDraftStateSchema.parse({});

/**
 * A single compact-wizard tier must follow the reviewed price and capacity.
 * Never rewrite it to zero: ticket checkout cannot sell a zero-priced tier, so
 * publish readiness stays false until a real no-payment path exists.
 */
export function reconcileSingleTicketTier(draft: EventDraftState): EventDraftState {
  if (draft.ticketTiers.length !== 1) return draft;
  const tier = draft.ticketTiers[0];
  return {
    ...draft,
    ticketTiers: [{
      ...tier,
      // Never rewrite a paid tier to zero; publish readiness blocks instead.
      priceCop: draft.priceMinCop > 0 ? draft.priceMinCop : tier.priceCop,
      quantity: draft.capacity > 0 ? draft.capacity : tier.quantity,
    }],
  };
}

export function mergeEventDraft(
  current: EventDraftState,
  patch: Partial<EventDraftState>,
): EventDraftState {
  return reconcileSingleTicketTier(
    EventDraftStateSchema.parse({ ...current, ...patch }),
  );
}

export function activeHostWizardStep(
  draft: EventDraftState,
): "basics" | "venue" | "tickets" | "preview" {
  if (
    draft.status === "pending_approval" ||
    draft.status === "published" ||
    draft.status === "approved"
  ) {
    return "preview";
  }
  const hasBasics = draft.title.trim().length > 0;
  const hasVenue = draft.venue.trim().length > 0 && draft.capacity > 0;
  const hasTickets = draft.ticketTiers.length > 0
    ? draft.ticketTiers.every((tier) => tier.priceCop > 0)
    : draft.priceMinCop > 0;

  if (hasBasics && hasVenue && hasTickets) return "preview";
  if (hasBasics && hasVenue) return "tickets";
  if (hasBasics) return "venue";
  return "basics";
}

// Accept the host wizard's local ISO datetime and the agent's offset/Z form.
// The server also accepts both; do not drop otherwise valid agent edits because
// the host entered a local datetime. Database timezone normalization is separate.
const publishEventDate = z.string().datetime({ offset: true, local: true });

export function isValidEventDraftDate(value: string | undefined): boolean {
  return publishEventDate.safeParse(value).success;
}

export function isDraftReadyForPublish(draft: EventDraftState): boolean {
  const hasSellableTickets = draft.priceMinCop > 0 &&
    (draft.ticketTiers.length === 0 ||
      draft.ticketTiers.every((tier) => tier.priceCop > 0));
  return (
    draft.title.trim().length > 0 &&
    draft.neighborhood.trim().length > 0 &&
    isValidEventDraftDate(draft.dateIso) &&
    draft.venue.trim().length > 0 &&
    draft.capacity > 0 &&
    hasSellableTickets
  );
}
