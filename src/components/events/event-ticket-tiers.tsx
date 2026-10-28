"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatTicketPrice,
  ticketsRemaining,
} from "@/lib/events/format-event";
import type { PublicEventDetail, PublicEventTicket } from "@/lib/events/types";
import type { BookingCheckoutTarget } from "@/components/modals/booking-checkout-modal";

type TierQuantities = Record<string, number>;

/** Max tickets a single order may contain (PAY-CO-2). Mirrored server-side. */
const MAX_PER_ORDER = 8;

function initialQuantities(tickets: PublicEventTicket[]): TierQuantities {
  const next: TierQuantities = {};
  for (const tier of tickets) {
    next[tier.id] = ticketsRemaining(tier.qtyTotal, tier.qtySold) > 0 ? 1 : 0;
  }
  return next;
}

function lowestAvailablePrice(
  tickets: PublicEventTicket[],
): PublicEventTicket | null {
  const available = tickets.filter(
    (t) => ticketsRemaining(t.qtyTotal, t.qtySold) > 0,
  );
  if (available.length === 0) return null;
  return available.reduce((min, t) =>
    t.priceCents < min.priceCents ? t : min,
  );
}

export type EventTicketTiersProps = {
  event: Pick<PublicEventDetail, "id" | "name" | "tickets">;
  onCheckout: (target: BookingCheckoutTarget) => void;
  /** Hide per-tier Buy buttons; use sticky footer CTA only. */
  compactFooter?: boolean;
};

/** Shared tier picker — used on /events/[slug] and chat venue sheet checkout step. */
export function EventTicketTiers({
  event,
  onCheckout,
  compactFooter = false,
}: EventTicketTiersProps) {
  const [quantities, setQuantities] = useState<TierQuantities>(() =>
    initialQuantities(event.tickets),
  );

  const fromTier = useMemo(
    () => lowestAvailablePrice(event.tickets),
    [event.tickets],
  );
  // Compact mode has one CTA, so it must follow the tier the visitor picked, never the cheapest.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTier =
    event.tickets.find(
      (t) =>
        t.id === selectedId && ticketsRemaining(t.qtyTotal, t.qtySold) > 0,
    ) ?? fromTier;
  const selectedQty = selectedTier ? (quantities[selectedTier.id] ?? 0) : 0;

  const changeQty = (tier: PublicEventTicket, next: number) => {
    setQuantities((prev) => ({ ...prev, [tier.id]: next }));
    setSelectedId(tier.id);
  };

  const openCheckout = (tier: PublicEventTicket) => {
    const qty = quantities[tier.id] ?? 1;
    if (qty < 1) return;
    onCheckout({
      event: { id: event.id, name: event.name },
      tier,
      quantity: qty,
    });
  };

  return (
    <section aria-labelledby="event-tiers-heading">
      <h2 id="event-tiers-heading" className="text-lg font-semibold">
        Tickets
      </h2>
      {event.tickets.length > 0 && fromTier === null ? (
        <div
          className="mt-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
          data-testid="event-tiers-sold-out"
        >
          All tickets for this event are sold out. Check back for updates or explore other events.
        </div>
      ) : null}

      <ul className="mt-3 space-y-3" data-testid="event-tier-list">
        {event.tickets.length === 0 ? (
          <li
            className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
            data-testid="event-tier-empty"
          >
            Ticket tiers coming soon. Check back or ask the concierge in chat.
          </li>
        ) : (
          event.tickets.map((tier) => {
            const remaining = ticketsRemaining(tier.qtyTotal, tier.qtySold);
            const soldOut = remaining === 0;
            const qty = quantities[tier.id] ?? 0;
            const cap = Math.min(remaining, MAX_PER_ORDER);
            const atOrderCap = qty >= MAX_PER_ORDER && remaining > MAX_PER_ORDER;

            return (
              <li
                key={tier.id}
                className={cn(
                  "rounded-lg border p-3",
                  compactFooter && selectedTier?.id === tier.id
                    ? "border-primary"
                    : "border-border",
                )}
                data-testid="event-tier-row"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {compactFooter && !soldOut ? (
                      <label className="flex cursor-pointer items-center gap-2 font-medium">
                        <input
                          type="radio"
                          name="event-tier"
                          className="size-4 accent-primary"
                          checked={selectedTier?.id === tier.id}
                          onChange={() => setSelectedId(tier.id)}
                          data-testid="event-tier-select"
                        />
                        {tier.name}
                      </label>
                    ) : (
                      <p className="font-medium">{tier.name}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {formatTicketPrice(tier.priceCents, tier.currency)}
                    </p>
                    {!soldOut && remaining <= 20 ? (
                      <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        {remaining} left
                      </p>
                    ) : null}
                    {soldOut ? (
                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        Sold out
                      </p>
                    ) : null}
                  </div>
                  {!soldOut ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Decrease ${tier.name} quantity`}
                        disabled={qty <= 0}
                        onClick={() => changeQty(tier, Math.max(0, qty - 1))}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <span
                        className="min-w-[1.5rem] text-center text-sm font-medium"
                        data-testid="event-tier-qty"
                      >
                        {qty}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Increase ${tier.name} quantity`}
                        disabled={qty >= cap}
                        onClick={() => changeQty(tier, Math.min(cap, qty + 1))}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
                {atOrderCap ? (
                  <p
                    className="mt-2 text-xs text-muted-foreground"
                    data-testid="event-tier-order-cap"
                  >
                    Up to {MAX_PER_ORDER} tickets per order. For larger groups,
                    place another order.
                  </p>
                ) : null}
                {!soldOut && !compactFooter ? (
                  <Button
                    type="button"
                    className="mt-3 w-full"
                    size="sm"
                    disabled={qty < 1}
                    data-testid="event-tier-buy"
                    onClick={() => openCheckout(tier)}
                  >
                    <Ticket className="size-3.5" aria-hidden />
                    Buy {tier.name}
                  </Button>
                ) : null}
              </li>
            );
          })
        )}
      </ul>

      {compactFooter && selectedTier ? (
        <Button
          type="button"
          className="mt-4 w-full"
          disabled={selectedQty < 1}
          data-testid="event-sheet-checkout-cta"
          onClick={() => openCheckout(selectedTier)}
        >
          <Ticket className="size-4" aria-hidden />
          {selectedQty < 1
            ? `Choose a quantity for ${selectedTier.name}`
            : `Pay for ${selectedTier.name} × ${selectedQty} · ${formatTicketPrice(
                selectedTier.priceCents * selectedQty,
                selectedTier.currency,
              )}`}
        </Button>
      ) : null}
    </section>
  );
}
