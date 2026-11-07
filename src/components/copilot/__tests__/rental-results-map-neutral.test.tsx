// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ui = vi.hoisted(() => ({
  panToPin: vi.fn(),
  openVenueDetail: vi.fn(),
  openScheduleViewing: vi.fn(),
  selectedPinId: null as string | null,
  pins: [] as Array<{ id: string }>,
}));

vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => ({ selectedPinId: ui.selectedPinId, panToPin: ui.panToPin, pins: ui.pins }),
}));
vi.mock("@/components/chat/rental-ui-context", () => ({
  useRentalUi: () => ({
    openVenueDetail: ui.openVenueDetail,
    openScheduleViewing: ui.openScheduleViewing,
  }),
}));
vi.mock("@/components/chat/rich-card-results-context", () => ({
  RichCardResultsRegistrar: () => null,
}));
vi.mock("@/components/copilot/tool-pins-sync", () => ({ ToolPinsSync: () => null }));

import { RentalResults } from "@/components/copilot/search-tool-result-cards";
import { SearchToolResultScope } from "@/components/copilot/search-tool-result-ownership";
import { RentalComparisonOwnerProvider } from "@/components/chat/rental-comparison-owner-context";
import type { RentalSearchMeta } from "@/components/chat/rental-fast-path-context";

const rental = (id: string, coords?: { latitude: number; longitude: number }) => ({
  id,
  title: `Rental ${id}`,
  neighborhood: "Laureles",
  nightly_price: 100,
  price_monthly: 3000000,
  currency: "COP",
  bedrooms: 2,
  can_schedule_viewing: false,
  ...coords,
});

let root: Root;
let container: HTMLElement;
function render(result: unknown = {
  source: "supabase",
  results: [rental("mapped", { latitude: 6.24, longitude: -75.59 }), rental("unmapped")],
}, searchMeta?: RentalSearchMeta) {
  act(() => {
    root.render(<RentalResults result={result} searchMeta={searchMeta} />);
  });
}
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  ui.panToPin.mockReset();
  ui.openVenueDetail.mockReset();
  ui.openScheduleViewing.mockReset();
  ui.selectedPinId = null;
  ui.pins = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("rental budget mismatch explanation", () => {
  const note = "External advertisements priced in COP/month are excluded from USD/night budget searches.";

  it("shows the mismatch once and omits ranking for an empty result", () => {
    render({ source: "supabase", results: [], budgetNote: note,
      rankExplanation: [{ factor: "neighborhood", score: 1, note: "Laureles filter" }] });
    expect(container.textContent?.split(note).length - 1).toBe(1);
    expect(container.textContent).not.toContain("Why these rentals");
  });

  it("keeps the comparison note visible when other listings matched", () => {
    render({ source: "supabase", results: [rental("one")], budgetNote: note });
    expect(container.textContent?.split(note).length - 1).toBe(1);
  });
});

describe("unapplied rental requests disclosure", () => {
  const note = "I can't filter by pet-friendly yet, so check each card.";

  it("shows the same sentence once when cards are rendered", () => {
    render({ source: "supabase", results: [rental("one")], unappliedRequests: ["pet-friendly"] });
    expect(container.textContent?.split(note).length - 1).toBe(1);
  });

  it("admits the request in an empty result instead of implying it applied", () => {
    render({ source: "supabase", results: [], unappliedRequests: ["pet-friendly"] });
    expect(container.textContent).toContain("I can't filter by pet-friendly yet.");
    expect(container.textContent).not.toContain("so check each card");
  });

  it("adds nothing when the search applied every request", () => {
    render({ source: "supabase", results: [rental("one")], unappliedRequests: [] });
    expect(container.textContent).not.toMatch(/can't filter/);
  });
});

describe("SAN-472 chat rental card/map parity", () => {
  it("mapped result shares canonical listing pin and focuses the map", () => {
    render();
    const card = container.querySelector('[data-pin-id="rental-mapped"]');
    expect(card).not.toBeNull();
    act(() => (card!.querySelector('[role="button"]') as HTMLElement).click());
    expect(ui.panToPin).toHaveBeenCalledWith("rental-mapped");
  });
  it("unmapped result opens detail without selecting or inventing a pin", () => {
    render();
    const card = Array.from(container.querySelectorAll('[data-testid="rental-card"]'))
      .find((el) => el.textContent?.includes("Rental unmapped"));
    expect(card).toBeDefined();
    expect(card!.hasAttribute("data-pin-id")).toBe(false);
    act(() => (card!.querySelector('[role="button"]') as HTMLElement).click());
    expect(ui.openVenueDetail).toHaveBeenCalledTimes(1);
    expect(ui.panToPin).not.toHaveBeenCalled();
  });
  it("does not show an unmapped item as a selected map pin", () => {
    ui.selectedPinId = "rental-unmapped";
    render();
    const card = Array.from(container.querySelectorAll('[data-testid="rental-card"]'))
      .find((el) => el.textContent?.includes("Rental unmapped"));
    expect(card?.getAttribute("data-selected")).toBe("false");
  });
});

/** A row exactly as the rental search tool returns it (it validates against `rentalSchema`). */
const fullRental = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Rental ${id}`,
  neighborhood: "Laureles",
  nightly_price: 0,
  currency: "COP",
  bedrooms: 2,
  wifi: false,
  amenities: ["workspace"],
  image: "https://example.test/a.webp",
  images: ["https://example.test/a.webp", "https://example.test/b.webp"],
  photo_count: 2,
  source_url: "https://www.fincaraiz.com.co/apartamento/1",
  can_schedule_viewing: false,
  schedule_viewing_url: null,
  host_name: "Advertiser",
  availability: "Availability unconfirmed",
  tags: [] as string[],
  price_monthly: 2_400_000,
  ...extra,
});

const detailsButton = (id: string) => {
  const card = Array.from(container.querySelectorAll('[data-testid="rental-card"]')).find((el) =>
    el.textContent?.includes(`Rental ${id}`),
  );
  const button = Array.from(card?.querySelectorAll("button") ?? []).find((b) => /details/i.test(b.textContent ?? ""));
  return button as HTMLButtonElement | undefined;
};

describe("SAN-1504 chat Details hands the full rental to the shared detail state", () => {
  it("passes monthly price, photos, source link and coordinates, not the reduced sheet fields", () => {
    render({
      source: "supabase",
      results: [fullRental("mapped", { latitude: 6.24, longitude: -75.59 })],
    });
    const button = detailsButton("mapped");
    expect(button).toBeDefined();
    act(() => button!.click());
    expect(ui.openVenueDetail).toHaveBeenCalledTimes(1);
    expect(ui.openVenueDetail.mock.calls[0][0]).toMatchObject({
      kind: "rental",
      listingId: "mapped",
      pinId: "rental-mapped",
      pinned: true,
      rental: {
        price_monthly: 2_400_000,
        currency: "COP",
        images: ["https://example.test/a.webp", "https://example.test/b.webp"],
        source_url: "https://www.fincaraiz.com.co/apartamento/1",
        latitude: 6.24,
        longitude: -75.59,
      },
    });
  });

  it("a source-linked external ad now has Details (read-only), as the 2026-10-15 task correction says", () => {
    render({ source: "supabase", results: [fullRental("ext", { tags: ["external-source"] })] });
    const button = detailsButton("ext");
    expect(button).toBeDefined();
    act(() => button!.click());
    expect(ui.openVenueDetail).toHaveBeenCalledTimes(1);
    expect(ui.openVenueDetail.mock.calls[0][0].rental.can_schedule_viewing).toBe(false);
  });

  it("an apartment with no coordinates opens details with no pin selected", () => {
    render({ source: "supabase", results: [fullRental("nocoords")] });
    act(() => detailsButton("nocoords")!.click());
    expect(ui.panToPin).not.toHaveBeenCalled();
    expect(ui.openVenueDetail.mock.calls[0][0]).toMatchObject({ pinned: false });
  });

  it("a row that is not a complete rental keeps the old reduced detail, and an external one gets no Details", () => {
    render({ source: "supabase", results: [rental("partial"), { ...rental("ext2"), tags: ["external-source"] }] });
    act(() => detailsButton("partial")!.click());
    expect(ui.openVenueDetail.mock.calls[0][0].rental).toBeUndefined();
    expect(detailsButton("ext2")).toBeUndefined();
  });
});

describe("SAN-1503 · truthful natural-language rental result totals", () => {
  const result = { source: "supabase", results: [rental("one"), rental("two"), rental("three")], total: 42 };
  const meta = (queryText?: string): RentalSearchMeta => ({
    userText: "Find rentals",
    params: { ...(queryText !== undefined ? { queryText } : {}) },
  });

  it("shows an exact total for structured results", () => {
    render(result, meta());
    expect(container.querySelector('[data-testid="rental-results-count"]')?.textContent)
      .toContain("Showing 3 of 42 matching apartments");
  });

  it("does not claim the bounded candidate count is an exact total for natural-language searches", () => {
    render(result, meta("quiet rentals near cafés"));
    const count = container.querySelector('[data-testid="rental-results-count"]')?.textContent ?? "";
    expect(count).toContain("3 suggested apartments");
    expect(count).not.toContain("42");
  });

  it("whitespace queryText preserves the exact structured total", () => {
    render(result, meta("  "));
    expect(container.querySelector('[data-testid="rental-results-count"]')?.textContent)
      .toContain("Showing 3 of 42 matching apartments");
  });

  it("keeps the real catalog link while hiding estimated query counts", () => {
    render(result, meta("digital nomad apartment"));
    expect(container.querySelector('[data-testid="rental-browse-all-link"]')?.getAttribute("href"))
      .toBe("/rentals");
  });

  it("keeps existing tool result behavior when no search metadata is supplied", () => {
    render(result);
    expect(container.querySelector('[data-testid="rental-results-count"]')?.textContent)
      .toContain("Showing 3 of 42 matching apartments");
  });

  it("never shows a count or browse link for empty results", () => {
    render({ source: "supabase", results: [], total: 42 }, meta("quiet"));
    expect(container.querySelector('[data-testid="rental-results-count"]')).toBeNull();
    expect(container.querySelector('[data-testid="rental-browse-all-link"]')).toBeNull();
  });
});

describe("SAN-1041 · deterministic comparison from rental tool results", () => {
  const result = {
    source: "supabase",
    results: [
      fullRental("first", { latitude: 6.24, longitude: -75.59 }),
      fullRental("second", { price_monthly: 2_800_000 }),
      fullRental("third", { price_monthly: 3_500_000 }),
    ],
  };

  it("selects two real result IDs, compares their own prices, then opens existing Details", () => {
    ui.pins = [{ id: "rental-first" }];
    render(result);
    const toggles = [...container.querySelectorAll<HTMLButtonElement>('[data-testid="rental-compare-toggle"]')];
    expect(toggles).toHaveLength(3);
    expect(toggles[0].closest('[data-testid="rental-card"]')).not.toBeNull();
    expect(toggles[0].getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector('[data-testid="rental-compare-open"]')).toBeNull();
    act(() => toggles[0].click());
    const open = container.querySelector<HTMLButtonElement>('[data-testid="rental-compare-open"]');
    const toolbar = container.querySelector<HTMLElement>('[data-testid="rental-compare-toolbar"]');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.className).toMatch(/sticky.*bottom-0/);
    expect(toolbar?.textContent).toContain("1 of 4 apartments selected");
    expect(open?.disabled).toBe(true);
    expect(toggles[0].getAttribute("aria-pressed")).toBe("true");
    expect(ui.openVenueDetail).not.toHaveBeenCalled(); // compare must not open Details
    act(() => toggles[1].click());
    expect(toolbar?.textContent).toContain("2 of 4 apartments selected");
    expect(open?.disabled).toBe(false);
    act(() => open?.click());
    const dialog = document.querySelector('[data-testid="rental-comparison-modal"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("COP 2,400,000/month");
    expect(dialog?.textContent).toContain("COP 2,800,000/month");
    // The shared dialog has sm:max-w-sm by default. Explicitly override it
    // so the comparison shows multiple columns on a desktop-sized screen.
    expect(dialog?.className).toContain("sm:max-w-6xl");
    const details = dialog?.querySelector<HTMLButtonElement>(
      '[data-testid="rental-comparison-column-first"] button:nth-child(2)',
    );
    expect(details?.textContent).toMatch(/Details/);
    act(() => details?.click());
    expect(ui.openVenueDetail).toHaveBeenCalledWith(expect.objectContaining({
      kind: "rental", listingId: "first", pinned: true,
      rental: expect.objectContaining({ price_monthly: 2_400_000 }),
    }));
    expect(ui.panToPin).toHaveBeenCalledWith("rental-first");
  });

  it("attaches the selected action to the real composer overlay instead of hiding below the transcript", () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const panel = document.createElement("div");
    panel.dataset.testid = "center-chat-panel";
    const overlay = document.createElement("div");
    overlay.dataset.testid = "copilot-input-overlay";
    panel.appendChild(overlay);
    document.body.appendChild(panel);
    try {
      render(result);
      const toggle = container.querySelector<HTMLButtonElement>('[data-testid="rental-compare-toggle"]');
      act(() => toggle?.click());
      act(() => callbacks.forEach((callback) => callback(0)));
      const anchored = overlay.querySelector<HTMLElement>('[data-testid="rental-compare-toolbar"]');
      expect(anchored).not.toBeNull();
      expect(anchored?.style.bottom).toBe("100%");
      expect(anchored?.style.zIndex).toBe("30");
      expect(overlay.style.zIndex).toBe("35");
      expect(container.querySelector('[data-testid="rental-compare-toolbar"]')).toBeNull();
      act(() => overlay.querySelector<HTMLButtonElement>('[data-testid="rental-compare-clear"]')?.click());
      expect(overlay.querySelector('[data-testid="rental-compare-toolbar"]')).toBeNull();
      expect(overlay.style.zIndex).toBe("");
    } finally {
      panel.remove();
      vi.unstubAllGlobals();
    }
  });

  it("does not portal the comparison for a stale historical tool result", () => {
    const panel = document.createElement("div");
    panel.dataset.testid = "center-chat-panel";
    const overlay = document.createElement("div");
    overlay.dataset.testid = "copilot-input-overlay";
    panel.appendChild(overlay);
    document.body.appendChild(panel);
    try {
      act(() => {
        root.render(
          <SearchToolResultScope toolCallId="old-tool-call">
            <RentalResults result={result} />
          </SearchToolResultScope>,
        );
      });
      // An old tool result stays readable, but cannot select apartments or
      // commandeer the current chat's comparison bar.
      expect(container.querySelectorAll('[data-testid="rental-compare-toggle"]')).toHaveLength(0);
      expect(overlay.querySelector('[data-testid="rental-compare-toolbar"]')).toBeNull();
      expect(container.querySelector('[data-testid="rental-compare-toolbar"]')).toBeNull();
      expect(overlay.style.zIndex).toBe("");
    } finally {
      panel.remove();
    }
  });

  it("two retained result turns share one composer toolbar, switch ownership, and restore z-index", () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const panel = document.createElement("div");
    panel.dataset.testid = "center-chat-panel";
    const overlay = document.createElement("div");
    overlay.dataset.testid = "copilot-input-overlay";
    // Existing inline stacking may be set by other chat features.
    overlay.style.zIndex = "23";
    panel.appendChild(overlay);
    document.body.appendChild(panel);
    const second = {
      source: "supabase",
      results: [fullRental("new-a", { price_monthly: 3_100_000 }), fullRental("new-b", { price_monthly: 6_000_000 })],
    };

    try {
      act(() => root.render(
        <RentalComparisonOwnerProvider>
          <div data-testid="earlier-turn"><RentalResults result={result} /></div>
          <div data-testid="newer-turn"><RentalResults result={second} /></div>
        </RentalComparisonOwnerProvider>,
      ));
      const firstButtons = container.querySelectorAll<HTMLButtonElement>(
        '[data-testid="earlier-turn"] [data-testid="rental-compare-toggle"]',
      );
      const nextButtons = container.querySelectorAll<HTMLButtonElement>(
        '[data-testid="newer-turn"] [data-testid="rental-compare-toggle"]',
      );
      expect(firstButtons).toHaveLength(3);
      expect(nextButtons).toHaveLength(2);

      // Old result selected first: exactly one overlay, with first result data.
      act(() => { firstButtons[0].click(); firstButtons[1].click(); });
      act(() => callbacks.forEach((callback) => callback(0)));
      expect(overlay.querySelectorAll('[data-testid="rental-compare-toolbar"]')).toHaveLength(1);
      expect(overlay.style.zIndex).toBe("35");
      expect(overlay.textContent).toContain("2 of 4 apartments selected");

      // A newer selection takes over without two identical overlapping toolbars.
      act(() => { nextButtons[0].click(); nextButtons[1].click(); });
      act(() => callbacks.forEach((callback) => callback(0)));
      expect(overlay.querySelectorAll('[data-testid="rental-compare-toolbar"]')).toHaveLength(1);
      expect(overlay.textContent).toContain("2 of 4 apartments selected");
      expect(firstButtons[0].getAttribute("aria-pressed")).toBe("true");
      expect(nextButtons[0].getAttribute("aria-pressed")).toBe("true");
      act(() => overlay.querySelector<HTMLButtonElement>('[data-testid="rental-compare-open"]')?.click());
      const dialog = document.querySelector('[data-testid="rental-comparison-modal"]');
      expect(dialog?.textContent).toContain("COP 6,000,000/month");
      expect(dialog?.textContent).not.toContain("COP 2,400,000/month");

      // Clearing the active selection must not resurrect the old result's bar.
      act(() => overlay.querySelector<HTMLButtonElement>('[data-testid="rental-compare-clear"]')?.click());
      expect(overlay.querySelector('[data-testid="rental-compare-toolbar"]')).toBeNull();
      expect(overlay.style.zIndex).toBe("23");
    } finally {
      panel.remove();
      vi.unstubAllGlobals();
    }
  });

  it("invalidates selection when a subsequent result replaces the source IDs", () => {
    render(result);
    const toggles = [...container.querySelectorAll<HTMLButtonElement>('[data-testid="rental-compare-toggle"]')];
    act(() => { toggles[0].click(); toggles[1].click(); });
    expect(container.querySelector<HTMLButtonElement>('[data-testid="rental-compare-open"]')?.disabled).toBe(false);
    render({ source: "supabase", results: [fullRental("new-a"), fullRental("new-b")] });
    expect(container.querySelector('[data-testid="rental-compare-toolbar"]')).toBeNull();
    expect(container.querySelector('[data-testid="rental-compare-open"]')).toBeNull();
  });

  it("keeps the sticky action bar until selection is cleared, then removes it", () => {
    render(result);
    const toggles = [...container.querySelectorAll<HTMLButtonElement>('[data-testid="rental-compare-toggle"]')];
    act(() => toggles[0].click());
    const toolbar = container.querySelector<HTMLElement>('[data-testid="rental-compare-toolbar"]');
    expect(toolbar?.getAttribute("role")).toBe("group");
    expect(toolbar?.getAttribute("aria-label")).toBe("Apartment comparison selection");
    expect(container.querySelector<HTMLButtonElement>('[data-testid="rental-compare-open"]')?.disabled).toBe(true);
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="rental-compare-clear"]')?.click());
    expect(container.querySelector('[data-testid="rental-compare-toolbar"]')).toBeNull();
    expect(container.querySelector('[data-testid="rental-compare-open"]')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('[data-testid="rental-compare-toggle"]')?.getAttribute("aria-pressed")).toBe("false");
  });
});
