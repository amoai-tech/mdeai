"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * The event exists but could not be read right now (database error), which is not
 * the same as "no such event". Retry re-runs the server component instead of
 * pretending the page is gone.
 */
export function EventUnavailable() {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  return (
    <main id="main-content" className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-start justify-center gap-4 px-4 py-16">
      <p className="text-sm font-medium text-muted-foreground">Event page</p>
      <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t load this event</h1>
      <p className="text-sm leading-6 text-muted-foreground" data-testid="event-unavailable-message">
        We couldn&apos;t check this event&apos;s availability just now because of a temporary problem on our
        side. Please try again in a moment.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          data-testid="event-unavailable-retry"
          onClick={() => {
            setRetrying(true);
            router.refresh();
            // The refresh is server-driven; clear the pending state so a second try works.
            window.setTimeout(() => setRetrying(false), 4000);
          }}
        >
          <RefreshCw aria-hidden className="size-4" />
          {retrying ? "Trying again…" : "Try again"}
        </Button>
        <Link href="/events" className={buttonVariants({ variant: "outline" })}>
          Browse other events
        </Link>
      </div>
    </main>
  );
}
