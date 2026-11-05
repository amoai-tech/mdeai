import type { PublicEventDetail, PublicEventTicket } from "@/lib/events/types";
import { ticketsRemaining } from "./format-event";

/**
 * What the visitor can actually do on an event page.
 *
 * The three states must never collapse into one: an event with no ticket tiers is
 * "price TBD / follow", not free and not sold out; only real active tiers that are
 * exhausted are sold out.
 */
export type EventDetailAction =
  | { kind: "tickets"; tier: PublicEventTicket; tiers: PublicEventTicket[] }
  | { kind: "sold-out" }
  | { kind: "follow" };

export function remainingSeats(
  tier: Pick<PublicEventTicket, "qtyTotal" | "qtySold"> & {
    qtyPending?: number;
  },
): number {
  const remaining = ticketsRemaining(tier.qtyTotal, tier.qtySold, tier.qtyPending ?? 0);
  return Number.isFinite(remaining) && remaining > 0 ? remaining : 0;
}

export function eventDetailAction(
  event: Pick<PublicEventDetail, "tickets">,
): EventDetailAction {
  const tiers = event.tickets ?? [];
  // No configured tier at all is unknown inventory, never "free" and never "sold out".
  if (tiers.length === 0) return { kind: "follow" };
  const available = tiers.filter((tier) => remainingSeats(tier) > 0);
  if (available.length === 0) return { kind: "sold-out" };
  const cheapest = available.reduce((min, tier) => (tier.priceCents < min.priceCents ? tier : min));
  return { kind: "tickets", tier: cheapest, tiers: available };
}
