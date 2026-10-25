import { redirect } from "next/navigation";
import { HostEventsContent } from "@/components/host/host-events-content";
import { eventRowToHostCardProps } from "@/lib/events/event-row-to-host-card";
import { loadHostEvents } from "@/lib/events/load-host-events";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "My events · mdeai",
};

/**
 * SAN-1577 — the Events workspace landing inside the account shell. It shares
 * the legacy list body and loader, but the /app AppShell already provides the
 * single `<main>`; this page must not add a second one.
 */
// skipcq: JS-0067 - Next.js App Router page export
export default async function AppEventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/app/events");

  const result = await loadHostEvents(supabase, user.id);
  const events = (result.ok ? result.events : []).map(eventRowToHostCardProps);

  return (
    <HostEventsContent
      events={events}
      error={result.ok ? null : result.message}
      newEventHref="/app/events/new"
    />
  );
}
