import { z } from "zod";

/** Documented transport ceiling shared by the browser and the Next.js API. */
export const MAX_TICKETS_PER_CHECKOUT = 10;

export const ticketCheckoutInputSchema = z.object({
  eventId: z.string().uuid(),
  ticketId: z.string().uuid(),
  // All current tiers have max_per_order = 10. This is a documented safe
  // transport ceiling, not the business rule: the atomic RPC still enforces
  // each tier's own min/max, sale window and remaining capacity. Revisit this
  // ceiling deliberately if a real tier ever allows more than 10.
  quantity: z.number().int().min(1).max(MAX_TICKETS_PER_CHECKOUT),
  buyerEmail: z.string().email().max(120),
  buyerName: z.string().min(1).max(120),
  idempotencyKey: z.string().uuid(),
  returnPath: z.string().min(1).max(500),
});

export type TicketCheckoutInput = z.infer<typeof ticketCheckoutInputSchema>;

export type TicketCheckoutResult = {
  stripeSessionUrl: string;
  orderId: string;
  shortId: string | null;
  walletAccessToken: string;
};

export function buildAttendeePayload(
  buyerEmail: string,
  buyerName: string,
  quantity: number,
): Array<{ email: string; full_name: string }> {
  return Array.from({ length: quantity }, () => ({
    email: buyerEmail,
    full_name: buyerName,
  }));
}
