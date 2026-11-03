import type { Metadata } from "next";

import { MarketingPageShell } from "@/components/marketing/marketing-page-shell";
import { VenuesLanding } from "@/components/partners/venues-landing";

export const metadata: Metadata = {
  title: "For Restaurants · mdeai",
  description:
    "Introduce your Medellín restaurant to guests discovering places through mdeai and start restaurant partner signup.",
};

/** SAN-713: use the existing restaurant landing without a second design or signup flow. */
export default function RestaurantPartnerPage() {
  return (
    <MarketingPageShell accent="terracotta" mainTestId="restaurant-partner-page">
      <VenuesLanding variant="restaurant" />
    </MarketingPageShell>
  );
}
