"use client";

import { useEffect, useState, type ReactNode } from "react";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { useIsLgUp } from "@/hooks/use-is-lg-up";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { resolveMobileNavTab } from "@/components/navigation/mobile-bottom-nav";
import { cn } from "@/lib/utils";
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
  /** Always-reachable mobile map action in the sticky header, not over listing CTAs. */
  mobileMapTrigger?: ReactNode;
  /** Opt-in compact mobile chrome. Other discovery routes retain their layout. */
  mobileFilterBar?: ReactNode;
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
  const { testId, activeSlug, title, subtitle, filterBar, notice, children, rightPanel, askComposer, mobileMapTrigger } = props;
  // This shell also renders Cafés and Nightlife, which have no phone tab bar. Reserve the bar's
  // space only where the bar is actually mounted, using the bar's own allowlist as the one source
  // of truth (so a future route change cannot leave a dead gap behind).
  const hasMobileNav = resolveMobileNavTab(usePathname()) !== null;
  const isLgUp = useIsLgUp();
  const compactMobile = props.mobileFilterBar != null && !isLgUp;
  const [headerHidden, setHeaderHidden] = useState(false);
  useEffect(() => {
    if (!compactMobile) return;
    let anchor = Math.max(0, window.scrollY);
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = Math.max(0, window.scrollY);
        if (y <= 16) {
          setHeaderHidden(false);
          anchor = y;
        } else if (y - anchor >= 24) {
          if (y > 96) setHeaderHidden(true);
          anchor = y;
        } else if (anchor - y >= 16) {
          setHeaderHidden(false);
          anchor = y;
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [compactMobile]);
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
        // SAN-1606 — one phone-only reserve for the floating tab bar, so the pinned Ask MDE bar and
        // the last card both end above it. Zero above `lg` and on routes without the bar.
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col lg:overflow-y-auto lg:pb-0",
          hasMobileNav && "pb-[var(--mde-mobile-nav-clearance)]",
        )}
        data-testid="workspace-results-column"
      >
        <header
          data-testid="workspace-header"
          data-scroll-hidden={compactMobile && headerHidden ? "true" : "false"}
          className={cn("sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-4 backdrop-blur sm:px-6",
            compactMobile && "px-3 py-2 transition-transform duration-200 motion-reduce:transition-none has-[:focus-visible]:translate-y-0",
            compactMobile && headerHidden && "-translate-y-full"
          )}
        >
          <div className={cn("flex flex-wrap items-start gap-3 sm:flex-nowrap", compactMobile && "flex-nowrap items-center gap-2")}>
            <ChatNavDrawer rail={<WorkspaceNavRail activeSlug={activeSlug} testId="workspace-nav-rail-drawer" />} />
            <div className="min-w-0 flex-1">
              <h1 className={cn("font-serif text-2xl font-semibold", compactMobile && "text-lg leading-tight")}>{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            </div>
            {compactMobile ? <MobileProfileMenu /> : <div className="flex w-full min-w-0 items-center justify-between gap-2 sm:w-auto sm:shrink-0 sm:flex-col sm:items-end">
              {mobileMapTrigger ? <div className="shrink-0 lg:hidden" data-testid="workspace-mobile-map-trigger">{mobileMapTrigger}</div> : null}
              <AuthStatus />
              <Link href="/chat" className="hidden text-sm text-primary hover:underline sm:inline">
                Ask concierge
              </Link>
            </div>}
          </div>
          {compactMobile ? <div data-testid="workspace-mobile-filters" className="mt-2">{props.mobileFilterBar}</div> : null}
        </header>
        {compactMobile && mobileMapTrigger ? <div data-testid="workspace-mobile-map-trigger">{mobileMapTrigger}</div> : null}

        {/* Not pinned: three filter rows would take a third of a laptop screen from the cards. */}
        {!compactMobile ? <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:px-6" data-testid="workspace-filters">
          {filterBar}
        </div> : null}

        {notice}
        {/* Extra phone scroll room lets the last card's buttons move above the
            sticky composer + floating tab bar instead of being covered. */}
        <div className={cn(
          "px-4 sm:px-6 lg:pb-6",
          // The composer publishes its measured height, but hydration/refresh can briefly
          // publish 0px. Keep a REAL minimum scroll reserve so a card's Details button
          // can clear both the sticky composer and mobile tab bar after a reload.
          hasMobileNav && askComposer
            ? "pb-[calc(max(var(--mde-ask-composer-height,0px),18rem)_+_5rem)] lg:pb-6"
            : "pb-24",
        )}>{children}</div>

        {askComposer ? (
          <div
            data-testid="workspace-ask-composer"
            // SAN-1606 — while stuck this bar pins above the floating tab bar instead of over it;
            // `lg:bottom-0` is the desktop behaviour it had before, and routes without the bar
            // keep the bar at the bottom edge.
            className={cn(
              "sticky z-20 mt-auto border-t border-border/60 bg-background/95 shadow-[0_-6px_16px_-14px_rgb(0_0_0/0.35)] backdrop-blur supports-[backdrop-filter]:bg-background/90 lg:bottom-0",
              hasMobileNav ? "bottom-[var(--mde-mobile-nav-clearance)]" : "bottom-0",
            )}
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

/** Reuse the actual session and sign-out form; no separate account state. */
function MobileProfileMenu() {
  return (
    <Sheet>
      <SheetTrigger render={<Button type="button" variant="outline" size="icon" className="size-11 shrink-0" aria-label="Profile" data-testid="workspace-mobile-profile" />}>
        <UserRound className="size-5" aria-hidden />
      </SheetTrigger>
      <SheetContent side="bottom" showCloseButton={false} className="rounded-t-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader className="p-0">
          <SheetTitle>Profile</SheetTitle>
          <SheetDescription>Manage your account</SheetDescription>
        </SheetHeader>
        <AuthStatus mobileMenu />
        <SheetClose render={<Button variant="outline" className="min-h-11" />}>Close</SheetClose>
      </SheetContent>
    </Sheet>
  );
}
