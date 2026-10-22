import { redirect } from "next/navigation";
import { RentalsOnboardingWizard } from "@/components/host/rentals/rentals-onboarding-wizard";
import { BrokerRentalsGateError } from "@/components/host/rentals/broker-rentals-gate-error";
import { getBrokerContext } from "@/lib/rentals/get-broker-context";

export const metadata = { title: "Broker onboarding · mdeai" };

/** Reuse the working wizard under the existing app shell (no second host rail). */
// skipcq: JS-0067 - Next.js App Router page export
export default async function AppRentalsOnboardingPage() {
  const ctx = await getBrokerContext();
  if (ctx.state === "unauthorized") {
    redirect("/login?next=/app/rentals/onboarding");
  }
  if (ctx.state === "error") {
    return <BrokerRentalsGateError />;
  }
  if (ctx.hasBrokerProfile) {
    redirect("/app/rentals");
  }
  return (
    <main data-testid="host-rentals-onboarding">
      <RentalsOnboardingWizard destination="app" />
    </main>
  );
}
