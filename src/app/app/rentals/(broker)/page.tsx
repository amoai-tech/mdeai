import { Suspense } from "react";
import { RentalsConciergeShell } from "@/components/host/rentals/rentals-concierge-shell";
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

async function WorkspaceContent({
  workspaceMode,
}: {
  workspaceMode: RentalsWorkspaceMode;
}) {
  const ctx = await getBrokerContext();

  // The layout already redirects a missing profile; this is the defensive
  // branch so a partially resolved context never invents data.
  if (ctx.state !== "authorized") {
    return (
      <RentalsConciergeShell
        workspaceMode={workspaceMode}
        basePath="/app/rentals"
      />
    );
  }

  const supabase = await createClient();
  const result = await fetchBrokerDashboard(supabase, ctx.user.id);

  return (
    <RentalsConciergeShell
      workspaceMode={workspaceMode}
      dashboard={result.ok ? result.view : null}
      loadError={result.ok ? null : result.message}
      basePath="/app/rentals"
    />
  );
}

/** SAN-1578 — /app adapter over the existing broker concierge workspace. */
// skipcq: JS-0067 - Next.js App Router page export
export default async function AppRentalsHomePage({ searchParams }: PageProps) {
  const { mode } = await searchParams;
  const workspaceMode: RentalsWorkspaceMode =
    mode === "overview" ? "overview" : "concierge";

  return (
    <main data-testid="rentals-broker-workspace">
      <Suspense
        fallback={<div className="p-4 text-sm text-muted-foreground">Loading…</div>}
      >
        <WorkspaceContent workspaceMode={workspaceMode} />
      </Suspense>
    </main>
  );
}
