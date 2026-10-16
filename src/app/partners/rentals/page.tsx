import type { Metadata } from "next";

import { MarketingPageShell } from "@/components/marketing/marketing-page-shell";
import { RentalsLanding } from "@/components/partners/rentals-landing";

export const metadata: Metadata = {
  title: "For Rental Brokers and Landlords · mdeai",
  description: "Introduce your Medellín rental listings to interested renters. Start broker signup or ask the MDE team a question.",
};

export default function PartnersRentalsPage() {
  return (
    <MarketingPageShell accent="teal" mainTestId="rentals-partner-page">
      <RentalsLanding />
    </MarketingPageShell>
  );
}
