"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DiscoveryAskComposer, EVENT_DETAIL_ASK_SUGGESTIONS } from "@/components/chat/discovery-ask-composer";
import { DiscoveryPageContext, type DiscoveryPage } from "@/components/chat/discovery-page-context";
import { ASK_MDE_OPEN_EVENT } from "@/lib/chat/ask-mde-bridge";

type AssistantRoute = {
  pattern: RegExp;
  page: Exclude<DiscoveryPage, "rentals">;
  title: string;
  /**
   * `bubble`: no other Ask MDE entry point exists on this page, so show the launcher.
   * `page-action`: the page already owns a prominent Ask MDE control and opens this
   * assistant through `openAskMde()`, so a floating bubble would duplicate it.
   */
  entry: "bubble" | "page-action";
  /** Events receive their exact selected id from the page, which knows the real event. */
  ownsSelection: boolean;
};

const ROUTES: AssistantRoute[] = [
  // Browse pages (/events, /restaurants, …) already render this same composer inline
  // and are intentionally absent: one assistant per page, not two.
  { pattern: /^\/restaurants\/[^/]+\/?$/, page: "restaurants", title: "Ask about this restaurant", entry: "bubble", ownsSelection: false },
];

/** Route -> assistant ownership. Pure so the component itself stays a thin shell. */
// skipcq: JS-0067 - module-local helper; not browser global scope
export function matchAssistantRoute(pathname: string): AssistantRoute | null {
  return ROUTES.find((candidate) => candidate.pattern.test(pathname)) ?? null;
}

/**
 * The single customer-facing Ask MDE surface.
 *
 * It deliberately reuses the discovery composer and the root CopilotKit provider that
 * already owns `conciergeAgent`, the thread id and saved history. There is no second
 * provider, no second conversation store, and no model run on mount: a turn starts
 * only when the visitor sends one.
 */
// skipcq: JS-0067 - module-local React component; not browser global scope
export function AskMdeSheet() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const route = matchAssistantRoute(pathname ?? "");

  useEffect(() => {
    if (!route) return;
    const openAssistant = () => setOpen(true);
    window.addEventListener(ASK_MDE_OPEN_EVENT, openAssistant);
    return () => window.removeEventListener(ASK_MDE_OPEN_EVENT, openAssistant);
  }, [route]);

  if (!route) return null;

  return (
    <>
      {route.entry === "bubble" ? (
        <button
          type="button"
          data-testid="ask-mde-launcher"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="ask-mde-drawer"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-[calc(var(--mde-mobile-nav-clearance)+1rem)] z-30 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:bottom-6"
        >
          <Sparkles aria-hidden className="size-4" />
          Ask MDE
        </button>
      ) : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          id="ask-mde-drawer"
          side="right"
          data-testid="ask-mde-drawer"
          className="w-full gap-0 p-0 data-[side=right]:w-full sm:data-[side=right]:max-w-md"
        >
          <SheetHeader className="border-b border-border px-4 py-3 pr-14">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles aria-hidden className="size-4 text-primary" />
              Ask MDE
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              {route.title}. Answers use this page&apos;s real listing, tickets and location.
            </SheetDescription>
            <Link href="/chat" className="mt-1 inline-flex min-h-9 items-center text-xs font-medium text-primary underline-offset-4 hover:underline">
              Open full chat
            </Link>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {route.ownsSelection ? null : <DiscoveryPageContext page={route.page} filters={{}} />}
            {/* Only the event drawer offers starter questions: they assume this event's
                tickets, meeting point and start time, which other pages cannot promise. */}
            <DiscoveryAskComposer
              page={route.page}
              suggestions={route.page === "events" ? EVENT_DETAIL_ASK_SUGGESTIONS : undefined}
              hideHeading
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
