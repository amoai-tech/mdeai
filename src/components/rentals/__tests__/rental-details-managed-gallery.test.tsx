// @vitest-environment jsdom
/**
 * The Details panel beside the /rentals list must show the gallery of a managed listing, not only
 * its cover photo. Built through the real `rowToRental` so the test proves the data contract that
 * ships (a 76-photo listing becomes a bounded 12-photo carousel), not a hand-written card.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/modals/schedule-viewing-modal", () => ({ ScheduleViewingModal: () => null }));

import { RentalDetailsPanel } from "@/components/rentals/rental-details-panel";
import { RENTAL_PANEL_PHOTO_LIMIT, rowToRental, type ApartmentRow } from "@/mastra/tools/search-rentals";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function managedRow(photoCount: number): ApartmentRow {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    title: "Asturias 402",
    neighborhood: "El Poblado",
    bedrooms: 3,
    price_daily: null,
    price_monthly: 2900,
    currency: "USD",
    wifi_speed: null,
    amenities: [],
    images: Array.from(
      { length: photoCount },
      (_, i) => `https://example.supabase.co/storage/v1/object/public/listing-photos/mde-asturias-402/${i + 1}.jpg`,
    ),
    host_name: "SK",
    source_url: null,
    available_from: "2026-10-16",
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 30,
    slug: "mde-asturias-402",
    latitude: 6.2,
    longitude: -75.57,
    landlord_id: "a4da05ae-347e-4250-8ae0-83812ccc7703",
    status: "active",
    moderation_status: "approved",
    listing_workflow_status: "published",
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // jsdom lacks these browser APIs; the carousel needs them (same stubs as rental-details.test.tsx).
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  class ObserverStub {
    observe = () => undefined;
    unobserve = () => undefined;
    disconnect = () => undefined;
    takeRecords = () => [];
  }
  vi.stubGlobal("IntersectionObserver", ObserverStub);
  vi.stubGlobal("ResizeObserver", ObserverStub);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => root.unmount());
  container.remove();
});

const photos = () => container.querySelectorAll('[data-testid^="rental-details-photo-"]');

describe("RentalDetailsPanel — managed listing gallery", () => {
  it("renders the bounded gallery, not just the cover photo", () => {
    act(() => {
      root.render(
        <div className="relative">
          <RentalDetailsPanel rental={rowToRental(managedRow(76))} onClose={() => undefined} />
        </div>,
      );
    });

    expect(container.querySelector('[data-testid="rental-details-gallery"]')).not.toBeNull();
    expect(photos()).toHaveLength(RENTAL_PANEL_PHOTO_LIMIT);
    expect(container.querySelector('[data-testid="rental-details-photo-1"]')).not.toBeNull();
    expect(container.querySelector(`[data-testid="rental-details-photo-${RENTAL_PANEL_PHOTO_LIMIT + 1}"]`)).toBeNull();
  });

  it("still renders a one-photo listing as a single photo", () => {
    act(() => {
      root.render(
        <div className="relative">
          <RentalDetailsPanel rental={rowToRental(managedRow(1))} onClose={() => undefined} />
        </div>,
      );
    });

    expect(photos()).toHaveLength(1);
  });

  it("says how many photos exist and links to all of them when the gallery was cut short", () => {
    const rental = rowToRental(managedRow(76));
    act(() => {
      root.render(
        <div className="relative">
          <RentalDetailsPanel rental={rental} onClose={() => undefined} />
        </div>,
      );
    });

    const link = container.querySelector<HTMLAnchorElement>('[data-testid="rental-details-all-photos-link"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("12 of 76 photos");
    expect(link?.getAttribute("href")).toBe(`/rentals/${rental.id}`);
  });

  it("shows no link when every photo is already in the carousel", () => {
    act(() => {
      root.render(
        <div className="relative">
          <RentalDetailsPanel rental={rowToRental(managedRow(5))} onClose={() => undefined} />
        </div>,
      );
    });

    expect(container.querySelector('[data-testid="rental-details-all-photos-link"]')).toBeNull();
  });
});
