"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AuthStatus } from "@/components/auth/auth-status";
import { WorkspaceNavRail } from "@/components/browse/workspace-nav-rail";
import { ChatNavDrawer } from "@/components/chat/chat-nav-drawer";

export type DiscoveryWorkspaceProps = {
  testId: string;
  /** Which side-menu item is the current page (a slug from the Explore or Library groups). */
  activeSlug: string;
  title: string;
  subtitle: string;
  filterBar: ReactNode;
  notice?: ReactNode;
  children: ReactNode;
  /** Right column on desktop: the map, optionally with a details panel over it. */
  rightPanel?: ReactNode;
  /**
   * SAN-1421 — the page's own chat entry point, pinned to the bottom of the results column.
   * Optional on purpose: this layout still renders with no chat stack at all, and the caller decides
   * which conversation (if any) belongs on its page.
   */
  askComposer?: ReactNode;
};

/**
 * SAN-1421 — the shared discovery workspace: side menu | results | map or details.
 *
 * Same column grid as /chat (`ChatCanvas`), so the pages feel like one product. On a desktop the
 * results and the map are separate scroll areas, and the page itself never scrolls, so the map
 * stays put while the list moves. On a phone it is one normal column with a menu button in the
 * header; the map and the details open as sheets (rendered by the caller).
 *
 * It carries no chat session and no provider. The Ask MDE box is added later, once there is one
 * shared conversation per browser tab (SAN-1088).
 */
export function DiscoveryWorkspace(props: DiscoveryWorkspaceProps) {
  const { testId, activeSlug, title, subtitle, filterBar, notice, children, rightPanel, askComposer } = props;
  return (
    <div
      data-testid={testId}
      className={rightPanel ? "flex min-h-dvh flex-col lg:grid lg:h-dvh lg:grid-cols-[208px_minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)]" : "flex min-h-dvh flex-col lg:grid lg:h-dvh lg:grid-cols-[208px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[240px_minmax(0,1fr)]"}
    >
      <aside
        className="hidden min-h-0 overflow-y-auto border-r border-border p-4 lg:flex lg:flex-col"
        aria-label="Left navigation"
      >
        <WorkspaceNavRail activeSlug={activeSlug} />
      </aside>

      <main
        id="main-content"
        className="flex min-h-0 min-w-0 flex-1 flex-col lg:overflow-y-auto"
        data-testid="workspace-results-column"
      >
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
          <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
            <ChatNavDrawer rail={<WorkspaceNavRail activeSlug={activeSlug} testId="workspace-nav-rail-drawer" />} />
            <div className="min-w-0 flex-1">
              <h1 className="font-serif text-2xl font-semibold">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <div className="flex w-full min-w-0 justify-end gap-1 sm:w-auto sm:shrink-0 sm:flex-col sm:items-end">
              <AuthStatus />
              <Link href="/chat" className="hidden text-sm text-primary hover:underline sm:inline">
                Ask concierge
              </Link>
            </div>
          </div>
        </header>

        {/* Not pinned: three filter rows would take a third of a laptop screen from the cards. */}
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:px-6" data-testid="workspace-filters">
          {filterBar}
        </div>

        {notice}
        <div className="px-4 pb-24 sm:px-6 lg:pb-6">{children}</div>

        {askComposer ? (
          <div
            data-testid="workspace-ask-composer"
            className="sticky bottom-0 z-20 mt-auto border-t border-border/60 bg-background/95 shadow-[0_-6px_16px_-14px_rgb(0_0_0/0.35)] backdrop-blur supports-[backdrop-filter]:bg-background/90"
          >
            {askComposer}
          </div>
        ) : null}
      </main>

      {rightPanel ? <aside
        className="relative hidden min-h-0 p-3 lg:block"
        aria-label="Map and details"
        data-testid="workspace-right-column"
      >
        {rightPanel}
      </aside> : null}
    </div>
  );
}
