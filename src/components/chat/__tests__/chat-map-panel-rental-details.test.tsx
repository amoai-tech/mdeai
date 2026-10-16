// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Rental } from "@/mastra/tools/search-rentals";

const ui = vi.hoisted(() => ({
  venueDetail: null as unknown,
  closeVenueDetail: vi.fn(),
  openScheduleViewing: vi.fn(),
  pins: [] as Array<{ id: string; source?: string }>,
  lg: true,
}));

vi.mock("@/components/maps/ChatMap", () => ({ ChatMap: () => <div data-testid="chat-map" /> }));
vi.mock("@/components/cafe/cafe-detail-panel", () => ({ CafeDetailPanel: () => null }));
vi.mock("@/components/nightlife/nightlife-detail-panel", () => ({ NightlifeDetailPanel: () => null }));
vi.mock("@/hooks/use-is-lg-up", () => ({ useIsLgUp: () => ui.lg }));
vi.mock("@/platform/maps/map-context", () => ({ useMapContext: () => ({ pins: ui.pins }) }));
vi.mock("@/components/chat/rental-ui-context", () => ({
  useRentalUi: () => ({
    cafeDetail: null,
    cafeSiblings: [],
    nightlifeDetail: null,
    nightlifeSiblings: [],
    venueDetail: ui.venueDetail,
    closeVenueDetail: ui.closeVenueDetail,
    openScheduleViewing: ui.openScheduleViewing,
  }),
}));

import { ChatMapPanel } from "@/components/chat/chat-map-panel";
import { RentalDetailMobileSheet } from "@/components/chat/rental-detail-mobile-sheet";

const rental: Rental = {
  id: "r1",
  title: "Furnished apartment in Laureles",
  neighborhood: "Laureles",
  nightly_price: 0,
  currency: "COP",
  bedrooms: 2,
  wifi: false,
  amenities: ["workspace"],
  image: "https://example.test/a.webp",
  images: ["https://example.test/a.webp"],
  source_url: "https://www.fincaraiz.com.co/apartamento/1",
  can_schedule_viewing: false,
  schedule_viewing_url: null,
  host_name: "Advertiser",
  availability: "Availability unconfirmed",
  tags: ["external-source"],
  price_monthly: 2_400_000,
  latitude: 6.24,
  longitude: -75.58,
};

const detail = (overrides: Record<string, unknown> = {}) => ({
  kind: "rental",
  listingId: "r1",
  pinId: "rental-r1",
  pinned: true,
  title: rental.title,
  neighborhood: rental.neighborhood,
  rental,
  ...overrides,
});

let root: Root;
let container: HTMLElement;
const mount = (node: React.ReactNode) => act(() => root.render(node));
const q = (sel: string) => document.body.querySelector(sel);

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  ui.venueDetail = null;
  ui.closeVenueDetail.mockReset();
  ui.openScheduleViewing.mockReset();
  ui.pins = [{ id: "rental-r1" }];
  ui.lg = true;
  // jsdom lacks these browser APIs; the photo carousel in the details panel needs them.
  window.matchMedia = (() => ({
    matches: false,
    media: "",
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
  act(() => root.unmount());
  container.remove();
});

describe("SAN-1504 chat map column", () => {
  it("shows the map by default", () => {
    mount(<ChatMapPanel />);
    expect(q('[data-testid="map-panel"]')?.getAttribute("data-right-column-mode")).toBe("map");
    expect(q('[data-testid="rental-details-panel"]')).toBeNull();
  });

  it("on a desktop, Details replaces the map column with the rental panel, and the map stays mounted", () => {
    ui.venueDetail = detail();
    mount(<ChatMapPanel />);
    expect(q('[data-testid="map-panel"]')?.getAttribute("data-right-column-mode")).toBe("detail");
    expect(q('[data-testid="rental-details-panel"]')).not.toBeNull();
    expect(q('[data-testid="rental-details-price"]')?.textContent).toMatch(/2,400,000/);
    // Kept mounted under the panel, so closing brings back the same camera, pins and selection.
    expect(q('[data-testid="chat-map"]')).not.toBeNull();
  });

  it("the column is named for what it shows: the map, then the rental details", () => {
    mount(<ChatMapPanel />);
    expect(q('[data-testid="map-panel"]')?.getAttribute("aria-label")).toBe("Medellín map");
    ui.venueDetail = detail();
    mount(<ChatMapPanel />);
    expect(q('[data-testid="map-panel"]')?.getAttribute("aria-label")).toBe("Rental details");
  });

  it("Close returns to the map through the shared close handler", () => {
    ui.venueDetail = detail();
    mount(<ChatMapPanel />);
    act(() => (q('[data-testid="rental-details-close"]') as HTMLElement).click());
    expect(ui.closeVenueDetail).toHaveBeenCalledTimes(1);
  });

  it("offers the viewing request only when the server said it is allowed", () => {
    ui.venueDetail = detail({ rental: { ...rental, can_schedule_viewing: true, tags: [] } });
    mount(<ChatMapPanel />);
    const cta = q('[data-testid="rental-details-schedule-cta"]') as HTMLElement;
    expect(cta).not.toBeNull();
    act(() => cta.click());
    expect(ui.openScheduleViewing).toHaveBeenCalledWith(
      expect.objectContaining({ listingId: "r1", title: rental.title, neighborhood: "Laureles" }),
    );
  });

  it("an external ad has no viewing action", () => {
    ui.venueDetail = detail();
    mount(<ChatMapPanel />);
    expect(q('[data-testid="rental-details-schedule-cta"]')).toBeNull();
  });

  it("a reduced rental detail (no full rental) leaves the column on the map", () => {
    ui.venueDetail = detail({ rental: undefined });
    mount(<ChatMapPanel />);
    expect(q('[data-testid="map-panel"]')?.getAttribute("data-right-column-mode")).toBe("map");
  });

  it("closes when a new search removes the pin of the open apartment", () => {
    ui.venueDetail = detail();
    mount(<ChatMapPanel />);
    expect(ui.closeVenueDetail).not.toHaveBeenCalled();
    ui.pins = [{ id: "rental-other" }];
    mount(<ChatMapPanel />);
    expect(ui.closeVenueDetail).toHaveBeenCalledTimes(1);
  });

  it("an apartment with no pin stays open when the pins change", () => {
    ui.venueDetail = detail({ pinned: false });
    ui.pins = [];
    mount(<ChatMapPanel />);
    ui.pins = [{ id: "rental-other" }];
    mount(<ChatMapPanel />);
    expect(ui.closeVenueDetail).not.toHaveBeenCalled();
  });

  it("below the desktop breakpoint the column renders no panel (the phone sheet owns it)", () => {
    ui.lg = false;
    ui.venueDetail = detail();
    mount(<ChatMapPanel />);
    expect(q('[data-testid="rental-details-panel"]')).toBeNull();
  });
});

describe("SAN-1504 phone sheet", () => {
  it("opens the rich rental sheet below the desktop breakpoint", () => {
    ui.lg = false;
    ui.venueDetail = detail();
    mount(<RentalDetailMobileSheet />);
    expect(q('[data-testid="rental-details-sheet"]')).not.toBeNull();
    expect(q('[data-testid="rental-details-price"]')?.textContent).toMatch(/2,400,000/);
  });

  it("stays closed on a desktop, so only one detail view exists", () => {
    ui.lg = true;
    ui.venueDetail = detail();
    mount(<RentalDetailMobileSheet />);
    expect(q('[data-testid="rental-details-sheet"]')).toBeNull();
  });

  it("stays closed for a reduced detail, which the old sheet handles", () => {
    ui.lg = false;
    ui.venueDetail = detail({ rental: undefined });
    mount(<RentalDetailMobileSheet />);
    expect(q('[data-testid="rental-details-sheet"]')).toBeNull();
  });

  it("Close uses the shared close handler", () => {
    ui.lg = false;
    ui.venueDetail = detail();
    mount(<RentalDetailMobileSheet />);
    act(() => (q('[data-testid="rental-details-close"]') as HTMLElement).click());
    expect(ui.closeVenueDetail).toHaveBeenCalledTimes(1);
  });
});
