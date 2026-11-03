import { Suspense } from "react";
import {
  RentalsListingsShell,
  RentalsListingsSkeleton,
} from "@/components/host/rentals/rentals-listings-shell";
import { fetchBrokerListings } from "@/lib/rentals/fetch-broker-listings";
import { getBrokerContext } from "@/lib/rentals/get-broker-context";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Broker listings · mdeai",
};

async function ListingsContent() {
  const ctx = await getBrokerContext();
  if (ctx.state !== "authorized") {
    return null;
  }

  const supabase = await createClient();
  const result = await fetchBrokerListings(supabase, ctx.user.id);

  return (
    <div data-testid="rentals-listings">
      <RentalsListingsShell
        initialListings={result.ok ? result.listings : []}
        loadError={result.ok ? null : result.message}
        onboardingHref="/app/rentals/onboarding"
        homeHref="/app/rentals"
      />
    </div>
  );
}

/** SAN-1578 — /app adapter over the existing broker listings workspace. */
// skipcq: JS-0067 - Next.js App Router page export
export default function AppRentalsListingsPage() {
  return (
    <Suspense fallback={<RentalsListingsSkeleton />}>
      <ListingsContent />
    </Suspense>
  );
}
