/** Event listings are for Medellín; always render their schedule in local Colombia time. */
export const EVENT_TIME_ZONE = "America/Bogota";

export function formatTicketPrice(priceCents: number, currency: string): string {
  const amount = priceCents / 100;
  if (currency === "COP") {
    return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })} COP`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a whole-unit event price — EventCard.pricePerTicket, NOT cents — with
 * its currency. USD keeps the prior "$1,500" card output (zero behavior change),
 * while COP is suffixed: the "$" sign is shared with the peso, so "$80,000"
 * alone reads as USD and overstates the price ~4000× ($80,000 COP ≈ $19 USD).
 * Unknown/null → USD form.
 */
export function formatEventCardPrice(
  price: number,
  currency: string | null | undefined,
): string {
  const formatted = price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return currency?.toUpperCase() === "COP" ? `$${formatted} COP` : `$${formatted}`;
}

export function formatEventSchedule(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  const startLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: EVENT_TIME_ZONE,
  }).format(start);

  if (!endsAt) return startLabel;

  const end = new Date(endsAt);
  const localDay = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: EVENT_TIME_ZONE,
  });
  const sameDay = localDay.format(start) === localDay.format(end);

  const endLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: EVENT_TIME_ZONE,
  }).format(end);

  return sameDay ? `${startLabel} – ${endLabel}` : `${startLabel} – ${end.toLocaleString("en-US", { timeZone: EVENT_TIME_ZONE })}`;
}

export function ticketsRemaining(qtyTotal: number, qtySold: number): number {
  return Math.max(0, qtyTotal - qtySold);
}
