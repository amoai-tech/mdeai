import { z } from "zod";

export const ticketCheckoutInputSchema = z.object({
  eventId: z.string().uuid(),
  ticketId: z.string().uuid(),
  // The database hard ceiling is max_per_order <= 50. The atomic RPC still
  // enforces each tier's own min/max and remaining capacity; this is only the
  // transport bound so a malformed request cannot build an unbounded attendee list.
  quantity: z.number().int().min(1).max(50),
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
