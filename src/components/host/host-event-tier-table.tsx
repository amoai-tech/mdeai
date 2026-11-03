import { formatMoney } from "@/lib/events/format-money";
import type { HostEventTier } from "@/lib/events/load-host-event";

/** SAN-885 / SAN-983 — read-only tier inventory for one event. */
export function HostEventTierTable({ tiers }: { tiers: HostEventTier[] }) {
  return (
    <section className="space-y-2" data-testid="host-event-tiers">
      <h2 className="font-serif text-lg font-semibold">Ticket tiers</h2>
      {tiers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No ticket tiers yet. Buyers cannot purchase until tiers exist.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Tier</th>
                <th className="py-2 pr-3">Price</th>
                <th className="py-2 pr-3">Sold</th>
                <th className="py-2 pr-3">Held</th>
                <th className="py-2">Capacity</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={tier.id} className="border-b border-border/60">
                  <td className="py-2 pr-3 font-medium">{tier.name}</td>
                  <td className="py-2 pr-3">{formatMoney(tier.price_cents, tier.currency)}</td>
                  <td className="py-2 pr-3">{tier.qty_sold}</td>
                  <td className="py-2 pr-3">{tier.qty_pending}</td>
                  <td className="py-2">{tier.qty_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
