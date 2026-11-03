import { redirect } from "next/navigation";
import { HostDashboardOsShell } from "@/components/host/host-dashboard-os-shell";
import { loadHostDashboardInitial } from "@/lib/events/load-host-dashboard";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Events overview · mdeai",
};

/**
 * SAN-1577 — reuses the existing deterministic host dashboard loader and body.
 * The surrounding /app/events layout owns the hostOpsAgent provider/chat.
 */
// skipcq: JS-0067 - Next.js App Router page export
export default async function AppEventsOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/app/events/overview");

  const initialDashboard = await loadHostDashboardInitial(supabase, user.id);

  return (
    <HostDashboardOsShell
      initialDashboard={initialDashboard}
      basePath="/app/events"
    />
  );
}
