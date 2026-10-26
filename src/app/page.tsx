import { redirect } from "next/navigation";
import { HomeNav } from "@/components/home/home-nav";
import { HomeHero } from "@/components/home/home-hero";
import { HomeVerticalsStrip } from "@/components/home/home-verticals-strip";
import { HomeDiscoveryRows } from "@/components/home/home-discovery-rows";
import { HomeCityGuide } from "@/components/home/home-city-guide";
import { HomeHostBand } from "@/components/home/home-host-band";
import { HomeFooter } from "@/components/home/home-footer";
import { HomeFab } from "@/components/home/home-fab";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

/**
 * Marketing home (SAN-1556). Concierge at /chat; legacy /?q= forwards to /chat?q=.
 * Eight purposeful sections, each with its own weight:
 *   1 hero + search + map · 2 category links · 3 things to see · 4 rentals ·
 *   5 eat & drink · 6 events · 7 neighbourhoods + how it works · 8 host + footer.
 * Sections 3–6 are real records only and disappear when there is nothing real to show.
 */
export default async function HomePage({ searchParams }: Props) {
  const { q } = await searchParams;
  if (q) {
    redirect(`/chat?q=${encodeURIComponent(q)}`);
  }
  return (
    <>
      <HomeNav />

      <main id="main-content" className="bg-background text-foreground">
        <HomeHero />
        <HomeVerticalsStrip />
        <HomeDiscoveryRows />
        <HomeCityGuide />
        <HomeHostBand />
      </main>

      <HomeFooter />

      {/* Fixed concierge FAB */}
      <HomeFab />
    </>
  );
}
