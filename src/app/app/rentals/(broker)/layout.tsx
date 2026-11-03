import { redirect } from "next/navigation";
import { BrokerRentalsGateError } from "@/components/host/rentals/broker-rentals-gate-error";
import { getBrokerContext } from "@/lib/rentals/get-broker-context";

/** Inventory/concierge require a persisted profile; onboarding is a sibling route. */
// skipcq: JS-0067 - Next.js App Router layout export
export default async function AppBrokerRentalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getBrokerContext();
  if (ctx.state === "unauthorized") {
    redirect("/login?next=/app/rentals");
  }
  if (ctx.state === "error") {
    return <BrokerRentalsGateError />;
  }
  if (!ctx.hasBrokerProfile) {
    redirect("/app/rentals/onboarding");
  }
  return children;
}
