import { HomeHowItWorks } from "@/components/home/home-how-it-works";
import { HomeNeighborhoods } from "@/components/home/home-neighborhoods";

/** Neighbourhoods and how MDE works share one calm section instead of two full-width bands. */
export function HomeCityGuide() {
  return (
    <section aria-label="Neighbourhoods and how MDE works" className="bg-background py-12 md:py-16">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[3fr_2fr] lg:gap-16 lg:px-8">
        <HomeNeighborhoods />
        <HomeHowItWorks />
      </div>
    </section>
  );
}
