/**
 * Canonical published-event ticket offer calculation. A legacy summary price
 * of zero does not prove a free ticket: only an actual stored tier can.
 */
export type EventTicketTier = {
  price_cents: number;
  currency: string;
  qty_total: number;
  qty_sold: number;
  qty_pending: number;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
};

export function summarizeEventTicketOffer(
  tiers: readonly EventTicketTier[] | null | undefined,
  now = Date.now(),
) {
  const ordered = [...(tiers ?? [])].sort((a, b) => a.price_cents - b.price_cents);
  const sellable = ordered.filter(
    (tier) =>
      tier.qty_total > tier.qty_sold + tier.qty_pending &&
      (!tier.sale_starts_at || Date.parse(tier.sale_starts_at) <= now) &&
      (!tier.sale_ends_at || Date.parse(tier.sale_ends_at) >= now),
  );
  const cheapest = sellable[0] ?? ordered[0];
  return {
    pricePerTicket: cheapest ? cheapest.price_cents / 100 : null,
    canBuyTickets: sellable.length > 0,
    currency: cheapest?.currency ?? null,
  };
}
