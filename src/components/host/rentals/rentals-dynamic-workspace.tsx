"use client";

import Link from "next/link";
import { Building2, CalendarClock, Users } from "lucide-react";
import { MdeDashboardRenderProvider } from "@/components/copilot/a2ui/mde-dashboard-surface";
import { useGenerativeUIRuntime } from "@copilotkit/react-core/v2/generative-ui/native";
import { BrokerOverviewSurface } from "@/components/host/rentals/broker-overview-surface";
import { BrokerViewingRequests } from "@/components/host/rentals/broker-viewing-requests";
import { Badge } from "@/components/ui/badge";
import { brokerViewingStatusLabel } from "@/lib/rentals/broker-viewing-action";
import { APP_RENTALS_ROUTE } from "@/lib/rentals/broker-ask-mde";
import type { BrokerAttentionItem, BrokerDashboardView } from "@/lib/rentals/broker-dashboard-types";

export type RentalsWorkspaceMode = "concierge" | "overview";

type RentalsDynamicWorkspaceProps = {
  mode: RentalsWorkspaceMode;
  /** SAN-1204 · real, RLS-scoped broker data. Absent only before the loader resolves. */
  dashboard?: BrokerDashboardView | null;
  loadError?: string | null;
  /** Route family the Overview links to; the same tree the page is mounted under. */
  basePath?: string;
};

/**
 * Right column — the broker's real workspace.
 *
 * SAN-1710 · Overview is now the whole Rentals content width, in natural page
 * flow: no right-column border, no `overflow-y-auto` and no tab strip. The
 * official Card/Grid surface renders from the loaded view; the native block
 * below is the honest server-render/fallback and mirrors the same composition.
 */
// skipcq: JS-0067 - ES module export; not browser global scope
export function RentalsDynamicWorkspace({
  mode,
  dashboard = null,
  loadError = null,
  basePath = "/app/rentals",
}: RentalsDynamicWorkspaceProps) {
  const requests = dashboard?.viewingRequests ?? [];
  const stateLabel = loadError ? "Unavailable" : dashboard ? "Live" : "Not loaded";

  const requestsSurface = !dashboard && !loadError ? (
    <p role="status" className="text-xs text-muted-foreground">
      Viewing request data is not loaded.
    </p>
  ) : (
    <BrokerViewingRequests
      requests={requests}
      total={dashboard?.viewingRequestsTotal}
      loadError={loadError}
    />
  );

  if (mode === "overview") {
    if (loadError) {
      return (
        <section data-testid="rc-right" aria-label="Broker overview workspace" className="min-w-0 space-y-3">
          <h2 className="font-serif text-2xl font-semibold">Overview</h2>
          <p className="text-sm text-muted-foreground">
            Manage your rentals, enquiries and appointments.
          </p>
          <div
            data-testid="broker-overview-error"
            role="alert"
            className="rounded-xl border border-border bg-card p-4 text-sm text-destructive"
          >
            {loadError}
          </div>
          <p className="text-xs text-muted-foreground">
            The dashboard could not load, so no counts are shown. Nothing has been changed.
          </p>
        </section>
      );
    }
    if (!dashboard) {
      return (
        <section data-testid="rc-right" aria-label="Broker overview workspace" className="min-w-0 space-y-3">
          <h2 className="font-serif text-2xl font-semibold">Overview</h2>
          <p className="text-sm text-muted-foreground">
            Manage your rentals, enquiries and appointments.
          </p>
          <p role="status" className="text-xs text-muted-foreground">
            Viewing request data is not loaded.
          </p>
        </section>
      );
    }
    return (
      <section data-testid="rc-right" aria-label="Broker overview workspace" className="min-w-0">
        <OverviewSurface dashboard={dashboard} basePath={basePath} />
      </section>
    );
  }

  return (
    <aside
      data-testid="rc-right"
      className="flex min-h-0 flex-col gap-3 overflow-y-auto border-border lg:border-l lg:pl-4"
      aria-label="Broker context workspace"
    >
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <h2 className="font-serif text-base font-semibold">Workspace</h2>
        <Badge variant="secondary" className="ml-auto text-xs">
          {stateLabel}
        </Badge>
      </div>

      <section data-testid="ctx-viewing-requests" className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Viewing requests
        </h3>
        {requestsSurface}
      </section>

      {dashboard && !loadError && requests.length === 0 ? (
        <p
          data-testid="ctx-empty"
          className="text-xs text-muted-foreground"
        >
          Your broker viewing requests will appear here when renters submit them.
        </p>
      ) : null}
    </aside>
  );
}

/**
 * The overview surface needs one transport-free dashboard runtime. The /app route
 * already provides it from `RentalsBrokerFrame`; the legacy /host route does not,
 * so mount one here instead of inheriting the concierge chat's runtime. This
 * cannot connect to the AI backend and never starts a model turn.
 */
function OverviewSurface({ dashboard, basePath }: { dashboard: BrokerDashboardView; basePath: string }) {
  const runtime = useGenerativeUIRuntime();
  const surface = (
    <BrokerOverviewSurface
      dashboard={dashboard}
      basePath={basePath}
      fallback={<BrokerOverviewFallback dashboard={dashboard} basePath={basePath} />}
    />
  );
  return runtime ? surface : <MdeDashboardRenderProvider>{surface}</MdeDashboardRenderProvider>;
}

function AttentionIcon({ item }: { item: BrokerAttentionItem }) {
  const Icon = item.kind === "lead_unanswered" ? Users : item.kind === "viewing_pending" ? CalendarClock : Building2;
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
      <Icon className="size-4" />
    </span>
  );
}

/**
 * The no-surface rendering of the same Overview. It is what the server sends and
 * what a broker sees if official components cannot render, so it must never show a
 * different number, a fake row or an actionable control that has no handler.
 * Viewing actions stay available on the Concierge pane of the same workspace.
 */
function BrokerOverviewFallback({ dashboard, basePath }: { dashboard: BrokerDashboardView; basePath: string }) {
  const conciergeHref = basePath === APP_RENTALS_ROUTE ? `${basePath}?mode=concierge` : basePath;
  return (
    <div data-testid="broker-overview-fallback" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-serif text-2xl font-semibold">Overview</h2>
          <p className="text-sm text-muted-foreground">
            Manage your rentals, enquiries and appointments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={conciergeHref} className="rounded-full border border-border px-3 py-1.5 text-sm font-medium">
            Ask MDE
          </Link>
          <Link href={`${basePath}/onboarding`} className="rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
            New listing
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {dashboard.kpis.slice(0, 4).map((kpi) => (
          <div key={kpi.id} data-testid={kpi.testId} className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
            <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{kpi.value}</div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-serif text-lg font-semibold">Needs attention</h3>
        {dashboard.attention.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {dashboard.attention.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2">
                <AttentionIcon item={item} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="block text-xs text-muted-foreground">{item.detail}</span>
                </span>
                {item.action ? (
                  <Link
                    href={item.action === "ask_mde" ? conciergeHref : `${basePath}/listings`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {item.ctaLabel}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Nothing needs your attention right now.</p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-serif text-lg font-semibold">Today</h3>
          <span className="text-xs text-muted-foreground">Medellín time</span>
        </div>
        {dashboard.todaySchedule.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {dashboard.todaySchedule.map((request) => (
              <li key={request.showingId} className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm font-semibold tabular-nums">{request.scheduledTimeLabel}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{request.apartmentTitle ?? "Your listing"}</span>
                  {request.apartmentNeighborhood ? (
                    <span className="block text-xs text-muted-foreground">{request.apartmentNeighborhood}</span>
                  ) : null}
                </span>
                <Badge variant="secondary" className="text-xs">{brokerViewingStatusLabel(request.status)}</Badge>
              </li>
            ))}
          </ul>
        ) : dashboard.todayTotal === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No viewings scheduled for today.</p>
        ) : null}
        {dashboard.todaySchedule.length < dashboard.todayTotal ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing {dashboard.todaySchedule.length} of {dashboard.todayTotal} appointments today.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-serif text-lg font-semibold">Upcoming</h3>
          <span className="text-xs text-muted-foreground">After today</span>
        </div>
        {dashboard.upcomingPreview.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {dashboard.upcomingPreview.map((request) => (
              <li key={request.showingId} className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold">{request.scheduledLabel}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{request.apartmentTitle ?? "Your listing"}</span>
                <Badge variant="secondary" className="text-xs">{brokerViewingStatusLabel(request.status)}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No upcoming appointments after today.</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {dashboard.upcomingPreviewTotal > dashboard.upcomingPreview.length
            ? `Showing the next ${dashboard.upcomingPreview.length} of ${dashboard.upcomingPreviewTotal} upcoming appointments after today.`
            : `All ${dashboard.upcomingPreviewTotal} upcoming appointment${dashboard.upcomingPreviewTotal === 1 ? "" : "s"} after today.`}
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        <Link href={conciergeHref} className="font-medium text-primary hover:underline">
          Open the Concierge workspace
        </Link>{" "}
        to manage viewing requests. All counts are read from your own listings, enquiries and
        viewings.
      </p>
    </div>
  );
}
