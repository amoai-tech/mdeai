import { redirect } from "next/navigation";
import { BrokerRentalsGateError } from "@/components/host/rentals/broker-rentals-gate-error";
import { getBrokerContext } from "@/lib/rentals/get-broker-context";

export const metadata = {
  title: "Rentals · mdeai",
};

/**
 * SAN-1578 — broker gate for the /app route family.
 *
 * Mirrors the legacy `(broker)` layout: auth first, then a broker profile.
 * The page bodies are reused, not copied; onboarding still lives at the legacy
 * URL until its /app adapter lands.
 */
// skipcq: JS-0067 - Next.js App Router layout export
export default async function AppRentalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getBrokerContext();

  if (ctx.state === "unauthorized") {
    redirect("/login?next=/app/rentals");
  }

  if (ctx.state === "error") {
    console.error("[app/rentals] broker context error:", ctx.message);
    return <BrokerRentalsGateError />;
  }

  if (!ctx.hasBrokerProfile) {
    redirect("/host/rentals/onboarding");
  }

  return children;
}
