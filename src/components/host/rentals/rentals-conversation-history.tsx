"use client";

import type { BrokerDashboardView } from "@/lib/rentals/broker-dashboard-types";

/** Real broker attention from the same RLS-governed dashboard as the actions. */
export function RentalsConversationHistory({
  dashboard,
}: {
  dashboard: BrokerDashboardView | null;
}) {
  return (
    <aside
      data-testid="rc-left"
      className="flex min-h-0 flex-col gap-3 overflow-y-auto border-border lg:border-r lg:pr-4"
      aria-label="Broker attention feed"
    >
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Your attention feed
      </h2>
      {!dashboard ? (
        <p className="text-sm text-muted-foreground">No dashboard data loaded.</p>
      ) : dashboard.attention.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No actions need your attention right now.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Real broker attention">
          {dashboard.attention.map((item) => (
            <li key={item.id} data-testid={`rc-attention-${item.id}`}
              className="rounded-lg border border-border bg-card p-3">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        The workspace shows your actual requests and available actions.
      </p>
    </aside>
  );
}
