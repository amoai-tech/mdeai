// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RentalBrowseCard } from "@/components/rentals/rental-browse-card";
import { rowToRental, type ApartmentRow } from "@/mastra/tools/search-rentals";
import { rentalToMapPin } from "@/lib/browse/browse-pin-converters";

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
    available_from: "2000-01-01", // a known move-in date, as the viewing RPC requires (SAN-486)
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

  it("keeps production bedrooms numeric and never flags them unknown", () => {
    const unknownRow = rowToRental(apartmentRow({ bedrooms: null }));
    expect(unknownRow.bedrooms).toBe(0);
    expect(unknownRow.bedrooms_unknown).toBeUndefined();
    expect(renderCard({ bedrooms: 0 })).toContain("Studio");
    expect(renderCard({ bedrooms: 0 })).not.toContain("Bedrooms unknown");
  });

  it("renders 'Bedrooms unknown' only when the dev-preview flag is set", () => {
    const html = renderToStaticMarkup(
      <RentalBrowseCard
        rental={{ ...rowToRental(apartmentRow()), bedrooms_unknown: true }}
      />,
    );
    expect(html).toContain("Bedrooms unknown");
    expect(html).not.toContain("Studio");
  });

  it("defaults testId to rental-card-{id} for browse Playwright contract", () => {
    expect(renderCard()).toContain('data-testid="rental-card-rnt_lau_001"');
  });

  it("forwards map sync props to VenueCardShell", () => {
    const html = renderCard({ latitude: 6.244, longitude: -75.592 }, { selected: true });
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

  it("falls back to the placeholder when the cover image fails", () => {
    act(() => {
      root.render(<RentalBrowseCard rental={rowToRental(apartmentRow())} />);
    });
    const image = container.querySelector<HTMLImageElement>(
      '[data-testid="rental-browse-card-photo"]',
    );
    if (!image) throw new Error("the listing must expose its cover image first");

    act(() => {
      image.dispatchEvent(new Event("error"));
    });

    expect(
      container.querySelector('[data-testid="rental-browse-card-photo-placeholder"]'),
      "a failed Storage image must render the shared placeholder, not a broken image",
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="rental-browse-card-photo"]')).toBeNull();
  });
});


describe("SAN-472: only mapped rentals have map selection", () => {
  it("does not expose a phantom pin or map-select button for an unmapped rental", () => {
    const html = renderCard();
    expect(html).not.toContain('data-pin-id="rental-rnt_lau_001"');
    expect(html).not.toContain('role="button"');
    expect(html).toContain('href="/rentals/rnt_lau_001"');
  });
  it("rejects invalid/out-of-range coordinates instead of adding map pins", () => {
    const good = rowToRental(apartmentRow({ latitude: 6.244, longitude: -75.592 }));
    expect(rentalToMapPin(good)?.id).toBe("rental-rnt_lau_001");
    expect(rentalToMapPin({ ...good, latitude: 99 })).toBeNull();
    expect(rentalToMapPin({ ...good, longitude: Number.POSITIVE_INFINITY })).toBeNull();
    expect(rentalToMapPin({ ...good, latitude: undefined })).toBeNull();
  });
});


describe("SAN-472: hover highlights while clicking requests map focus", () => {
  it("uses a separate preview callback rather than panning on every hover", () => {
    const onPreview = vi.fn();
    const onSelect = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <RentalBrowseCard
          rental={rowToRental(apartmentRow({ latitude: 6.244, longitude: -75.592 }))}
          onPreview={onPreview}
          onSelect={onSelect}
        />,
      );
    });
    const card = container.querySelector('[data-testid="rental-card-rnt_lau_001"]')!;
    act(() => {
      // The shared card on current main uses pointer enter (not mouse enter) so
      // touch taps cannot accidentally preview a map marker on mobile.
      const touch = new MouseEvent("pointerover", {
        bubbles: true, relatedTarget: document.body,
      });
      Object.defineProperty(touch, "pointerType", { value: "touch" });
      card.dispatchEvent(touch);
    });
    expect(onPreview).not.toHaveBeenCalled();
    act(() => {
      const hover = new MouseEvent("pointerover", {
        bubbles: true, relatedTarget: document.body,
      });
      Object.defineProperty(hover, "pointerType", { value: "mouse" });
      card.dispatchEvent(hover);
    });
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    act(() => {
      (card.querySelector('[role="button"]') as HTMLElement).click();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    container.remove();
  });
});

describe("External rental title navigation", () => {
  it("opens the original advertisement instead of a non-public MDE detail URL", () => {
    const rental = {
      ...rowToRental(apartmentRow()),
      id: "candidate-fincaraiz-193916988",
      tags: ["external-source"],
      source_url: "https://fincaraiz.com.co/apartment/193916988",
      can_schedule_viewing: false,
      schedule_viewing_url: null,
    };
    const html = renderToStaticMarkup(<RentalBrowseCard rental={rental} />);
    expect(html).toContain('data-testid="rental-card-link-candidate-fincaraiz-193916988"');
    expect(html).toContain('href="https://fincaraiz.com.co/apartment/193916988"');
    expect(html).not.toContain('/rentals/candidate-fincaraiz-193916988');
    expect(html).toContain("View original listing");
    expect(html).not.toContain("Schedule viewing");
  });

  it("keeps the normal MDE detail route for verified internal rentals", () => {
    const html = renderCard();
    expect(html).toContain('href="/rentals/rnt_lau_001"');
  });
});
