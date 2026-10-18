import type { Metadata } from "next";

import { MarketingPageShell } from "@/components/marketing/marketing-page-shell";
import { VenuesLanding } from "@/components/partners/venues-landing";

export const metadata: Metadata = {
  title: "For Cafés · mdeai",
  description:
    "Help people discover your Medellín café through mdeai, and begin café partner signup.",
};

/** SAN-714: reuse the canonical Café variant of the venue landing. */
export default function CafePartnerPage() {
  return (
    <MarketingPageShell accent="caramel" mainTestId="cafe-partner-page">
      <VenuesLanding variant="cafe" />
    </MarketingPageShell>
  );
}
