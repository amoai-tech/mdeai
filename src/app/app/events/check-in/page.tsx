import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EventScopePicker } from "@/components/host/event-scope-picker";
import { TicketScanner } from "@/components/host/ticket-scanner";
import { getServerUser } from "@/lib/auth/session";
import { loadHostEventOptions } from "@/lib/events/load-host-event-options";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Check in · mdeai" };

type PageProps = {
  searchParams: Promise<{ event?: string }>;
};

/**
 * SAN-984 — authorized staff check-in for one organizer-owned event.
 *
 * The page is a thin shell: camera decoding and manual entry live in the client
 * scanner, and every acceptance decision is made by
 * `POST /api/tickets/validate` against the atomic consume RPC.
 */
// skipcq: JS-0067 - Next.js App Router page export
export default async function AppEventCheckInPage({ searchParams }: PageProps) {
  const { event: requestedEvent } = await searchParams;
  const { user } = await getServerUser();
  if (!user) redirect("/login?next=/app/events/check-in");

  const supabase = await createClient();
  const options = await loadHostEventOptions(supabase, user.id);

  if (requestedEvent && !options.some((option) => option.id === requestedEvent)) {
    notFound();
  }

  if (options.length === 0) {
    return (
      <section className="space-y-4" data-testid="host-checkin-empty">
        <h1 className="font-serif text-2xl font-semibold">Check in</h1>
        <p className="text-sm text-muted-foreground">
          You have no events to check anyone into yet.
        </p>
        <Link href="/app/events/new" className="text-sm text-primary hover:underline">
          Create an event
        </Link>
      </section>
    );
  }

  const selected = options.find((option) => option.id === requestedEvent) ?? options[0];

  return (
    <section className="space-y-4" data-testid="host-checkin">
      <EventScopePicker
        options={options}
        selectedId={selected.id}
        basePath="/app/events/check-in"
        testId="host-checkin-event-picker"
        label="Checking in for"
      />
      <TicketScanner eventId={selected.id} eventName={selected.name} />
    </section>
  );
}
