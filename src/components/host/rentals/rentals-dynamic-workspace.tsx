"use client";

import { Sparkles } from "lucide-react";
import { BrokerViewingRequests } from "@/components/host/rentals/broker-viewing-requests";
import { Badge } from "@/components/ui/badge";
import type { BrokerDashboardView } from "@/lib/rentals/broker-dashboard-types";
import { DATA_PENDING_LABEL } from "@/lib/rentals/data-pending";

export type RentalsWorkspaceMode = "concierge" | "overview";

type RentalsDynamicWorkspaceProps = {
  mode: RentalsWorkspaceMode;
  /** SAN-1204 · real, RLS-scoped broker data. Absent only before the loader resolves. */
  dashboard?: BrokerDashboardView | null;
  loadError?: string | null;
};

/**
 * Right column — the broker's real workspace.
 *
 * SAN-1204 · this used to render static Phase-A placeholders, so a broker opening
 * `/host/rentals` saw "Data pending" instead of their actual viewing requests. It now renders
 * the loaded dashboard view. The concierge chat context is still Phase C (SAN-1124), so that
 * hint stays only when there is nothing else to say.
 */
// skipcq: JS-0067 - ES module export; not browser global scope
export function RentalsDynamicWorkspace({
  mode,
  dashboard = null,
  loadError = null,
}: RentalsDynamicWorkspaceProps) {
  const requests = dashboard?.viewingRequests ?? [];

  const requestsSurface = (
    <BrokerViewingRequests requests={requests} loadError={loadError} />
  );

  if (mode === "overview") {
    return (
      <aside
        data-testid="rc-right"
        className="flex min-h-0 flex-col gap-3 overflow-y-auto border-border lg:border-l lg:pl-4"
        aria-label="Broker overview workspace"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-accent" aria-hidden />
          <h2 className="font-serif text-base font-semibold">Overview</h2>
          <Badge variant="secondary" className="ml-auto text-xs">
            Live
          </Badge>
        </div>

        <section data-testid="ctx-viewing-requests" className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Viewing requests
          </h3>
          {requestsSurface}
        </section>

        <div data-testid="ctx-analytics" className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="grid grid-cols-2 gap-2">
            {(dashboard?.kpis ?? []).map((kpi) => (
              <div
                key={kpi.id}
                data-testid={kpi.testId}
                className="rounded-md border border-border bg-background p-3"
              >
                <div className="text-xs text-muted-foreground">{kpi.label}</div>
                <div className="font-mono text-lg font-semibold">{kpi.value}</div>
              </div>
            ))}
            {dashboard === null ? (
              <div
                data-testid="r1-kpi-0"
                className="rounded-md border border-border bg-background p-3"
              >
                <div className="text-xs text-muted-foreground">Metric</div>
                <div className="font-mono text-lg font-semibold">{DATA_PENDING_LABEL}</div>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      data-testid="rc-right"
      className="flex min-h-0 flex-col gap-3 overflow-y-auto border-border lg:border-l lg:pl-4"
      aria-label="Broker context workspace"
    >
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Sparkles className="size-4 text-accent" aria-hidden />
        <h2 className="font-serif text-base font-semibold">Workspace</h2>
        <Badge variant="secondary" className="ml-auto text-xs">
          Live
        </Badge>
      </div>

      <section data-testid="ctx-viewing-requests" className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Viewing requests
        </h3>
        {requestsSurface}
      </section>

      {requests.length === 0 ? (
        <p
          data-testid="ctx-empty"
          className="text-xs text-muted-foreground"
        >
          Ask the concierge and listing, lead, viewing, or map context appears here too. Chat
          ships with <span className="font-medium text-foreground">brokerAgent</span> in Phase C.
        </p>
      ) : null}
    </aside>
  );
}
