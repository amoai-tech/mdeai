"use client";

import { useState, type ReactNode } from "react";
import { MdeDashboardRenderProvider, MdeDashboardSurface } from "@/components/copilot/a2ui/mde-dashboard-surface";
import { ChatProvider } from "@/components/chat/chat-provider";
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

/** Persistent /app route frame. Page children own data; no loader or agent runs here. */
export function RentalsBrokerFrame({ children }: { children: ReactNode }) {
  return (
    <MdeDashboardRenderProvider>
      <div data-testid="rentals-broker-frame" className="flex min-w-0 flex-col gap-4">
        <MdeDashboardSurface
          surfaceId="rentals-workspace-header"
          operations={RENTALS_HEADER_OPERATIONS}
          fallback={<div><h2 className="font-serif text-xl font-semibold">Rentals workspace</h2><p className="text-sm text-muted-foreground">Manage your listings and viewing requests.</p></div>}
        />
        <HostRentalsNav basePath="/app/rentals" />
        <div className="min-w-0">{children}</div>
        {/* SAN-1685 owns the actual persistent composer. No second chat here. */}
        <div data-testid="rentals-ask-mde-slot" />
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
  // The /app route group owns its transport-free renderer and navigation.
  // Keep the existing concierge available, but make the chosen Overview the
  // full-width primary content on every viewport. The legacy host route stays compatible.
  if (basePath === "/app/rentals" && workspaceMode === "overview") {
    return (
      <div data-testid="rentals-concierge" className="min-w-0">
        <RentalsDynamicWorkspace mode={workspaceMode} dashboard={dashboard} loadError={loadError} />
      </div>
    );
  }

  const workspace = (
    <>
      <div className={cn("min-h-0 min-w-0", mobilePane !== "chat" && "max-lg:hidden", "lg:block")}>
        {basePath === "/app/rentals" ? (
          <ChatProvider persistThread sessionFallback={
            <div role="status" className="p-4 text-sm text-muted-foreground">Loading Ask MDE…</div>
          }>
            <RentalsConciergeCenter mode={workspaceMode} />
          </ChatProvider>
        ) : (
          <RentalsConciergeCenter mode={workspaceMode} />
        )}
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
      {basePath !== "/app/rentals" && <HostRentalsNav basePath={basePath} />}

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

        {basePath === "/app/rentals" ? workspace : (
          <ChatProvider persistThread sessionFallback={
            <div role="status" className="min-h-32 rounded-lg border border-border p-4 text-sm text-muted-foreground lg:col-span-2">
              Loading your workspace…
            </div>
          }>
            {workspace}
          </ChatProvider>
        )}
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
