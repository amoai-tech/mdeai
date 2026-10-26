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

describe("RentalBrowseCard — SAN-1349 viewing CTA truthfulness", () => {
  it("treats inherited object keys as ordinary amenity text, not object properties", () => {
    const html = renderCard({ amenities: ["constructor"] });
    expect(html).toContain("Constructor");
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
