// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RentalBrowseCard } from "@/components/rentals/rental-browse-card";
import { rowToRental, type ApartmentRow } from "@/mastra/tools/search-rentals";
import { rentalToMapPin } from "@/lib/browse/browse-pin-converters";
import { resetRentalPhotoTelemetryForTests } from "@/lib/rentals/rental-photo-telemetry";

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
    images: ["https://images.unsplash.com/photo.jpg"],
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
    // SAN-1502: requestability is the database's computed column, not a UI re-derivation.
    rental_can_request_viewing: true,
    ...overrides,
  };
}

function renderCard(
  overrides: Partial<ApartmentRow> = {},
  props: { selected?: boolean; onSchedule?: (() => void) | undefined; duplicateNote?: string } = {},
) {
  // `?? vi.fn()` would mask a deliberate `onSchedule: undefined`, which is exactly the case
  // the "no handler → no CTA" test needs to exercise.
  const hasHandler = "onSchedule" in props;
  return renderToStaticMarkup(
    <RentalBrowseCard
      rental={rowToRental(apartmentRow(overrides))}
      onSelect={vi.fn()}
      onSchedule={hasHandler ? props.onSchedule : vi.fn()}
      duplicateNote={props.duplicateNote}
      selected={props.selected}
    />,
  );
}

describe("SAN-1695 — real photos in the V3 browse card", () => {
  it("uses the source gallery for cover-layout carousel, preserving the existing details action", () => {
    const html = renderToStaticMarkup(
      <RentalBrowseCard
        rental={rowToRental(apartmentRow({
          images: ["https://images.unsplash.com/room-one.jpg", "https://images.unsplash.com/room-two.jpg"],
          price_daily: null,
          price_monthly: 2_800_000,
          currency: "COP",
        }))}
        mediaLayout="cover"
        onDetails={vi.fn()}
      />,
    );
    expect(html).toContain('data-slot="carousel"');
    expect(html).toContain("https://images.unsplash.com/room-one.jpg");
    expect(html).toContain("https://images.unsplash.com/room-two.jpg");
    expect(html).toContain('data-testid="rental-photo-counter-rnt_lau_001"');
    expect(html).toContain("1 of 2 photos");
    expect(html).toContain('data-slot="carousel-next"');
    expect(html).toContain('data-testid="rental-card-photo-details-rnt_lau_001"');
    expect(html).toContain("COP 2,800,000");
    expect(html).not.toContain("Unsplash");
  });

  it("preserves the stored nightly USD quote on multi-photo gallery cards", () => {
    const html = renderToStaticMarkup(
      <RentalBrowseCard rental={rowToRental(apartmentRow({
        images: ["https://images.unsplash.com/room-one.jpg", "https://images.unsplash.com/room-two.jpg"],
        price_monthly: null,
        price_daily: 78,
        currency: "USD",
      }))} mediaLayout="cover" />,
    );
    expect(html).toContain('data-slot="carousel"');
    expect(html).toContain("$78/night");
    // Assert the visible badge text without injecting the rendered HTML into the DOM.
    expect(html).toMatch(/<span\b[^>]*data-testid="rental-card-nightly-currency"[^>]*>\s*USD\s*<\/span>/);
    // The stored nightly price must not be replaced by its derived monthly estimate.
    expect(html.indexOf("$78/night")).toBeGreaterThan(0);
  });

  it("shows only the stored monthly price when both nightly and monthly rates exist", () => {
    const html = renderToStaticMarkup(
      <RentalBrowseCard rental={rowToRental(apartmentRow({
        images: ["https://images.unsplash.com/room-one.jpg", "https://images.unsplash.com/room-two.jpg"],
        price_daily: 78,
        price_monthly: 2_800_000,
        currency: "COP",
      }))} mediaLayout="cover" />,
    );
    expect(html).toContain("COP 2,800,000/mo");
    expect(html).not.toContain("/night");
    expect(html).not.toContain("~");
  });

  it("does not add carousel controls for a single original listing photo", () => {
    const html = renderToStaticMarkup(
      <RentalBrowseCard rental={rowToRental(apartmentRow())} mediaLayout="cover" />,
    );
    expect(html).toContain('data-testid="rental-browse-card-photo"');
    expect(html).not.toContain('data-slot="carousel"');
    expect(html).not.toContain('data-slot="carousel-next"');
  });

  it("shows a real placeholder rather than invented photos when no source photo exists", () => {
    const html = renderToStaticMarkup(
      <RentalBrowseCard rental={rowToRental(apartmentRow({ images: [] }))} mediaLayout="cover" />,
    );
    expect(html).toContain('data-testid="rental-browse-card-photo-placeholder"');
    expect(html).not.toContain('data-slot="carousel"');
  });
});

describe("SAN-1695 — failed gallery images never occupy a slide", () => {
  // JSDOM has no layout observers or media queries. Embla uses these when
  // mounting; the real swipe/next behavior is covered in browser tests.
  beforeEach(() => {
    resetRentalPhotoTelemetryForTests();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    vi.stubGlobal("matchMedia", (query: string) => ({
      media: query,
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }));
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.stubGlobal("IntersectionObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("only renders allowlisted public photos, never internal or attacker-chosen image URLs", () => {
    const html = renderToStaticMarkup(<RentalBrowseCard
      rental={rowToRental(apartmentRow({ images: [
        "http://127.0.0.1:8080/admin", "https://evil.example/private.jpg",
        "https://images.unsplash.com/safe.jpg",
      ] }))}
      mediaLayout="cover"
    />);
    expect(html).not.toContain("127.0.0.1:8080");
    expect(html).not.toContain("evil.example/private.jpg");
    expect(html).toContain("https://images.unsplash.com/safe.jpg");
    expect(html).not.toContain('data-slot="carousel"');
  });

  it("opens the right apartment Details when the user clicks a gallery photo", () => {
    const onDetails = vi.fn();
    act(() => { root.render(<RentalBrowseCard
      rental={rowToRental(apartmentRow({ images: [
        "https://images.unsplash.com/front.jpg", "https://images.unsplash.com/kitchen.jpg",
      ] }))}
      mediaLayout="cover" onDetails={onDetails}
    />); });
    const button = container.querySelector<HTMLButtonElement>('[data-testid="rental-card-photo-details-rnt_lau_001"]');
    expect(button).not.toBeNull();
    act(() => { button?.click(); });
    expect(onDetails).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous pin selected when the Show on map button receives keyboard focus", () => {
    const onPreview = vi.fn();
    const onSelect = vi.fn();
    act(() => { root.render(<RentalBrowseCard
      rental={rowToRental(apartmentRow({
        latitude: 6.245, longitude: -75.579,
        images: ["https://images.unsplash.com/front.jpg", "https://images.unsplash.com/kitchen.jpg"],
      }))}
      mediaLayout="cover" onPreview={onPreview} onSelect={onSelect}
    />); });
    const button = container.querySelector<HTMLButtonElement>('[data-testid^="rental-card-map-select-"]');
    expect(button).not.toBeNull();
    act(() => { button?.focus(); });
    expect(document.activeElement).toBe(button);
    // Focusing a control must not open the map overlay and steal Enter.
    expect(onPreview).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    act(() => { button?.click(); });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("does not select another map pin when tabbing through rental action buttons", () => {
    const onPreview = vi.fn();
    const onSelect = vi.fn();
    act(() => { root.render(<RentalBrowseCard
      rental={rowToRental(apartmentRow({ latitude: 6.245, longitude: -75.579 }))}
      onPreview={onPreview} onSelect={onSelect} onDetails={vi.fn()} onAskSelect={vi.fn()}
    />); });
    const selectors = [
      '[data-testid^="rental-card-map-select-"]',
      '[data-testid="rental-ask-select"]',
      '[data-testid^="rental-details-cta-"]',
    ];
    for (const selector of selectors) {
      const button = container.querySelector<HTMLButtonElement>(selector);
      expect(button, selector).not.toBeNull();
      act(() => { button?.focus(); });
      expect(document.activeElement).toBe(button);
      expect(onPreview, selector).not.toHaveBeenCalled();
      expect(onSelect, selector).not.toHaveBeenCalled();
    }
    const mapButton = container.querySelector<HTMLButtonElement>(selectors[0]!);
    act(() => { mapButton?.click(); });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("does not preview or select a map pin while focusing and using gallery arrows", async () => {
    const onPreview = vi.fn();
    const onSelect = vi.fn();
    const onDetails = vi.fn();
    act(() => { root.render(<RentalBrowseCard
      rental={rowToRental(apartmentRow({
        latitude: 6.245, longitude: -75.579,
        images: ["https://images.unsplash.com/front.jpg", "https://images.unsplash.com/kitchen.jpg"],
      }))}
      mediaLayout="cover" onPreview={onPreview} onSelect={onSelect} onDetails={onDetails}
    />); });
    // Embla announces scroll availability asynchronously after the carousel mounts.
    await act(async () => { await Promise.resolve(); });
    const next = container.querySelector<HTMLButtonElement>('[data-slot="carousel-next"]');
    expect(next).not.toBeNull();
    // JSDOM has no carousel layout, so Embla can keep Next disabled even after
    // the microtask. Enable this DOM control only to exercise focus/click bubbling;
    // the real 390px Playwright run verifies actual photo movement separately.
    if (next?.disabled) next.disabled = false;
    expect(next?.disabled).toBe(false);
    act(() => { next?.focus(); });
    expect(document.activeElement).toBe(next);
    // Focusing a photo navigation control must not select its apartment on the map.
    expect(onPreview).not.toHaveBeenCalled();
    act(() => { next?.click(); });
    expect(onPreview).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onDetails).not.toHaveBeenCalled();
  });

  it("retains failures on unrelated rerenders, then retries on a refreshed result set", () => {
    const urls = ["https://images.unsplash.com/front.jpg", "https://images.unsplash.com/kitchen.jpg"];
    const show = () => rowToRental(apartmentRow({ images: urls }));
    const resultSet = [show()];
    act(() => { root.render(<RentalBrowseCard rental={resultSet[0]!} resultSet={resultSet} mediaLayout="cover" />); });
    expect(container.querySelectorAll('[data-slot="carousel-item"]')).toHaveLength(2);
    act(() => { container.querySelector<HTMLImageElement>('[data-testid="rental-browse-card-photo"]')?.dispatchEvent(new Event("error")); });
    expect(container.querySelector('[data-slot="carousel"]')).toBeNull();
    // Unrelated rerender reconstructs a Rental object but keeps the same search result array.
    act(() => { root.render(<RentalBrowseCard rental={show()} resultSet={resultSet} mediaLayout="cover" />); });
    expect(container.querySelector('[data-slot="carousel"]')).toBeNull();
    // A refreshed search has a new result array even if it contains the same ID and URLs.
    const refreshed = [show()];
    act(() => { root.render(<RentalBrowseCard rental={refreshed[0]!} resultSet={refreshed} mediaLayout="cover" />); });
    expect(container.querySelectorAll('[data-slot="carousel-item"]')).toHaveLength(2);
  });

  it("updates title and omitted-photo text without reinstalling carousel listeners", () => {
    const rental = rowToRental(apartmentRow({ images: [
      "https://images.unsplash.com/front.jpg", "https://images.unsplash.com/kitchen.jpg",
    ] }));
    const resultSet = [rental];
    act(() => { root.render(<RentalBrowseCard rental={rental} resultSet={resultSet} mediaLayout="cover" />); });
    expect(container.querySelector('[data-testid^="rental-photo-counter-"]')?.textContent).toContain("1 of 2 photos");
    const updated = { ...rental, title: "Updated apartment title", photo_count: 9 };
    act(() => { root.render(<RentalBrowseCard rental={updated} resultSet={resultSet} mediaLayout="cover" />); });
    expect(container.querySelector('[data-testid^="rental-photo-counter-"]')?.textContent).toContain("1 of 2 photos shown");
    expect(container.querySelector('[aria-label="Photos of Updated apartment title"]')).not.toBeNull();
  });

  it("offers remaining photos in Details after all 12 preview photos fail", () => {
    const urls = Array.from({ length: 14 }, (_, index) => `https://images.unsplash.com/photo-${index}.jpg`);
    const rental = rowToRental(apartmentRow({ images: urls }));
    expect(rental.images).toHaveLength(12);
    expect(rental.photo_count).toBe(14);
    act(() => { root.render(<RentalBrowseCard rental={rental} mediaLayout="cover" />); });
    for (let index = 0; index < 12; index += 1) {
      act(() => { container.querySelector<HTMLImageElement>('[data-testid="rental-browse-card-photo"]')?.dispatchEvent(new Event("error")); });
    }
    expect(container.querySelector('[data-testid="rental-card-more-photos"]')?.textContent).toContain("Details");
    expect(container.querySelector('[data-testid="rental-browse-card-photo-placeholder"]')).toBeNull();
    // Twelve failures on one host produce one telemetry request, not twelve.
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/rentals/photo-failures", expect.objectContaining({
      method: "POST", body: JSON.stringify({ host: "images.unsplash.com" }),
    }));
  });

  it("drops a broken photo from the count, then falls back to one photo, then a placeholder", () => {
    const urls = [
      "https://images.unsplash.com/broken.jpg",
      "https://images.unsplash.com/also-broken.jpg",
      "https://images.unsplash.com/working.jpg",
    ];
    act(() => {
      root.render(
        <RentalBrowseCard
          rental={rowToRental(apartmentRow({ images: urls }))}
          mediaLayout="cover"
          onDetails={vi.fn()}
        />,
      );
    });

    const photo = () => container.querySelector<HTMLImageElement>('[data-testid="rental-browse-card-photo"]');
    expect(container.querySelectorAll('[data-slot="carousel-item"]').length).toBe(3);
    expect(container.querySelector('[data-testid^="rental-photo-counter-"]')?.textContent).toContain("1 of 3 photos");

    act(() => { photo()?.dispatchEvent(new Event("error")); });
    expect(container.querySelectorAll('[data-slot="carousel-item"]').length).toBe(2);
    expect(container.querySelector('[data-testid^="rental-photo-counter-"]')?.textContent).toContain("1 of 2 photos");
    expect(container.querySelector('img[src="https://images.unsplash.com/broken.jpg"]')).toBeNull();

    act(() => { photo()?.dispatchEvent(new Event("error")); });
    expect(container.querySelector('[data-slot="carousel"]')).toBeNull();
    expect(photo()?.src).toBe(urls[2]);

    act(() => { photo()?.dispatchEvent(new Event("error")); });
    expect(container.querySelector('[data-testid="rental-browse-card-photo-placeholder"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="carousel"]')).toBeNull();
  });
});

describe("RentalBrowseCard — source-backed furnishing truth", () => {
  it("shows true, false and unknown as three different facts", () => {
    expect(renderCard({ furnished: true })).toContain("Furnished listed");
    expect(renderCard({ furnished: false })).toContain("Unfurnished listed");
    expect(renderCard({ furnished: null })).toContain("Furnishing not specified");
  });
});

describe("RentalBrowseCard — SAN-1349 viewing CTA truthfulness", () => {
  it("offers map selection in its own button instead of nesting links inside a role=button", () => {
    const html = renderToStaticMarkup(
      <RentalBrowseCard
        rental={rowToRental(apartmentRow({ latitude: 6.245, longitude: -75.579 }))}
        onSelect={vi.fn()}
        onDetails={vi.fn()}
      />,
    );
    expect(html).toContain('data-testid="rental-card-map-select-rnt_lau_001"');
    expect(html).toContain('aria-label="Show Bright 2BR with Balcony in Laureles on the map"');
    expect(html).not.toMatch(/data-testid="rental-card-map-select-rnt_lau_001"[^>]*aria-pressed=/);
    expect(html).not.toContain('role="button"');
    expect(html).toContain('data-testid="rental-card-link-rnt_lau_001"');
  });

  it("treats inherited object keys as ordinary amenity text, not object properties", () => {
    const html = renderCard({ amenities: ["constructor"] });
    expect(html).toContain("Constructor");
  });

  it("keeps the real photo gallery in compact layout and labels only compared apartments", () => {
    const html = renderToStaticMarkup(<RentalBrowseCard
      rental={rowToRental(apartmentRow({
        images: ["https://images.unsplash.com/photo-one.jpg", "https://images.unsplash.com/photo-two.jpg"],
      }))}
      mediaLayout="inline"
      comparisonPosition={2}
      onDetails={vi.fn()}
    />);
    expect(html).toContain('data-slot="carousel"');
    expect(html).toContain('data-slot="carousel-next"');
    expect(html).toContain("sm:w-36");
    expect(html).toContain("1 of 2 photos");
    expect(html).toContain('data-testid="rental-compared-rnt_lau_001"');
    expect(html).toContain("Option #2");
    const missing = renderToStaticMarkup(<RentalBrowseCard
      rental={rowToRental(apartmentRow({ images: [] }))}
      mediaLayout="inline"
    />);
    expect(missing).toContain("Photo unavailable");
    expect(missing).not.toContain('data-testid="rental-compared-rnt_lau_001"');
  });

  it("renders inline 96px photo, honest price and existing viewing action", () => {
    const html = renderToStaticMarkup(<RentalBrowseCard
      rental={rowToRental(apartmentRow())}
      mediaLayout="inline"
      onSchedule={vi.fn()}
      onDetails={vi.fn()}
    />);
    expect(html).toContain('data-testid="rental-browse-card-photo"');
    expect(html).toContain("w-24");
    expect(html).toContain("USD");
    expect(html).toContain('data-testid="rental-schedule-cta"');
    expect(html).toContain('data-testid="rental-card-link-rnt_lau_001"');
  });

  it("explains an exact Laureles 2BR match with real listing evidence", () => {
    const html = renderToStaticMarkup(<RentalBrowseCard
      rental={rowToRental(apartmentRow({ price_daily: null, price_monthly: 3_200_000, currency: "COP" }))}
      matchParams={{ neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2, maxPriceMonthly: 3_500_000, budgetCurrency: "COP" }}
      mediaLayout="inline"
    />);
    expect(html).toContain("Why it may fit:");
    expect(html).toContain("In Laureles");
    expect(html).toContain("2 BR, as you asked");
    expect(html).toContain("COP 3,200,000");
    expect(html).toContain("Wi-Fi listed");
    expect(html).not.toMatch(/hybrid_semantic|hybrid_search_listings RPC|neighborhood_profile/);
  });

  it("never claims a mismatched location, bedrooms, or currency is within budget", () => {
    const html = renderToStaticMarkup(<RentalBrowseCard
      rental={rowToRental(apartmentRow({ neighborhood: "Envigado", bedrooms: 3, price_monthly: 1200, currency: "USD", amenities: [], wifi_speed: null }))}
      matchParams={{ neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2, maxPriceMonthly: 3_500_000, budgetCurrency: "COP" }}
    />);
    expect(html).toContain("Long-stay listed");
    expect(html).not.toContain("within your");
    expect(html).not.toContain("as you asked");
  });

  it("inline card shows the stored $78/night price, never a derived monthly estimate", () => {
    const html = renderToStaticMarkup(<RentalBrowseCard
      rental={rowToRental(apartmentRow())}
      mediaLayout="inline"
      onSchedule={vi.fn()}
      onDetails={vi.fn()}
    />);
    expect(html).toContain("$78/night");
    expect(html).not.toContain("~$2,340/mo");
  });

  it("inline card with a stored monthly price shows only that price, never a derived nightly", () => {
    const html = renderToStaticMarkup(<RentalBrowseCard
      rental={rowToRental(apartmentRow({ price_monthly: 2100 }))}
      mediaLayout="inline"
      onSchedule={vi.fn()}
      onDetails={vi.fn()}
    />);
    expect(html).toContain("$2,100/mo");
    expect(html).not.toContain("/night");
    expect(html).not.toContain("~$");
  });

  it("inline card with only a stored monthly price shows that price", () => {
    const html = renderToStaticMarkup(<RentalBrowseCard
      rental={rowToRental(apartmentRow({ price_daily: null, price_monthly: 2100 }))}
      mediaLayout="inline"
      onSchedule={vi.fn()}
      onDetails={vi.fn()}
    />);
    expect(html).toContain("$2,100/mo");
    expect(html).not.toContain("/night");
  });

  it("shows the schedule CTA exactly when the database computed the listing requestable", () => {
    const html = renderCard({ rental_can_request_viewing: true });
    expect(html).toContain('data-testid="rental-schedule-cta"');
    expect(html).toContain("Schedule viewing");
    // SAN-478 — the CTA is a button that opens a modal, never a link or a navigation to
    // the `/schedule-viewing` path that has never had a route behind it.
    expect(html).not.toContain("schedule-viewing");
  });

  // SAN-1502 — the database's computed `rental_can_request_viewing` is the only eligibility owner.
  // Ownership, moderation, workflow and availability are already folded into that column under the
  // server-controlled phase, so the UI must not re-decide them (that was the duplicate rule).
  it("hides the CTA whenever the database computed the listing not requestable", () => {
    const html = renderCard({ rental_can_request_viewing: false });
    expect(html).not.toContain('data-testid="rental-schedule-cta"');
    expect(html).not.toContain("Schedule viewing");
  });

  it("fails closed when the row projection omits the computed column", () => {
    const html = renderCard({ rental_can_request_viewing: null });
    expect(html).not.toContain('data-testid="rental-schedule-cta"');
  });

  it("labels a duplicate row instead of hiding it", () => {
    expect(renderCard({}, { duplicateNote: "Also listed as #1" })).toContain("Also listed as #1");
  });

  it("still renders the listing itself when the CTA is withheld", () => {
    const html = renderCard({ rental_can_request_viewing: false });
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
    expect(html).toContain('data-testid="rental-card-map-select-rnt_lau_001"');
    expect(html).not.toContain('role="button"');
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
      (card.querySelector('[data-testid="rental-card-map-select-rnt_lau_001"]') as HTMLElement).click();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    container.remove();
  });
});

describe("External rental viewing CTA fails closed (SAN-1416)", () => {
  it("labels a database-requestable external ad as an MDE follow-up", () => {
    const rental = {
      ...rowToRental(apartmentRow()),
      id: "candidate-fincaraiz-193916988",
      tags: ["external-source"],
      source_url: "https://fincaraiz.com.co/apartment/193916988",
      can_schedule_viewing: true, // mis-flagged
      schedule_viewing_url: "https://mdeai.co/rentals/candidate-fincaraiz-193916988",
    };
    const html = renderToStaticMarkup(<RentalBrowseCard rental={rental} onSchedule={vi.fn()} />);
    expect(html).toContain('data-testid="rental-schedule-cta"');
    expect(html).toContain("Request MDE follow-up");
    expect(html).toContain("View original listing");
  });

  // SAN-1502 security: only approved advertiser hosts may be linked. A blocklist of MDE's own
  // domains would accept any other HTTPS URL and let a bad record redirect a renter off-site.
  it("never links an unapproved external host (open-redirect guard)", () => {
    const rental = {
      ...rowToRental(apartmentRow()),
      id: "candidate-evil-1",
      tags: ["external-source"],
      source_url: "https://evil.example.com/fake-listing",
      can_schedule_viewing: true,
      schedule_viewing_url: null,
    };
    const html = renderToStaticMarkup(<RentalBrowseCard rental={rental} onSchedule={vi.fn()} />);
    expect(html).not.toContain("View original listing");
    expect(html).not.toContain("evil.example.com");
  });

  // SAN-1502: the nine imported Fincaraíz listings lost the legacy inventory_kind marker but
  // kept their preserved provenance. Attribution must not depend on the removed marker.
  it("attributes a Fincaraíz import from preserved provenance without the removed marker", () => {
    const rental = rowToRental(
      apartmentRow({
        id: "candidate-fincaraiz-194104380",
        slug: "candidate-fincaraiz-194104380",
        source_url: "https://www.fincaraiz.com.co/apartamento-en-arriendo-en-el-poblado-medellin/194104380",
        metadata: {
          source_record_type: "third_party_advertisement",
          source_provider: "Fincaraíz",
          source_original_url:
            "https://www.fincaraiz.com.co/apartamento-en-arriendo-en-el-poblado-medellin/194104380",
        },
      }),
    );
    expect(rental.tags).toContain("external-source");
    expect(rental.source_provider).toBe("Fincaraíz");
    const html = renderToStaticMarkup(<RentalBrowseCard rental={rental} onSchedule={vi.fn()} />);
    expect(html).toContain("Request MDE follow-up");
    expect(html).toContain("Source: Fincaraíz");
    expect(html).toContain("View original listing");
  });

  // SAN-1502 Phase A: an imported record activated as MDE-managed development inventory is
  // presented as an ordinary MDE listing; provenance stays in metadata for pre-launch cleanup.
  it("treats an activated development import as ordinary MDE-managed inventory", () => {
    const rental = rowToRental(
      apartmentRow({
        id: "candidate-fincaraiz-194104380",
        slug: "candidate-fincaraiz-194104380",
        source_url: "https://www.fincaraiz.com.co/apartamento-en-arriendo-en-el-poblado-medellin/194104380",
        metadata: {
          mde_managed_development: true,
          source_record_type: "third_party_advertisement",
          source_provider: "Fincaraíz",
          inventory_kind: "external_candidate",
        },
      }),
    );
    expect(rental.tags).not.toContain("external-source");
    expect(rental.source_provider).toBeUndefined();
    const html = renderToStaticMarkup(<RentalBrowseCard rental={rental} onSchedule={vi.fn()} />);
    expect(html).not.toContain("Source: Fincaraíz");
    expect(html).not.toContain("View original listing");
    expect(html).toContain("Schedule viewing");
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
    const html = renderToStaticMarkup(
      <RentalBrowseCard rental={rental} detailSearch="?from=2026-11-01&through=2026-11-30" />,
    );
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

  it("preserves stay filters only in the MDE detail link", () => {
    const html = renderToStaticMarkup(
      <RentalBrowseCard
        rental={rowToRental(apartmentRow())}
        detailSearch="?from=2026-11-01&through=2026-11-30"
      />,
    );
    expect(html).toContain('href="/rentals/rnt_lau_001?from=2026-11-01&amp;through=2026-11-30"');
  });
});

describe("SAN-1416: Details action on the card", () => {
  const external = {
    ...rowToRental(apartmentRow({ id: "candidate-fincaraiz-193916988", slug: "candidate-fincaraiz-193916988" })),
    tags: ["external-source"],
    source_url: "https://fincaraiz.com.co/apartment/193916988",
    can_schedule_viewing: false,
    schedule_viewing_url: null,
  };

  it("with a Details handler the title and photo are buttons, never links to the advertiser", () => {
    const html = renderToStaticMarkup(<RentalBrowseCard rental={external} onDetails={vi.fn()} />);
    expect(html).toContain('data-testid="rental-details-cta-candidate-fincaraiz-193916988"');
    expect(html).toMatch(/<button[^>]*data-testid="rental-card-link-candidate-fincaraiz-193916988"/);
    expect(html).toContain('data-testid="rental-card-photo-details-candidate-fincaraiz-193916988"');
    expect(html).not.toMatch(/<a[^>]*data-testid="rental-card-link-/);
    // The advertiser stays one labelled secondary action, not the primary one.
    expect(html).toContain('data-testid="rental-card-source-candidate-fincaraiz-193916988"');
    expect(html).not.toContain("Schedule viewing");
  });

  it("without a Details handler the card is unchanged: no Details button, title still links out", () => {
    const html = renderToStaticMarkup(<RentalBrowseCard rental={external} />);
    expect(html).not.toContain("rental-details-cta-");
    expect(html).toMatch(/<a[^>]*data-testid="rental-card-link-candidate-fincaraiz-193916988"/);
  });

  it("clicking Details calls the handler once and does not navigate or open a window", async () => {
    const onDetails = vi.fn();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<RentalBrowseCard rental={external} onDetails={onDetails} onSelect={vi.fn()} />));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid^="rental-details-cta-"]')?.click();
    });
    expect(onDetails).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
    open.mockRestore();
  });
});

/**
 * A monthly-priced listing leads with its monthly rent. Its nightly figure is only rent ÷ 30, so
 * WE Home (COP 14,500,000 a month) used to read as "COP 483,333/night" over its photo, and a
 * USD 1,550 rent as "$52/night". A listing that has only a nightly price still shows it.
 */
describe("RentalBrowseCard — price label", () => {
  it("identifies USD beside the monthly price so mixed-currency cards are unmistakable", () => {
    const usd = renderCard({ price_daily: null, price_monthly: 1900, currency: "USD" });
    const cop = renderCard({ price_daily: null, price_monthly: 2_400_000, currency: "COP" });
    expect(usd).toContain("$1,900/mo");
    expect(usd).toContain('data-testid="rental-card-currency"');
    expect(usd).toContain(">USD</span>");
    expect(cop).toContain("COP 2,400,000/mo");
    expect(cop).not.toContain('data-testid="rental-card-currency"');
  });

  it("labels the primary nightly price for a USD-only listing, and leaves COP nightly alone", () => {
    const usd = renderCard({ price_daily: 78, price_monthly: null, currency: "USD" });
    const cop = renderCard({ price_daily: 80_000, price_monthly: null, currency: "COP" });
    expect(usd).toContain("$78/night");
    expect(usd).toContain('data-testid="rental-card-nightly-currency"');
    expect(cop).toContain("COP 80,000/night");
    expect(cop).not.toContain('data-testid="rental-card-nightly-currency"');
  });

  it("shows the monthly rent and no derived nightly price for a COP monthly listing", () => {
    const html = renderCard({ price_daily: null, price_monthly: 14_500_000, currency: "COP" });

    expect(html).toContain("COP 14,500,000/mo");
    expect(html).not.toContain("/night");
    expect(html).not.toContain("483,333");
  });

  it("shows the monthly rent in dollars with no derived nightly price for a USD monthly listing", () => {
    const html = renderCard({ price_daily: null, price_monthly: 1550, currency: "USD" });

    expect(html).toContain("$1,550/mo");
    expect(html).not.toContain("/night");
  });

  it("still shows the nightly price for a listing that has no monthly price", () => {
    const html = renderCard({ price_daily: 78, price_monthly: null, currency: "USD" });

    expect(html).toContain("$78/night");
  });
});
