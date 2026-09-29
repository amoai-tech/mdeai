// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RentalBrowseCard } from "@/components/rentals/rental-browse-card";
import { rowToRental, type ApartmentRow } from "@/mastra/tools/search-rentals";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * SAN-1349 — the CTA cases are derived from real `apartments` rows through `rowToRental`
 * rather than from hand-written `can_schedule_viewing` booleans. That way "unapproved" and
 * "unpublished" genuinely exercise the ownership/workflow derivation instead of restating the
 * component's own prop.
 *
 * SAN-478 — the CTA must open the shared viewing modal in place. It previously called
 * `window.open("<listing>/schedule-viewing")`; no such route exists, so every renter who
 * clicked the browse-card CTA landed on a 404. The interaction test below is the regression
 * that keeps that from coming back, and it is deliberately written against `window.open`
 * because "renders a button" alone cannot distinguish the two implementations.
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

function renderCard(
  overrides: Partial<ApartmentRow> = {},
  props: { selected?: boolean; onSchedule?: (() => void) | undefined } = {},
) {
  // `?? vi.fn()` would mask a deliberate `onSchedule: undefined`, which is exactly the case
  // the "no handler → no CTA" test needs to exercise.
  const hasHandler = "onSchedule" in props;
  return renderToStaticMarkup(
    <RentalBrowseCard
      rental={rowToRental(apartmentRow(overrides))}
      onSelect={vi.fn()}
      onSchedule={hasHandler ? props.onSchedule : vi.fn()}
      selected={props.selected}
    />,
  );
}

describe("RentalBrowseCard — SAN-1349 viewing CTA truthfulness", () => {
  it("shows the schedule CTA for a fully owned, approved, published, available listing", () => {
    const html = renderCard();
    expect(html).toContain('data-testid="rental-schedule-cta"');
    expect(html).toContain("Schedule viewing");
    // SAN-478 — the CTA is a button that opens a modal, never a link or a navigation to
    // the `/schedule-viewing` path that has never had a route behind it.
    expect(html).not.toContain("schedule-viewing");
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

  it("renders no CTA when the page supplies no schedule handler", () => {
    const html = renderCard({}, { onSchedule: undefined });
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

describe("RentalBrowseCard — SAN-478 CTA opens the shared modal", () => {
  let container: HTMLDivElement;
  let root: Root;
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    openSpy.mockRestore();
  });

  it("invokes onSchedule and opens no new tab", () => {
    const onSchedule = vi.fn();
    act(() => {
      root.render(
        <RentalBrowseCard
          rental={rowToRental(apartmentRow())}
          onSchedule={onSchedule}
        />,
      );
    });

    const cta = container.querySelector('[data-testid="rental-schedule-cta"]');
    expect(cta, "the requestable listing must expose the CTA").not.toBeNull();

    act(() => {
      (cta as HTMLButtonElement).click();
    });

    expect(onSchedule).toHaveBeenCalledTimes(1);
    expect(
      openSpy,
      "SAN-478: the CTA must never window.open a URL — that was the 404",
    ).not.toHaveBeenCalled();
  });

  it("withholds the CTA entirely when no handler is supplied", () => {
    act(() => {
      root.render(<RentalBrowseCard rental={rowToRental(apartmentRow())} />);
    });
    expect(container.querySelector('[data-testid="rental-schedule-cta"]')).toBeNull();
  });
});
