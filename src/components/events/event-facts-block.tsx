import type { PublicEventFacts } from "@/lib/events/types";

/** "Good to know" + "What to expect" from stored listing data only; renders nothing when empty. */
export function EventFactsBlock({ facts, className }: { facts: PublicEventFacts | null | undefined; className?: string }) {
  if (!facts) return null;
  const rows: [string, string][] = [
    ["Artist", facts.artist],
    ["Genre", facts.genre],
    ["Tickets", facts.ticketInfo],
    ["Listing source", facts.listingSource],
  ].filter((r): r is [string, string] => Boolean(r[1]));
  return (
    <section className={className} aria-labelledby="event-facts-heading" data-testid="event-facts">
      <h2 id="event-facts-heading" className="text-lg font-semibold tracking-tight">Good to know</h2>
      {rows.length ? (
        <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {facts.highlights.length ? (
        <>
          <h3 className="mt-4 text-sm font-semibold">What to expect</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {facts.highlights.map((h) => <li key={h}>{h}</li>)}
          </ul>
        </>
      ) : null}
    </section>
  );
}
