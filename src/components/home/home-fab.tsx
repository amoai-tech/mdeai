"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageSquareIcon, ArrowUpIcon } from "lucide-react";

export function HomeFab() {
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
  };

  return (
    <div
      // SAN-1606 — on a phone the five-tab bar already opens Chat, so the floating "Ask the
      // concierge" pill would be a duplicate. It is desktop-only now; scroll-to-top stays on both
      // and sits above the tab bar instead of under it.
      className="fixed bottom-[calc(var(--mde-mobile-nav-clearance)+0.5rem)] right-4 z-40 flex flex-col items-end gap-2 sm:right-6 lg:bottom-6"
    >
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          aria-label="Scroll to top"
          className="flex size-11 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md transition-all duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
        >
          <ArrowUpIcon className="size-4" aria-hidden="true" />
        </button>
      )}
      <Link
        href="/chat"
        data-testid="home-fab-chat"
        aria-label="Open AI concierge"
        className="hidden min-h-[52px] items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-lg transition-all duration-200 hover:bg-accent/90 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 motion-reduce:transition-none lg:flex"
      >
        <MessageSquareIcon className="size-4 shrink-0" aria-hidden="true" />
        <span>Ask the concierge</span>
      </Link>
    </div>
  );
}
