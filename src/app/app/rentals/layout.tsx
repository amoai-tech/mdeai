import { redirect } from "next/navigation";
import { BrokerRentalsGateError } from "@/components/host/rentals/broker-rentals-gate-error";
import { getBrokerContext } from "@/lib/rentals/get-broker-context";
import { getBrokerRequestPathname } from "@/lib/rentals/get-broker-request-path";

export const metadata = {
  title: "Rentals · mdeai",
};

/**
 * SAN-1578 — broker gate for the /app route family.
 *
 * Authenticate this route family. A nested (broker) layout checks for a
 * profile so the onboarding route remains available to new brokers.
 */
// skipcq: JS-0067 - Next.js App Router layout export
export default async function AppRentalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getBrokerContext();

  if (ctx.state === "unauthorized") {
    const nextPath = await getBrokerRequestPathname("/app/rentals");
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  if (ctx.state === "error") {
    console.error("[app/rentals] broker context error:", ctx.message);
    return <BrokerRentalsGateError />;
  }

  return children;
}
