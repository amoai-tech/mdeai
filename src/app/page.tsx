import { redirect } from "next/navigation";
import { HomeNav } from "@/components/home/home-nav";
import { HomeHero } from "@/components/home/home-hero";
import { HomeVerticalsStrip } from "@/components/home/home-verticals-strip";
import { HomeFeatures } from "@/components/home/home-features";
import { HomeSuggestions } from "@/components/home/home-suggestions";
import { HomeDiscoveryRows } from "@/components/home/home-discovery-rows";
import { HomeNeighborhoods } from "@/components/home/home-neighborhoods";
import { HomeHostBand } from "@/components/home/home-host-band";
import { HomeHowItWorks } from "@/components/home/home-how-it-works";
import { HomePressLogos } from "@/components/home/home-press-logos";
import { HomeFooter } from "@/components/home/home-footer";
import { HomeFab } from "@/components/home/home-fab";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

/** D-13: Marketing home. Concierge at /chat; legacy /?q= forwards to /chat?q=. */
export default async function HomePage({ searchParams }: Props) {
  const { q } = await searchParams;
  if (q) {
    redirect(`/chat?q=${encodeURIComponent(q)}`);
  }
  return (
    <>
      {/* Band 01: Sticky top nav */}
      <HomeNav />

      <main id="main-content" className="bg-background text-foreground">
        {/* Band 02: Hero + concierge search, with a real map of Medellín beside it */}
        <HomeHero />

        {/* Band 04: Verticals strip */}
        <HomeVerticalsStrip />

        {/* Band 04b: Why mdeai value props */}
        <HomeFeatures />

        {/* Band 05: AI suggestions */}
        <HomeSuggestions />

        {/* Band 06: Discovery rows — real records only; empty rows are hidden */}
        <HomeDiscoveryRows />

        {/* Band 07: Neighbourhood cards */}
        <HomeNeighborhoods />

        {/* Band 08: Host CTA */}
        <HomeHostBand />

        {/* Band 09: How it works */}
        <HomeHowItWorks />

        {/* Band 10: Built-on logos */}
        <HomePressLogos />

        {/* Band 11: Footer */}
        <HomeFooter />
      </main>

      {/* Fixed concierge FAB */}
      <HomeFab />
    </>
  );
}
