import { Suspense } from "react";
import {
  RentalsConciergeShell,
} from "@/components/host/rentals/rentals-concierge-shell";
import type { RentalsWorkspaceMode } from "@/components/host/rentals/rentals-dynamic-workspace";
import { fetchBrokerDashboard } from "@/lib/rentals/fetch-broker-dashboard";
import { getBrokerContext } from "@/lib/rentals/get-broker-context";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Rentals concierge · mdeai",
};

type PageProps = {
  searchParams: Promise<{ mode?: string }>;
};

async function WorkspaceContent({ workspaceMode }: { workspaceMode: RentalsWorkspaceMode }) { // skipcq: JS-0067 - server component loader
  const ctx = await getBrokerContext();

  // The (broker) layout already redirects anyone without a broker profile. This is the
  // defensive branch: render the shell without inventing data.
  if (ctx.state !== "authorized") {
    return <RentalsConciergeShell workspaceMode={workspaceMode} />;
  }

  const supabase = await createClient();
  const result = await fetchBrokerDashboard(supabase, ctx.user.id);

  return (
    <RentalsConciergeShell
      workspaceMode={workspaceMode}
      dashboard={result.ok ? result.view : null}
      loadError={result.ok ? null : result.message}
    />
  );
}

/**
 * SAN-1093 · RE-DES-002 — broker concierge workspace.
 *
 * SAN-1204 · the workspace now loads the broker's real, RLS-scoped viewing requests on the
 * server instead of rendering Phase-A placeholders.
 */
// skipcq: JS-0067 - Next.js App Router page default export
export default async function HostRentalsHomePage({ searchParams }: PageProps) {
  const { mode } = await searchParams;
  const workspaceMode: RentalsWorkspaceMode = mode === "overview" ? "overview" : "concierge";

  return (
    <main data-testid="rentals-broker-workspace">
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading…</div>}>
        <WorkspaceContent workspaceMode={workspaceMode} />
      </Suspense>
    </main>
  );
}
