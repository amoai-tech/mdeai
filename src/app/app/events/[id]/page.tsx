import { notFound, redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadHostEvent } from "@/lib/events/load-host-event";
import { HostEventDetailEditor } from "@/components/host/host-event-detail-editor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = {
  title: "Event · mdeai",
};

type PageProps = { params: Promise<{ id: string }> };

/**
 * SAN-885 — one saved event, inside the canonical /app workspace.
 *
 * Authorization: `events_organizer_select_own` RLS plus an explicit
 * `organizer_id` filter in the loader. A foreign or malformed id resolves to
 * 404, so the page never reveals that another organizer's event exists.
 */
// skipcq: JS-0067 - Next.js App Router page export
export default async function AppEventDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { user } = await getServerUser();

  if (!user) redirect(`/login?next=${encodeURIComponent(`/app/events/${id}`)}`);
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const result = await loadHostEvent(supabase, user.id, id);

  if (result.status === "not_found") notFound();

  if (result.status === "error") {
    return (
      <section className="space-y-4" data-testid="host-event-detail-error">
        <h1 className="font-serif text-2xl font-semibold">Event unavailable</h1>
        <p className="text-sm text-muted-foreground">{result.message}</p>
        <a
          href={`/app/events`}
          className="inline-flex min-h-11 items-center text-sm text-primary hover:underline"
        >
          Back to my events
        </a>
      </section>
    );
  }

  return (
    <section className="min-w-0" data-testid="host-event-detail">
      <HostEventDetailEditor detail={result.detail} />
    </section>
  );
}
