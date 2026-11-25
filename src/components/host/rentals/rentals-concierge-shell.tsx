"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MdeDashboardRenderProvider, MdeDashboardSurface } from "@/components/copilot/a2ui/mde-dashboard-surface";
import { BrokerChatProvider, RentalsAskMde } from "@/components/host/rentals/rentals-ask-mde";
import { APP_RENTALS_ROUTE } from "@/lib/rentals/broker-ask-mde";
import { HostRentalsNav } from "@/components/host/rentals/host-rentals-nav";
import { RentalsConciergeCenter } from "@/components/host/rentals/rentals-concierge-center";
import { RentalsConversationHistory } from "@/components/host/rentals/rentals-conversation-history";
import {
  RentalsDynamicWorkspace,
  type RentalsWorkspaceMode,
} from "@/components/host/rentals/rentals-dynamic-workspace";
import { cn } from "@/lib/utils";
import type { BrokerDashboardView } from "@/lib/rentals/broker-dashboard-types";

type MobilePane = "feed" | "chat" | "workspace";

export type RentalsConciergeShellProps = {
  workspaceMode?: RentalsWorkspaceMode;
  /** SAN-1204 · real broker data loaded on the server; never fetched in the browser. */
  dashboard?: BrokerDashboardView | null;
  loadError?: string | null;
  /** Route family for the domain nav; defaults to the legacy host tree. */
  basePath?: string;
};

const RENTALS_HEADER_OPERATIONS = [{
  version: "1.0",
  createSurface: {
    surfaceId: "rentals-workspace-header",
    components: [
      { id: "root", component: "Column", gap: 1, children: ["title", "caption"] },
      { id: "title", component: "Title", size: "xl", text: "Rentals workspace" },
      { id: "caption", component: "Caption", text: "Manage your listings and viewing requests." },
    ],
  },
}];

/**
 * Persistent frame for the /app/rentals broker route group only.
 * The legacy /host/rentals shell owns its own navigation and chat. Keep
 * that route separate until it is migrated; no speculative basePath API.
 * Page children own data; Ask MDE auto-opens only on the explicit
 * `?mode=concierge` route and otherwise waits for the toggle or header event.
 */
export function RentalsBrokerFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // SAN-1685 — the Overview has no visible page-level heading of its own, so the
  // frame supplies one visually hidden h1. Other pages in this route group
  // (Listings, onboarding) already render their own h1, so the frame must not
  // add a second one there.
  return (
    <MdeDashboardRenderProvider>
      <div data-testid="rentals-broker-frame" className="flex min-w-0 flex-col gap-4">
        {pathname === APP_RENTALS_ROUTE ? <h1 className="sr-only">Rentals overview</h1> : null}
        <MdeDashboardSurface
          surfaceId="rentals-workspace-header"
          operations={RENTALS_HEADER_OPERATIONS}
          fallback={<div><h2 className="font-serif text-xl font-semibold">Rentals workspace</h2><p className="text-sm text-muted-foreground">Manage your listings and viewing requests.</p></div>}
        />
        <HostRentalsNav basePath={APP_RENTALS_ROUTE} />
        <RentalsAskMde>{children}</RentalsAskMde>
      </div>
    </MdeDashboardRenderProvider>
  );
}

/**
 * SAN-1093 · RE-DES-002 Phase A — broker three-panel shell (kit: RentalsConcierge.jsx).
 * CopilotChat + brokerAgent wire in SAN-1124 / SAN-1035.
 */
// skipcq: JS-0067 - ES module export; not browser global scope
export function RentalsConciergeShell({
  workspaceMode = "concierge",
  dashboard = null,
  loadError = null,
  basePath = "/host/rentals",
}: RentalsConciergeShellProps) {
  const [mobilePane, setMobilePane] = useState<MobilePane>("chat");
  // /app owns the single persistent bottom chat in its route layout.
  // The legacy host keeps its separate three-panel presentation.
  if (basePath === APP_RENTALS_ROUTE) {
    return (
      <div data-testid="rentals-concierge" className="min-w-0">
        <RentalsDynamicWorkspace mode="overview" dashboard={dashboard} loadError={loadError} />
      </div>
    );
  }

  const workspace = (
    <>
      <div className={cn("min-h-0 min-w-0", mobilePane !== "chat" && "max-lg:hidden", "lg:block")}>
        <RentalsConciergeCenter mode={workspaceMode} />
      </div>
      <div className={cn("min-h-0 min-w-0", mobilePane !== "workspace" && "max-lg:hidden", "lg:block")}>
        <RentalsDynamicWorkspace mode={workspaceMode} dashboard={dashboard} loadError={loadError} />
      </div>
    </>
  );

  return (
    <div
      data-testid="rentals-concierge"
      className="flex min-h-[calc(100dvh-7rem)] flex-col gap-3 md:min-h-[calc(100dvh-5rem)]"
    >
      <HostRentalsNav basePath={basePath} />

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-4",
          "max-lg:flex max-lg:flex-col",
          "lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(300px,340px)]",
        )}
      >
        <div
          className={cn(
            "min-h-0",
            mobilePane !== "feed" && "max-lg:hidden",
            "lg:block",
          )}
        >
          <RentalsConversationHistory dashboard={dashboard} />
        </div>

        <BrokerChatProvider sessionFallback={
          <div role="status" className="min-h-32 rounded-lg border border-border p-4 text-sm text-muted-foreground lg:col-span-2">
            Loading your workspace…
          </div>
        }>
          {workspace}
        </BrokerChatProvider>
      </div>

      <nav
        className="flex shrink-0 gap-1 border-t border-border pt-2 lg:hidden"
        aria-label="Concierge mobile panes"
      >
        {(
          [
            { id: "feed" as const, label: "Feed" },
            { id: "chat" as const, label: "Chat" },
            { id: "workspace" as const, label: "Workspace" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobilePane(tab.id)}
            className={cn(
              "flex-1 rounded-md py-2 text-sm font-medium",
              mobilePane === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
