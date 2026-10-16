// @vitest-environment jsdom
/**
 * SAN-1416 — Details for a rental open in the page instead of leaving for the advertiser.
 *
 * The fixtures are the nine approved external ads, built through the real
 * `publicExternalRentalCard`, so these tests prove the journey on the data contract that ships
 * rather than on hand-written cards: COP/month, the photo list, unknown bedrooms, two ads with
 * no coordinates, and no viewing action for any of them.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/maps/MapProvider", () => ({
  MapsShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// The stub reads the same map context the real map reads, so pin count and selection are real.
vi.mock("@/components/maps/ChatMap", async () => {
  const { useMapContext } = await import("@/platform/maps/map-context");
  return {
    ChatMap: ({ mapDomId }: { mapDomId?: string }) => {
      const { pins, selectedPinId } = useMapContext();
      return (
        <div
          data-testid="chat-map-stub"
          data-map-id={mapDomId}
          data-pin-count={pins.length}
          data-selected={selectedPinId ?? ""}
        />
      );
    },
  };
});
vi.mock("@/components/modals/schedule-viewing-modal", () => ({ ScheduleViewingModal: () => null }));

import { RentalBrowseView } from "@/components/rentals/rental-browse-view";
import { RentalDetailsPanel } from "@/components/rentals/rental-details-panel";
import { PUBLIC_SOURCE_SLUGS, publicExternalRentalCard } from "@/lib/rentals/public-external-discovery";
import type { Rental } from "@/mastra/tools/search-rentals";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STORAGE = "https://zkwcbyxiwklihegjhuql.supabase.co";
const MAPPED = 7; // slugs 0..6 have a rooftop-grade location; 7 and 8 do not
const UNMAPPED_SLUG = PUBLIC_SOURCE_SLUGS[7];
const MAPPED_SLUG = PUBLIC_SOURCE_SLUGS[0];

function photo(slug: string, n: number) {
  return `${STORAGE}/storage/v1/object/public/listing-photos/external-discovery/fincaraiz/${slug}/photo-0${n}.webp`;
}

function approvedAd(slug: string, index: number): Rental {
  const mapped = index < MAPPED;
  const card = publicExternalRentalCard({
    landlord_id: "a4da05ae-347e-4250-8ae0-83812ccc7703",
    verified: false,
    status: "inactive",
    listing_workflow_status: "draft",
    moderation_status: "pending",
    slug,
    title: `Furnished apartment ${index + 1}`,
    neighborhood: index % 2 ? "Laureles" : "Conquistadores",
    source_url: `https://www.fincaraiz.com.co/apartamento-en-arriendo/${slug}`,
    price_monthly: 2_100_000 + index * 100_000,
    currency: "COP",
    bedrooms: index % 3 === 0 ? null : 2, // every third ad does not state its bedrooms
    amenities: index === 5 ? [] : ["workspace", "wifi"],
    latitude: mapped ? 6.24 + index / 1000 : null,
    longitude: mapped ? -75.58 : null,
    available_from: "2026-10-14",
    available_to: null,
    images: [1, 2, 3, 4].map((n) => photo(slug, n)),
    metadata: {
      inventory_kind: "external_candidate",
      allowed_action: "view_original_listing",
      external_discovery_publication: "user_authorized_2026-10-14",
      public_photo_republication_permission: "user_attested_2026-10-14",
      map_geocoding: { provider: "google_geocoding_api", location_type: "ROOFTOP" },
    },
  });
  if (!card) throw new Error(`fixture for ${slug} was refused by the approved-ad contract`);
  return card;
}

// Built in beforeEach: the approved-photo check reads NEXT_PUBLIC_SUPABASE_URL when the card is made.
let NINE: Rental[] = [];

let container: HTMLDivElement;
let root: Root;
let isLg = true;
let previousEnv: string | undefined;

function viewProps(results: Rental[] = NINE) {
  return { results, total: results.length, error: null, neighborhood: null, beds: null };
}

async function mount(results: Rental[] = NINE) {
  act(() => {
    root.render(<RentalBrowseView {...viewProps(results)} />);
  });
}

const byId = (id: string) => container.ownerDocument.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const q = (selector: string) => container.ownerDocument.querySelector<HTMLElement>(selector);
const click = async (el: HTMLElement | null) => {
  if (!el) throw new Error("element to click was not found");
  act(() => {
    el.click();
  });
};
const detailsButton = (slug: string) => byId(`rental-details-cta-${slug}`) as HTMLButtonElement;

beforeEach(() => {
  previousEnv = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = STORAGE;
  NINE = PUBLIC_SOURCE_SLUGS.map(approvedAd);
  isLg = true;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width: 1024px") ? isLg : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  // jsdom lacks these browser APIs: card auto-scroll (use-browse-card-scroll) and the carousel need them.
  Element.prototype.scrollIntoView = vi.fn();
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

afterEach(async () => {
  act(() => {
    root.unmount();
  });
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  if (previousEnv === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = previousEnv;
});

describe("/rentals Details panel — desktop", () => {
  it("fixtures are the nine approved ads: seven mapped, two not, four approved photos each", () => {
    expect(NINE).toHaveLength(9);
    expect(NINE.filter((r) => r.latitude != null)).toHaveLength(MAPPED);
    expect(NINE.every((r) => r.can_schedule_viewing === false)).toBe(true);
    expect(NINE.every((r) => r.images?.length === 4)).toBe(true);
  });

  it("opens Details for each of the nine ads in the page, never on the advertiser's site", async () => {
    await mount();
    for (const rental of NINE) {
      await click(detailsButton(rental.id));
      const panel = byId("rental-details-panel");
      expect(panel, `panel for ${rental.id}`).not.toBeNull();
      expect(panel?.querySelector("h2")?.textContent).toBe(rental.title);
      // COP per month, in the listing's own currency — never a USD or nightly figure.
      expect(byId("rental-details-price")?.textContent).toBe(
        `COP ${rental.price_monthly?.toLocaleString("en-US")}/mo`,
      );
      expect(panel?.textContent).not.toMatch(/\$|\/night/);
      // Four approved photos, each from the approved listing folder.
      const photos = panel?.querySelectorAll<HTMLImageElement>("img") ?? [];
      expect(photos).toHaveLength(4);
      for (const img of photos) expect(img.src).toContain(`/external-discovery/fincaraiz/${rental.id}/`);
      await click(byId("rental-details-close"));
      expect(byId("rental-details-panel")).toBeNull();
    }
  });

  it("title, photo and the Details button all open the same Details; none is a link out", async () => {
    await mount();
    const title = byId(`rental-card-link-${MAPPED_SLUG}`) as HTMLElement;
    expect(title.tagName).toBe("BUTTON"); // not an <a> to the advertiser
    expect(byId(`rental-card-photo-details-${MAPPED_SLUG}`)?.tagName).toBe("BUTTON");
    for (const trigger of [title, byId(`rental-card-photo-details-${MAPPED_SLUG}`), detailsButton(MAPPED_SLUG)]) {
      await click(trigger);
      expect(byId("rental-details-panel")?.querySelector("h2")?.textContent).toBe(NINE[0].title);
      await click(byId("rental-details-close"));
    }
    // The only way out is the labelled secondary link, which still exists on the card.
    const source = byId(`rental-card-source-${MAPPED_SLUG}`) as HTMLAnchorElement;
    expect(source.textContent).toContain("View original listing");
    expect(source.href).toContain("fincaraiz.com.co");
  });

  it("keeps unknown values unknown and follows the database flag for an external ad", async () => {
    await mount();
    await click(detailsButton(MAPPED_SLUG)); // index 0: bedrooms not stated
    expect(byId("rental-details-bedrooms")?.textContent).toBe("Bedrooms unknown");
    expect(byId("rental-details-bedrooms")?.textContent).not.toMatch(/studio/i);
    expect(byId("rental-details-external-note")?.textContent).toMatch(/not a confirmed viewing/);
    // The database says this ad is not requestable, so there is no CTA: the flag decides, not `external`.
    expect(byId("rental-details-schedule-cta")).toBeNull();
    expect(byId("rental-details-availability")?.textContent).toMatch(/unverified/i);
    expect(q('[data-testid="rental-details-panel"] a[href*="fincaraiz.com.co"]')?.textContent).toContain(
      "View original listing",
    );
    // A stated bedroom count is shown as stated.
    await click(byId("rental-details-close"));
    await click(detailsButton(PUBLIC_SOURCE_SLUGS[1]));
    expect(byId("rental-details-bedrooms")?.textContent).toBe("2 BR");
  });

  it("an ad with no amenities says so instead of showing an empty list", async () => {
    await mount();
    await click(detailsButton(PUBLIC_SOURCE_SLUGS[5]));
    expect(byId("rental-details-amenities")).toBeNull();
    expect(byId("rental-details-panel")?.textContent).toContain("Amenities not listed.");
  });

  it("the two unmapped ads open Details without gaining a pin or a map link", async () => {
    await mount();
    const map = () => byId("chat-map-stub") as HTMLElement;
    expect(map().dataset.pinCount).toBe(String(MAPPED));
    await click(detailsButton(UNMAPPED_SLUG));
    expect(byId("rental-details-panel")).not.toBeNull();
    expect(byId("rental-details-no-location")).not.toBeNull();
    expect(byId("rental-details-map-link")).toBeNull();
    expect(map().dataset.pinCount).toBe(String(MAPPED)); // still seven: nothing invented
    expect(map().dataset.selected).toBe(""); // and nothing selected
  });

  it("a mapped ad selects its own pin and links to its real coordinates", async () => {
    await mount();
    await click(detailsButton(MAPPED_SLUG));
    expect((byId("chat-map-stub") as HTMLElement).dataset.selected).toBe(`rental-${MAPPED_SLUG}`);
    const link = byId("rental-details-map-link") as HTMLAnchorElement;
    expect(link.href).toContain(`query=${NINE[0].latitude},${NINE[0].longitude}`);
  });

  it("Close restores the same search: same map element, same cards, same filters", async () => {
    await mount();
    const mapBefore = byId("chat-map-stub");
    const cardsBefore = container.querySelectorAll('[data-testid^="rental-card-"][data-result-kind="rental"]').length;
    const filters = byId("rentals-browse")?.querySelectorAll("a[aria-pressed]").length;
    await click(detailsButton(MAPPED_SLUG));
    expect(byId("browse-map-panel")?.querySelector("[inert]")).not.toBeNull(); // map is inert under the panel
    expect(byId("browse-map-panel")?.className).toMatch(/\bz-20\b/); // above the sticky filter header
    await click(byId("rental-details-close"));
    expect(byId("rental-details-panel")).toBeNull();
    expect(byId("chat-map-stub")).toBe(mapBefore); // never unmounted, so camera and pins survive
    expect(byId("browse-map-panel")?.querySelector("[inert]")).toBeNull();
    expect(byId("browse-map-panel")?.className).not.toMatch(/\bz-20\b/); // restaurants/map-only layout unchanged
    expect(container.querySelectorAll('[data-testid^="rental-card-"][data-result-kind="rental"]').length).toBe(cardsBefore);
    expect(cardsBefore).toBe(9);
    expect(byId("rentals-browse")?.querySelectorAll("a[aria-pressed]").length).toBe(filters);
  });

  it("Escape closes the panel and returns focus to the Details button that opened it", async () => {
    await mount();
    const trigger = detailsButton(MAPPED_SLUG);
    trigger.focus();
    await click(trigger);
    expect(document.activeElement).toBe(byId("rental-details-close")); // focus moves into the panel
    act(() => {
      byId("rental-details-panel")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(byId("rental-details-panel")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("moves focus without scrolling the page, on open and on close", async () => {
    await mount();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    const trigger = detailsButton(MAPPED_SLUG);
    trigger.focus();
    focus.mockClear();
    await click(trigger);
    await click(byId("rental-details-close"));
    const panelFocusCalls = focus.mock.calls;
    expect(panelFocusCalls.length).toBeGreaterThanOrEqual(2); // into the panel, then back to the opener
    for (const args of panelFocusCalls) expect(args[0]).toEqual({ preventScroll: true });
    focus.mockRestore();
  });

  it("closes itself when a new search no longer contains the open rental", async () => {
    await mount();
    await click(detailsButton(MAPPED_SLUG));
    expect(byId("rental-details-panel")).not.toBeNull();
    await mount(NINE.slice(1)); // the open ad is gone from the results
    expect(byId("rental-details-panel")).toBeNull();
    expect(container.querySelectorAll('[data-testid^="rental-card-"][data-result-kind="rental"]').length).toBe(8);
  });

  it("switches directly from one rental to another without stacking panels", async () => {
    await mount();
    await click(detailsButton(PUBLIC_SOURCE_SLUGS[1]));
    await click(detailsButton(PUBLIC_SOURCE_SLUGS[2]));
    expect(container.ownerDocument.querySelectorAll('[data-testid="rental-details-panel"]')).toHaveLength(1);
    expect(byId("rental-details-panel")?.querySelector("h2")?.textContent).toBe(NINE[2].title);
  });
});

describe("/rentals Details sheet — phone width (390px)", () => {
  beforeEach(() => {
    isLg = false;
  });

  it("opens a sheet instead of the desktop panel, with a 44px Close, and Close dismisses it", async () => {
    await mount();
    await click(detailsButton(MAPPED_SLUG));
    expect(byId("rental-details-panel")).toBeNull();
    const sheet = byId("rental-details-sheet");
    expect(sheet).not.toBeNull();
    expect(sheet?.textContent).toContain(NINE[0].title);
    expect(sheet?.textContent).toContain(`COP ${NINE[0].price_monthly?.toLocaleString("en-US")}/mo`);
    expect(sheet?.querySelectorAll("img")).toHaveLength(4); // reachable by swipe or the arrows
    const close = byId("rental-details-close") as HTMLButtonElement;
    expect(close.className).toMatch(/\bsize-11\b/); // 44px; jsdom has no layout to measure
    expect(sheet?.querySelector('[data-testid="rental-details-schedule-cta"]')).toBeNull();
    await click(close);
    expect(byId("rental-details-sheet")).toBeNull();
    expect(container.querySelectorAll('[data-testid^="rental-card-"][data-result-kind="rental"]')).toHaveLength(9);
  });
});

describe("RentalDetailsPanel — trust label", () => {
  const noop = () => undefined;
  const render = (rental: Rental) =>
    act(() => {
      root.render(
        <div className="relative">
          <RentalDetailsPanel rental={rental} onClose={noop} />
        </div>,
      );
    });

  it("shows 'Not independently verified' for a self-attested listing, as the card does", async () => {
    await render({ ...NINE[1], tags: [...NINE[1].tags, "self-attested"] });
    expect(byId("rental-details-self-attested-label")?.textContent).toBe("Not independently verified");
  });

  it("does not show it for a listing that is not self-attested", async () => {
    await render(NINE[1]);
    expect(byId("rental-details-self-attested-label")).toBeNull();
  });
});

describe("RentalDetailsPanel — states", () => {
  const noop = () => undefined;
  const baseRentalOf = () => NINE[1];

  async function renderPanel(rental: Rental, onSchedule?: () => void) {
    act(() => {
      root.render(
        <div className="relative">
          <RentalDetailsPanel rental={rental} onClose={noop} onSchedule={onSchedule} />
        </div>,
      );
    });
  }

  it("shows a placeholder, not a broken image, when there are no photos", async () => {
    await renderPanel({ ...baseRentalOf(), image: "", images: [] });
    expect(byId("rental-details-no-photos")).not.toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("falls back to the single card photo when no photo list is present", async () => {
    const { images: _omit, ...legacy } = baseRentalOf();
    void _omit;
    await renderPanel({ ...legacy, image: photo(baseRentalOf().id, 1) });
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("a failed photo shows 'Photo unavailable' rather than a broken image", async () => {
    await renderPanel(baseRentalOf());
    const first = byId("rental-details-photo-1") as HTMLImageElement;
    act(() => {
      first.dispatchEvent(new Event("error"));
    });
    expect(byId("rental-details-photo-1-unavailable")?.textContent).toContain("Photo unavailable");
  });

  it("offers one CTA decided by the database flag, labeled a follow-up for an external ad", async () => {
    const onSchedule = vi.fn();
    const owned: Rental = {
      ...baseRentalOf(),
      tags: [], // not an external ad
      can_schedule_viewing: true,
      nightly_price: 80,
      price_monthly: undefined,
      currency: "USD",
    };
    await renderPanel(owned, onSchedule);
    await click(byId("rental-details-schedule-cta"));
    expect(onSchedule).toHaveBeenCalledTimes(1);
    expect(byId("rental-details-price")?.textContent).toBe("~$2,400/mo"); // 80/night × 30, marked as an estimate

    await renderPanel({ ...owned, can_schedule_viewing: false }, onSchedule);
    expect(byId("rental-details-schedule-cta")).toBeNull();
    await renderPanel({ ...baseRentalOf(), can_schedule_viewing: true }, onSchedule); // external, DB-requestable
    expect(byId("rental-details-external-note")).not.toBeNull();
    expect(byId("rental-details-schedule-cta")?.textContent).toContain("Request MDE follow-up");
    expect(byId("rental-details-schedule-cta")?.textContent).not.toContain("Schedule viewing");
  });

  it("states a missing price as not provided instead of showing zero", async () => {
    await renderPanel({ ...baseRentalOf(), price_monthly: undefined });
    expect(byId("rental-details-price")?.textContent).toBe("Price not provided");
  });
});
