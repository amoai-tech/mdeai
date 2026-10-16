// @vitest-environment jsdom
/**
 * The listing page used to cut every gallery to five photos, so photos six to seventy-six of a
 * managed listing (Asturias 402 has 76) were reachable nowhere. Every photo must be reachable:
 * by swipe on a phone, and behind "Show all N photos" on a desktop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/leads/submit-schedule-viewing", () => ({
  submitScheduleViewing: vi.fn(),
  ScheduleViewingError: class extends Error {},
}));
vi.mock("@/lib/use-modal-a11y", () => ({ useModalA11y: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
    }),
  }),
}));

import { RentalDetailView } from "@/components/rentals/rental-detail-view";
import { mapApartmentRowToDetail, type RentalDetail } from "@/lib/rentals/get-rental-detail";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function detailWith(photoCount: number): RentalDetail {
  return mapApartmentRowToDetail({
    id: "11111111-2222-4333-8444-555555555555",
    title: "Asturias 402",
    neighborhood: "El Poblado",
    bedrooms: 3,
    price_monthly: 2900,
    currency: "USD",
    status: "active",
    moderation_status: "approved",
    listing_workflow_status: "published",
    landlord_id: "a4da05ae-347e-4250-8ae0-83812ccc7703",
    available_from: "2026-10-14",
    images: Array.from({ length: photoCount }, (_, i) => `https://example.supabase.co/listing-photos/${i + 1}.jpg`),
  });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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

const byId = (id: string) => container.querySelector(`[data-testid="${id}"]`);
const render = (detail: RentalDetail) => act(() => root.render(<RentalDetailView detail={detail} />));

describe("RentalDetailView — every photo is reachable", () => {
  it("puts every photo in the phone carousel, not just the first five", () => {
    render(detailWith(30));

    expect(container.querySelectorAll('[data-testid^="rental-detail-slide-"]')).toHaveLength(30);
  });

  it("keeps a five-photo mosaic on desktop and reveals all photos on demand", () => {
    render(detailWith(30));

    const button = byId("rental-detail-show-all-photos") as HTMLButtonElement | null;
    expect(button?.textContent).toBe("Show all 30 photos");
    expect(byId("rental-detail-all-photos")).toBeNull();

    act(() => button?.click());

    expect(byId("rental-detail-all-photos")?.querySelectorAll("img")).toHaveLength(30);
    expect((byId("rental-detail-show-all-photos") as HTMLButtonElement).textContent).toBe("Show fewer photos");

    act(() => (byId("rental-detail-show-all-photos") as HTMLButtonElement).click());
    expect(byId("rental-detail-all-photos")).toBeNull();
  });

  it("offers no 'show all' button when the five-photo mosaic already holds every photo", () => {
    render(detailWith(5));

    expect(byId("rental-detail-show-all-photos")).toBeNull();
  });
});
