import Link from "next/link";
import { CalendarPlusIcon } from "lucide-react";

/** Secondary by design: a short invitation near the end, not a second hero. */
export function HomeHostBand() {
  return (
    <section aria-labelledby="host-heading" className="border-t border-border bg-muted/40 py-10 md:py-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="max-w-2xl">
          <h2 id="host-heading" className="text-xl font-semibold tracking-tight text-foreground">
            Hosting an event in Medellín?
          </h2>
          <p className="mt-1 text-base leading-relaxed text-muted-foreground">
            Describe it to the AI and it fills in the form: venue, tickets and capacity.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/host/event/new"
            data-testid="host-band-primary-cta"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            <CalendarPlusIcon className="size-4" aria-hidden="true" />
            Create an event
          </Link>
          <Link
            href="/host/events"
            data-testid="host-band-secondary-cta"
            className="inline-flex min-h-[44px] items-center rounded-full border border-border bg-background px-6 text-base font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            My events
          </Link>
        </div>
      </div>
    </section>
  );
}
