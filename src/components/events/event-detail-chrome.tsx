"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Share2, Ticket } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import { VENUE_PLACEHOLDER_GRADIENT } from "@/components/browse/venue-card-placeholder";
import { EVENT_TIME_ZONE } from "@/lib/events/format-event";

const HEADER_LINK = "inline-flex min-h-11 items-center rounded-full px-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const HEADER_ACTION = "inline-flex min-h-11 items-center rounded-full border border-primary px-3 text-sm font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Guest and signed-in controls in the event header, using the same wording and
 * shapes as the home header. `next` is the current event path, so signing in
 * returns the visitor to the event they were reading instead of the home page.
 */
function EventHeaderAuth({ nextPath }: { nextPath: string }) {
  const { user, loading } = useSession();
  const next = encodeURIComponent(nextPath);
  // Reserve nothing while the session resolves: a placeholder CTA that turns into
  // controls a moment later is worse than a single reflow of this small group.
  if (loading) return null;
  if (!user) {
    return (
      <div className="flex shrink-0 items-center gap-1" data-testid="event-guest-auth">
        <Link href={`/login?next=${next}`} className={HEADER_LINK} data-testid="event-sign-in">Sign in</Link>
        <Link href={`/signup?next=${next}`} className={HEADER_ACTION} data-testid="event-sign-up">Sign up</Link>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1" data-testid="event-user-auth">
      <Link href="/app" className={HEADER_LINK} data-testid="event-account">Account</Link>
      <Link href="/app/me/tickets" className={HEADER_ACTION} data-testid="event-my-tickets">
        <Ticket aria-hidden className="size-4 sm:hidden" />
        <span className="hidden sm:inline">My tickets</span>
        <span className="sr-only sm:hidden">My tickets</span>
      </Link>
    </div>
  );
}

/** Share outcomes are exclusive: native success, cancellation or clipboard fallback. */
export function EventDetailNavigation({ eventName, returnPath, backTo = "events" }: {
  eventName: string; returnPath: string; backTo?: "events" | "chat";
}) {
  const [shareStatus, setShareStatus] = useState("");
  const shareEvent = async () => {
    const url = new URL(returnPath, window.location.origin).href;
    setShareStatus("");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: eventName, url });
        setShareStatus("Event shared");
        return; // Native share succeeded. Clipboard is only a fallback.
      } catch (error) {
        if (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError") return;
        // A blocked native share can still recover through the clipboard below.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("Link copied");
    } catch {
      setShareStatus("Unable to copy. You can copy the address from your browser.");
    }
  };

  return (
        <header className="border-b border-border/70 bg-background/95 backdrop-blur">
          <nav aria-label="Event navigation"
            className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
            <Link href={backTo === "chat" ? "/chat" : "/events"} data-testid="event-back"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}>
              <ArrowLeft className="size-4" aria-hidden />
              <span className="hidden sm:inline">{backTo === "chat" ? "Back to chat" : "Back to Events"}</span>
              <span className="sm:hidden">Back</span>
            </Link>
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
              <span className="hidden max-w-40 truncate text-xs text-muted-foreground md:inline">
                {shareStatus}
              </span>
              <EventHeaderAuth nextPath={returnPath} />
              <Button type="button" variant="outline" size="sm" onClick={shareEvent}
                data-testid="event-share" aria-label="Share this event" className="shrink-0">
                <Share2 className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">Share</span>
              </Button>
            </div>
          </nav>
          <p aria-live="polite" className="sr-only" data-testid="event-share-announcement">{shareStatus}</p>
        </header>
  );
}

/** Local image error falls back to neutral media, not an invented event photo. */
export function EventDetailHero({ imageUrl, eventName, startsAt }: { imageUrl: string | null; eventName: string; startsAt: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const part = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { ...opts, timeZone: EVENT_TIME_ZONE }).format(new Date(startsAt));
  return (
            <div className="order-1 lg:col-start-1 lg:row-start-1">
              {imageUrl && !imageFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt={`Event image for ${eventName}`}
                  onError={() => setImageFailed(true)}
                  className="aspect-[16/10] w-full rounded-xl bg-muted object-cover"
                  data-testid="event-hero-image" />
              ) : (
                <div className="flex aspect-[16/10] flex-col items-center justify-center gap-1 rounded-xl border border-primary/10 text-primary"
                  style={{ background: VENUE_PLACEHOLDER_GRADIENT }}
                  data-testid="event-image-placeholder" role="img" aria-label="No event photo available">
                  <span className="text-7xl font-semibold leading-none tracking-tight" data-testid="event-date-tile-day">{part({ day: "numeric" })}</span>
                  <span className="text-xl font-medium">{part({ month: "long" })}</span>
                  <span className="text-sm text-primary/70">{part({ weekday: "long" })}</span>
                  <span className="text-sm font-medium text-primary/80">{part({ year: "numeric" })}</span>
                  <span className="mt-2 text-xs text-primary/70">Event photo not available</span>
                </div>
              )}
            </div>
  );
}
