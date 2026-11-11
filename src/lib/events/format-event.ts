/** Event listings are for Medellín; always render their schedule in local Colombia time. */
export const EVENT_TIME_ZONE = "America/Bogota";

/** One canonical currency label for display and comparisons. Empty/unknown falls back to USD. */
export function normalizeEventCurrency(
  currency: string | null | undefined,
): string {
  const normalized = currency?.trim().toUpperCase() ?? "";
  return normalized || "USD";
}

export function formatTicketPrice(priceCents: number, currency: string): string {
  if (priceCents === 0) return "Free";
  const amount = priceCents / 100;
  const code = normalizeEventCurrency(currency);
  if (code === "COP") {
    return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })} COP`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
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
  return normalizeEventCurrency(currency) === "COP" ? `$${formatted} COP` : `$${formatted}`;
}

/** Short Medellín-local start, e.g. "Mon, Oct 19, 4:00 PM". Shared by the browse card and its map pin. */
export function formatEventStartsAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: EVENT_TIME_ZONE,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Month and day for a card date badge, in Medellín local time.
 *
 * Card media is decorative, so this never replaces the readable schedule line — it only gives a
 * photo-less card the weight a photo would have carried. Returns null when the timestamp is
 * unusable, so a card degrades to the plain placeholder instead of showing a wrong day.
 */
export function formatEventBadgeDate(iso: string): { month: string; day: string } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: EVENT_TIME_ZONE,
    }).formatToParts(date);
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    return month && day ? { month: month.toUpperCase(), day } : null;
  } catch {
    return null;
  }
}

export function formatEventSchedule(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  const startLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
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

  // A different end day repeats the start's date style ("Wed, Feb 24, 12:30 AM"), not a raw locale string.
  const endLabel = sameDay
    ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: EVENT_TIME_ZONE }).format(end)
    : new Intl.DateTimeFormat("en-US", {
        weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
        timeZone: EVENT_TIME_ZONE,
      }).format(end);

  return `${startLabel} – ${endLabel}`;
}

/** Capacity after both committed sales and pending checkout reservations. */
export function ticketsRemaining(
  qtyTotal: number,
  qtySold: number,
  qtyPending = 0,
): number {
  const total = Number(qtyTotal);
  const sold = Number(qtySold);
  const pending = Number(qtyPending);
  if (![total, sold, pending].every(Number.isFinite)) return 0;
  return Math.max(0, total - sold - pending);
}

/** Whether the stored sale window is open right now. Invalid dates are ignored, not invented. */
export function isTicketSaleOpen(
  ticket: { saleStartsAt?: string | null; saleEndsAt?: string | null },
  now = Date.now(),
): boolean {
  const start = ticket.saleStartsAt ? Date.parse(ticket.saleStartsAt) : Number.NaN;
  const end = ticket.saleEndsAt ? Date.parse(ticket.saleEndsAt) : Number.NaN;
  const startOpen = !Number.isFinite(start) || start <= now;
  const endOpen = !Number.isFinite(end) || end >= now;
  return startOpen && endOpen;
}

export type TicketAvailability =
  | "available"
  | "sold-out"
  | "not-yet-on-sale"
  | "sale-ended"
  | "below-minimum";

/**
 * One canonical sellability state for every public ticket surface.
 *
 * The database RPC remains the authority for checkout. This state only keeps
 * the UI from offering a control the RPC would reject.
 */
export function ticketAvailability(
  ticket: {
    qtyTotal: number;
    qtySold: number;
    qtyPending?: number;
    minPerOrder?: number;
    saleStartsAt?: string | null;
    saleEndsAt?: string | null;
  },
  now = Date.now(),
): TicketAvailability {
  const remaining = ticketsRemaining(
    ticket.qtyTotal,
    ticket.qtySold,
    ticket.qtyPending ?? 0,
  );
  if (remaining <= 0) return "sold-out";

  const start = ticket.saleStartsAt ? Date.parse(ticket.saleStartsAt) : Number.NaN;
  if (Number.isFinite(start) && start > now) return "not-yet-on-sale";

  const end = ticket.saleEndsAt ? Date.parse(ticket.saleEndsAt) : Number.NaN;
  if (Number.isFinite(end) && end < now) return "sale-ended";

  if (remaining < Math.max(1, ticket.minPerOrder ?? 1)) return "below-minimum";
  return "available";
}

/** A tier is available when it has enough capacity and its sale window is open. */
export function isTicketAvailable(
  ticket: {
    qtyTotal: number;
    qtySold: number;
    qtyPending?: number;
    minPerOrder?: number;
    saleStartsAt?: string | null;
    saleEndsAt?: string | null;
  },
  now = Date.now(),
): boolean {
  return ticketAvailability(ticket, now) === "available";
}
