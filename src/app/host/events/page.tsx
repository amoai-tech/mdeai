import { redirect } from "next/navigation";
import { HostEventsContent } from "@/components/host/host-events-content";
import {
  eventRowToHostCardProps,
} from "@/lib/events/event-row-to-host-card";
import { loadHostEvents } from "@/lib/events/load-host-events";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "My events · mdeai",
};

/** EVP-014 / SAN-118 — Roberto's read-only list of his own events. Server
 *  Component. RLS policy `events_organizer_select_own` scopes rows to the
 *  authenticated organizer; the loader also filters by organizer_id.
 *
 *  SAN-1577 — the body is shared with `/app/events`; this legacy URL keeps its
 *  own single `<main>` and host chrome. */
export default async function HostEventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /host is already a protected middleware prefix; this guards the bypass path
  // and keeps `user` non-null for the query below.
  if (!user) redirect("/login?next=/host/events");

  const result = await loadHostEvents(supabase, user.id);
  const events = (result.ok ? result.events : []).map(eventRowToHostCardProps);

  return (
    <main
      data-testid="host-events-page"
      className="mx-auto min-h-screen max-w-5xl px-4 py-8"
    >
      <HostEventsContent
        events={events}
        error={result.ok ? null : result.message}
        newEventHref="/host/event/new"
        backToChatHref="/chat"
      />
    </main>
  );
}
