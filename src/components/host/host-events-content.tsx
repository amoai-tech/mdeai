import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/empty/empty-state";
import { HostEventsGrid } from "@/components/host/host-events-grid";
import type { HostEventCardProps } from "@/components/host/host-event-card";
import { cn } from "@/lib/utils";

type HostEventsContentProps = {
  events: HostEventCardProps[];
  /** Present only when the query genuinely failed; never shown for an empty list. */
  error: string | null;
  /** Working create destination for the surrounding route family. */
  newEventHref: string;
  /** Optional escape hatch for legacy host chrome; omitted inside /app. */
  backToChatHref?: string | null;
};

/**
 * SAN-1577 — the one events-list body shared by `/host/events` and
 * `/app/events`. It deliberately renders no `<main>`: the legacy page and the
 * /app AppShell each own the single main landmark.
 */
export function HostEventsContent({
  events,
  error,
  newEventHref,
  backToChatHref = null,
}: HostEventsContentProps) {
  return (
    <div data-testid="host-events" className="min-w-0">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-semibold">My events</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drafts and published events you host on mdeai.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {backToChatHref ? (
            <Link
              href={backToChatHref}
              className="inline-flex min-h-11 items-center text-sm text-primary hover:underline"
            >
              Back to chat
            </Link>
          ) : null}
          <Link
            href={newEventHref}
            data-testid="host-events-new"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            <CalendarPlus className="size-4" aria-hidden />
            Create event
          </Link>
        </div>
      </div>

      {error ? (
        <EmptyState
          testId="host-events-error"
          title="Couldn't load your events"
          description="Something went wrong fetching your events. Refresh to try again."
          icon={<CalendarPlus className="size-8" />}
        />
      ) : events.length === 0 ? (
        <>
          <EmptyState
            testId="host-events-empty"
            title="No events yet"
            description="Create your first event with the AI wizard — your drafts and published events appear here."
            icon={<CalendarPlus className="size-8" />}
          />
          <div className="mt-4 text-center">
            <Link
              href={newEventHref}
              data-testid="host-events-create-cta"
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
            >
              Create your first event
            </Link>
          </div>
        </>
      ) : (
        <HostEventsGrid events={events} />
      )}
    </div>
  );
}
