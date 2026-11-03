import type { Metadata } from "next";

import { MarketingPageShell } from "@/components/marketing/marketing-page-shell";
import { VenuesLanding } from "@/components/partners/venues-landing";

export const metadata: Metadata = {
  title: "For Nightlife · mdeai",
  description:
    "Introduce your Medellín club or bar through mdeai and start nightlife partner signup.",
};

/** SAN-712: reuse the canonical Nightlife variant of the venue landing. */
export default function NightlifePartnerPage() {
  return (
    <MarketingPageShell accent="magenta" mainTestId="nightlife-partner-page">
      <VenuesLanding variant="nightclub" />
    </MarketingPageShell>
  );
}
