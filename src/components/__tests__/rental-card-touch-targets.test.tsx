// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RentalBrowseCard } from "@/components/rentals/rental-browse-card";
import { RentalCard } from "@/components/copilot/rental-card";
import { rowToRental, type ApartmentRow } from "@/mastra/tools/search-rentals";

/**
 * SAN-1075 — on a phone every rental card action must be at least 44px tall.
 *
 * jsdom has no layout engine, so this test cannot measure pixels. It guards the class that
 * produces them: the `sm` button size is only 28px high, so each card action also carries
 * `min-h-11` (44px), relaxed again on desktop with `lg:min-h-0`. The real rendered heights at
 * 390px are measured in e2e/maps-layout-mobile.spec.ts; this catches the regression in the
 * browse card, which the hermetic browser run cannot render because it needs the database.
 */
const apartment = {
  id: "rnt_touch_001",
  title: "Bright 2BR in Laureles",
  neighborhood: "Laureles",
  bedrooms: 2,
  price_daily: 78,
  price_monthly: null,
  currency: "USD",
  wifi_speed: 100,
  amenities: ["wifi"],
  images: ["https://images.example/photo.jpg"],
  host_name: "Andrés Restrepo",
  source_url: "https://mdeai.co/rentals/rnt_touch_001",
  available_from: "2000-01-01",
  available_to: null,
  pet_friendly: false,
  rental_can_request_viewing: true,
} as unknown as ApartmentRow;

function actionsIn(html: string, selector: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  return [...root.querySelectorAll<HTMLElement>(selector)];
}

describe("rental card actions are phone tap size (SAN-1075)", () => {
  it("browse card: Details, Schedule viewing, original listing and Save", () => {
    const external = {
      ...rowToRental(apartment),
      tags: ["external-source"],
      source_url: "https://fincaraiz.com.co/apartment/193916988",
      source_provider: "fincaraiz",
    };
    const html = renderToStaticMarkup(
      <RentalBrowseCard rental={external} onSelect={vi.fn()} onSchedule={vi.fn()} onDetails={vi.fn()} />,
    );
    const actions = actionsIn(
      html,
      '[data-testid^="rental-details-cta"], [data-testid="rental-schedule-cta"], [data-testid="rental-save-cta"], a[data-testid^="rental-card-source-"]',
    );
    expect(actions.length).toBe(4);
    for (const el of actions) {
      expect(el.className, el.getAttribute("data-testid") ?? el.tagName).toContain("min-h-11");
      expect(el.className).toContain("lg:min-h-0");
    }
  });

  it("chat card: Details, Schedule viewing, original listing and Save", () => {
    const html = renderToStaticMarkup(
      <RentalCard
        id="rental-1"
        listingId="apt-1"
        title="1BR Laureles"
        neighborhood="Laureles"
        nightly_price={75}
        bedrooms={1}
        tags={["external-source"]}
        source_url="https://fincaraiz.com.co/apartment/193916988"
        canScheduleViewing
        onSchedule={() => undefined}
        onOpenDetails={() => undefined}
        onSelect={() => undefined}
      />,
    );
    const actions = actionsIn(
      html,
      '[data-testid="rental-details-cta"], [data-testid="rental-schedule-cta"], [data-testid="rental-save-cta"], [data-testid="rental-original-listing-cta"]',
    );
    expect(actions.length).toBe(4);
    for (const el of actions) {
      expect(el.className, el.getAttribute("data-testid") ?? el.tagName).toContain("min-h-11");
      expect(el.className).toContain("lg:min-h-0");
    }
  });
});
