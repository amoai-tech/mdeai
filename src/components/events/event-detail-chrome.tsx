"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Share2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VENUE_PLACEHOLDER_GRADIENT } from "@/components/browse/venue-card-placeholder";
import { EVENT_TIME_ZONE } from "@/lib/events/format-event";

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
            className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
            <Link href={backTo === "chat" ? "/chat" : "/events"} data-testid="event-back"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}>
              <ArrowLeft className="size-4" aria-hidden /> {backTo === "chat" ? "Back to chat" : "Back to Events"}
            </Link>
            <span className="hidden text-sm font-medium text-muted-foreground sm:inline">mdeai</span>
            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden max-w-48 truncate text-xs text-muted-foreground sm:inline">
                {shareStatus}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={shareEvent}
                data-testid="event-share">
                <Share2 className="size-3.5" aria-hidden /> Share
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
            <div className="order-1 lg:col-start-1">
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
                  <span className="mt-3 text-xs text-primary/60">Event photo not available</span>
                </div>
              )}
            </div>
  );
}
