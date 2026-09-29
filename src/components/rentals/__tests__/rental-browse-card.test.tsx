import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RentalBrowseCard } from "@/components/rentals/rental-browse-card";
import { rowToRental, type ApartmentRow } from "@/mastra/tools/search-rentals";

/**
 * SAN-1349 — the CTA cases are derived from real `apartments` rows through `rowToRental`
 * rather than from hand-written `can_schedule_viewing` booleans. That way "unapproved" and
 * "unpublished" genuinely exercise the ownership/workflow derivation instead of restating the
 * component's own prop.
 */
function apartmentRow(overrides: Partial<ApartmentRow> = {}): ApartmentRow {
  return {
    id: "rnt_lau_001",
    title: "Bright 2BR with Balcony in Laureles",
    neighborhood: "Laureles",
    bedrooms: 2,
    price_daily: 78,
    price_monthly: null,
    currency: "USD",
    wifi_speed: 100,
    amenities: ["wifi", "workspace"],
    images: ["https://images.example/photo.jpg"],
    host_name: "Andrés Restrepo",
    source_url: "https://mdeai.co/rentals/rnt_lau_001",
    available_from: null,
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 30,
    slug: "rnt_lau_001",
    latitude: null,
    longitude: null,
    // Requestable baseline: canonical owner + active + approved + published.
    landlord_id: "11111111-1111-4111-8111-111111111111",
    status: "active",
    moderation_status: "approved",
    listing_workflow_status: "published",
    ...overrides,
  };
}

function renderCard(overrides: Partial<ApartmentRow> = {}, props: { selected?: boolean } = {}) {
  return renderToStaticMarkup(
    <RentalBrowseCard rental={rowToRental(apartmentRow(overrides))} onSelect={vi.fn()} {...props} />,
  );
}

describe("RentalBrowseCard — SAN-1349 viewing CTA truthfulness", () => {
  it("shows the schedule CTA for a fully owned, approved, published, available listing", () => {
    const html = renderCard();
    expect(html).toContain('data-testid="rental-schedule-cta"');
    expect(html).toContain("Schedule viewing");
    // Rendered as a button that opens the external URL, never as an internal route Link.
    expect(html).not.toContain('href="/rentals/rnt_lau_001/schedule-viewing"');
  });

  it("hides the CTA for an unowned listing (no canonical landlord_id)", () => {
    const html = renderCard({ landlord_id: null });
    expect(html).not.toContain('data-testid="rental-schedule-cta"');
    expect(html).not.toContain("Schedule viewing");
  });

  it("hides the CTA for an unapproved listing", () => {
    const html = renderCard({ moderation_status: "pending" });
    expect(html).not.toContain('data-testid="rental-schedule-cta"');
  });

  it("hides the CTA for an unpublished listing", () => {
    const html = renderCard({ listing_workflow_status: "draft" });
    expect(html).not.toContain('data-testid="rental-schedule-cta"');
  });

  it("hides the CTA when the current date is outside the availability window", () => {
    const html = renderCard({ available_to: "2020-01-01" });
    expect(html).not.toContain('data-testid="rental-schedule-cta"');
  });

  it("still renders the listing itself when the CTA is withheld", () => {
    const html = renderCard({ landlord_id: null });
    expect(html).toContain('data-testid="rental-card-rnt_lau_001"');
    expect(html).toContain("Bright 2BR with Balcony in Laureles");
  });

  it("never renders a CTA when can_schedule_viewing is true but the URL is null", () => {
    const rental = { ...rowToRental(apartmentRow()), can_schedule_viewing: true, schedule_viewing_url: null };
    const html = renderToStaticMarkup(<RentalBrowseCard rental={rental} onSelect={vi.fn()} />);
    expect(html).not.toContain('data-testid="rental-schedule-cta"');
  });

  it("defaults testId to rental-card-{id} for browse Playwright contract", () => {
    expect(renderCard()).toContain('data-testid="rental-card-rnt_lau_001"');
  });

  it("forwards map sync props to VenueCardShell", () => {
    const html = renderCard({}, { selected: true });
    expect(html).toContain('data-pin-id="rental-rnt_lau_001"');
    expect(html).toContain('data-selected="true"');
    expect(html).toContain('role="button"');
  });
});
