"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChatProvider } from "@/components/chat/chat-provider";
import { BROKER_ASK_MDE_EVENT } from "@/lib/rentals/broker-ask-mde";
import { useSession } from "@/hooks/use-session";
import { ThreadNavProvider, useThreadNav } from "@/lib/chat/thread-nav-context";
import { RentalsConciergeCenter } from "./rentals-concierge-center";

function ReadyBrokerChat({ children, sessionFallback }: { children: ReactNode; sessionFallback: ReactNode }) {
  const nav = useThreadNav();
  if (!nav.ready) return <>{sessionFallback}</>;
  return <ChatProvider persistThread sessionFallback={sessionFallback}>{children}</ChatProvider>;
}

/** One existing runtime, with a separate, owner-validated broker thread selection. */
export function BrokerChatProvider({ children, sessionFallback }: { children: ReactNode; sessionFallback: ReactNode }) {
  const { user, loading } = useSession();
  if (loading || !user) return <>{sessionFallback}</>;
  return (
    <ThreadNavProvider key={user.id} scope="broker">
      <ReadyBrokerChat sessionFallback={sessionFallback}>{children}</ReadyBrokerChat>
    </ThreadNavProvider>
  );
}

/** The route layout stays mounted across Overview / Listings transitions.
 * Ordinary navigation does not initialize AI until Ask MDE is opened.
 * Collapse keeps the one chat mounted (including draft and live run).
 */
export function RentalsAskMde({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const mode = params.get("mode");
  const conciergeRoute = pathname === "/app/rentals" && (!mode || mode === "concierge");
  const [activated, setActivated] = useState(conciergeRoute);
  const [expanded, setExpanded] = useState(conciergeRoute);
  const [focusRequest, setFocusRequest] = useState(0);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conciergeRoute) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) { setActivated(true); setExpanded(true); }
    });
    return () => { cancelled = true; };
  }, [conciergeRoute]);

  const openChat = useCallback(() => {
    setActivated(true);
    setExpanded(true);
    setFocusRequest((n) => n + 1);
  }, []);

  useEffect(() => {
    const onAsk = (event: Event) => {
      event.preventDefault();
      openChat();
    };
    window.addEventListener(BROKER_ASK_MDE_EVENT, onAsk);
    return () => window.removeEventListener(BROKER_ASK_MDE_EVENT, onAsk);
  }, [openChat]);

  useEffect(() => {
    if (!focusRequest || !expanded) return;
    const target = panel.current;
    if (!target) return;
    // The SDK input may mount after session restoration. Focus the panel now,
    // then its native composer if focus is still within this requested region.
    target.focus();
    const focusInput = () => {
      const input = target.querySelector<HTMLElement>('textarea, [contenteditable="true"]');
      if (!input || input.matches(":disabled") || document.activeElement !== target) return false;
      input.focus();
      return true;
    };
    if (focusInput()) return;
    const observer = new MutationObserver(() => { if (focusInput()) observer.disconnect(); });
    observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
    return () => observer.disconnect();
  }, [focusRequest, expanded]);

  return (
    <>
      <div className="min-w-0">{children}</div>
      <section data-testid="rentals-ask-mde-slot" aria-label="Ask MDE"
        className="sticky bottom-0 z-10 min-w-0 rounded-lg border border-border bg-background p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Ask MDE about your rentals</span>
          <button type="button" aria-controls="rentals-ask-mde-panel" aria-expanded={expanded}
            onClick={expanded ? () => setExpanded(false) : openChat}
            className="rounded-md border border-border px-3 py-1 text-sm">
            {expanded ? "Collapse chat" : "Open chat"}
          </button>
        </div>
        <div id="rentals-ask-mde-panel" ref={panel} tabIndex={-1} hidden={!expanded}
          className={expanded ? "mt-2 flex h-[min(26rem,45dvh)] min-h-0 min-w-0 flex-col overflow-hidden" : "hidden"}>
          {activated && <BrokerChatProvider sessionFallback={
            <div role="status" className="p-4 text-sm text-muted-foreground">Loading Ask MDE…</div>
          }>
            <RentalsConciergeCenter mode="concierge" />
          </BrokerChatProvider>}
        </div>
      </section>
    </>
  );
}
