"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatTicketPrice,
  isTicketAvailable,
  ticketAvailability,
  ticketsRemaining,
} from "@/lib/events/format-event";
import type { PublicEventDetail, PublicEventTicket } from "@/lib/events/types";
import type { BookingCheckoutTarget } from "@/components/modals/booking-checkout-modal";
import { MAX_TICKETS_PER_CHECKOUT } from "@/lib/tickets/ticket-checkout-schema";

type TierQuantities = Record<string, number>;

function minOrder(tier: PublicEventTicket): number {
  return Math.max(1, tier.minPerOrder ?? 1);
}

function maxOrder(tier: PublicEventTicket): number {
  return Math.min(
    MAX_TICKETS_PER_CHECKOUT,
    Math.max(1, tier.maxPerOrder ?? 1),
  );
}

function capacity(tier: PublicEventTicket): number {
  return ticketsRemaining(tier.qtyTotal, tier.qtySold, tier.qtyPending);
}

function canOrder(tier: PublicEventTicket): boolean {
  return ticketAvailability(tier) === "available";
}

function initialQuantity(tier: PublicEventTicket): number {
  if (!canOrder(tier)) return 0;
  return Math.min(capacity(tier), maxOrder(tier), minOrder(tier));
}

function initialQuantities(tickets: PublicEventTicket[]): TierQuantities {
  const next: TierQuantities = {};
  for (const tier of tickets) next[tier.id] = initialQuantity(tier);
  return next;
}

function lowestAvailablePrice(
  tickets: PublicEventTicket[],
): PublicEventTicket | null {
  const available = tickets.filter((tier) => isTicketAvailable(tier) && capacity(tier) > 0);
  if (available.length === 0) return null;
  return available.reduce((min, tier) =>
    tier.priceCents < min.priceCents ? tier : min,
  );
}

/** The compact sheet must default to a tier whose CTA can actually be used. */
function defaultPaidTier(
  tickets: PublicEventTicket[],
): PublicEventTicket | null {
  const paid = tickets.filter(
    (tier) => isTicketAvailable(tier) && tier.priceCents > 0 && canOrder(tier),
  );
  if (paid.length === 0) return null;
  return paid.reduce((min, tier) =>
    tier.priceCents < min.priceCents ? tier : min,
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
  const defaultTier = useMemo(
    () => (compactFooter ? defaultPaidTier(event.tickets) : null),
    [compactFooter, event.tickets],
  );
  // Compact mode has one CTA, so it must follow the tier the visitor picked, never the cheapest.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTier =
    event.tickets.find(
      (tier) => tier.id === selectedId && isTicketAvailable(tier),
    ) ?? (compactFooter ? defaultTier ?? fromTier : fromTier);
  const selectedQty = selectedTier ? (quantities[selectedTier.id] ?? 0) : 0;
  const selectedPaid = selectedTier ? selectedTier.priceCents > 0 : false;
  const selectedCanOrder = selectedTier
    ? canOrder(selectedTier) && selectedQty >= minOrder(selectedTier) && selectedQty <= Math.min(capacity(selectedTier), maxOrder(selectedTier))
    : false;

  const changeQty = (tier: PublicEventTicket, next: number) => {
    setQuantities((prev) => ({ ...prev, [tier.id]: next }));
    setSelectedId(tier.id);
  };

  const openCheckout = (tier: PublicEventTicket) => {
    const qty = quantities[tier.id] ?? 0;
    if (!canOrder(tier) || tier.priceCents <= 0) return;
    if (qty < minOrder(tier) || qty > Math.min(capacity(tier), maxOrder(tier))) return;
    onCheckout({
      event: { id: event.id, name: event.name },
      tier,
      quantity: qty,
    });
  };

  const hasBelowMinimum = event.tickets.some(
    (tier) => ticketAvailability(tier) === "below-minimum",
  );
  const hasClosedSale = event.tickets.some((tier) => {
    const availability = ticketAvailability(tier);
    return availability === "not-yet-on-sale" || availability === "sale-ended";
  });

  return (
    <section aria-labelledby="event-tiers-heading">
      <h2 id="event-tiers-heading" className={event.tickets.length === 0 ? "sr-only" : "text-lg font-semibold"}>
        Tickets
      </h2>
      {event.tickets.length > 0 && fromTier === null ? (
        <div
          className="mt-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
          data-testid="event-tiers-sold-out"
        >
          {hasBelowMinimum
            ? "Tickets are listed, but none meet the minimum order. Check back or ask the organizer."
            : hasClosedSale
              ? "Tickets are listed but not on sale right now. Check the sale window or ask the organizer."
              : "All tickets for this event are sold out. Check back for updates or explore other events."}
        </div>
      ) : null}

      <ul className="mt-3 space-y-3" data-testid="event-tier-list">
        {event.tickets.length === 0 ? (
          <li
            className="py-1 text-sm leading-6 text-muted-foreground"
            data-testid="event-tier-empty"
          >
            No ticket tiers are listed for this event. Ask MDE or check with the organizer for updates.
          </li>
        ) : (
          event.tickets.map((tier) => {
            const remaining = capacity(tier);
            const availability = ticketAvailability(tier);
            const soldOut = availability === "sold-out";
            const belowMinimum = availability === "below-minimum";
            const saleLabel = availability === "not-yet-on-sale"
              ? "Not on sale yet"
              : availability === "sale-ended"
                ? "Sales ended"
                : null;
            const saleOpen = availability === "available";
            const qty = quantities[tier.id] ?? 0;
            const cap = Math.min(remaining, maxOrder(tier));
            const min = Math.min(minOrder(tier), cap);
            const paid = tier.priceCents > 0;
            const canBuy = saleOpen && paid;
            const atOrderCap = qty >= maxOrder(tier) && remaining > maxOrder(tier);

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
                    {compactFooter && !soldOut && saleOpen ? (
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
                    {!soldOut && saleOpen && remaining <= 20 ? (
                      <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        {remaining} left
                      </p>
                    ) : null}
                    {soldOut ? (
                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        Sold out
                      </p>
                    ) : null}
                    {saleLabel ? (
                      <p className="mt-1 text-xs font-medium text-muted-foreground" data-testid="event-tier-sale-window">
                        {saleLabel}
                      </p>
                    ) : null}
                    {belowMinimum ? (
                      <p className="mt-1 text-xs font-medium text-muted-foreground" data-testid="event-tier-unavailable">
                        Unavailable: only {remaining} left, but the minimum order is {minOrder(tier)}.
                      </p>
                    ) : null}
                  </div>
                  {saleOpen ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Decrease ${tier.name} quantity`}
                        disabled={qty <= 0}
                        onClick={() => changeQty(tier, qty <= min ? 0 : qty - 1)}
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
                        onClick={() => changeQty(tier, qty < min ? min : Math.min(cap, qty + 1))}
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
                    Up to {maxOrder(tier)} tickets per order. For larger groups,
                    place another order.
                  </p>
                ) : null}
                {!soldOut && saleOpen && !paid && !compactFooter ? (
                  <p className="mt-3 text-xs text-muted-foreground" data-testid="event-tier-free-no-checkout">
                    Free entry. This tier does not use paid Stripe checkout.
                  </p>
                ) : null}
                {!soldOut && saleOpen && paid && !compactFooter ? (
                  <Button
                    type="button"
                    className="mt-3 w-full"
                    size="sm"
                    disabled={!canBuy || qty < minOrder(tier)}
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
          disabled={!selectedCanOrder || !selectedPaid}
          data-testid="event-sheet-checkout-cta"
          onClick={() => openCheckout(selectedTier)}
        >
          <Ticket className="size-4" aria-hidden />
          {!selectedPaid
            ? "Free entry. This tier does not use paid Stripe checkout."
            : selectedQty < minOrder(selectedTier)
              ? `Choose at least ${minOrder(selectedTier)} for ${selectedTier.name}`
              : selectedQty > Math.min(capacity(selectedTier), maxOrder(selectedTier))
                ? `Maximum ${maxOrder(selectedTier)} for ${selectedTier.name}`
                : `Pay for ${selectedTier.name} × ${selectedQty} · ${formatTicketPrice(
                    selectedTier.priceCents * selectedQty,
                    selectedTier.currency,
                  )}`}
        </Button>
      ) : null}
    </section>
  );
}
