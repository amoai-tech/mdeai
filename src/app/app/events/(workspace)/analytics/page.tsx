import { redirect } from "next/navigation";
import { HostAnalyticsShell } from "@/components/host/host-analytics-shell";
import { loadHostDashboardInitial } from "@/lib/events/load-host-dashboard";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Events analytics · mdeai",
};

/**
 * SAN-1577 — reuses the existing sales loader/table reads and analytics body.
 * No second sales calculation service: the deterministic numbers still come
 * from gatherSalesSummaries → computeSalesInsights.
 */
// skipcq: JS-0067 - Next.js App Router page export
export default async function AppEventsAnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/app/events/analytics");

  const initialDashboard = await loadHostDashboardInitial(supabase, user.id);

  return <HostAnalyticsShell initialDashboard={initialDashboard} />;
}
