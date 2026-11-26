// @vitest-environment jsdom
/**
 * Post-merge follow-up for the SAN-1431 development preview detail page.
 *
 * The browse card already says "Bedrooms unknown" for a source advert with no bedroom count,
 * but the detail page still rendered "Data pending" in the beds badge and offered no way to
 * reach the advertiser's own listing. These tests pin the two behaviours so they cannot drift
 * back, and confirm a normal MDE listing is unaffected.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";

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

const row = {
  id: "d1000000-0000-4000-a000-000000000003",
  title: "External candidate",
  neighborhood: "Conquistadores",
  bedrooms: null as number | null,
  price_monthly: 2_100_000,
  currency: "COP",
  status: "inactive",
  moderation_status: "pending",
  listing_workflow_status: "draft",
  landlord_id: "landlord-1",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(detail: RentalDetail) {
  await act(async () => {
    root.render(<RentalDetailView detail={detail} />);
  });
  await act(() => Promise.resolve());
}

const preview = (overrides: Partial<RentalDetail> = {}): RentalDetail => ({
  ...mapApartmentRowToDetail(row),
  status: "development-preview",
  sourceUrl: "https://www.fincaraiz.com.co/apartaestudio/193916988",
  ...overrides,
});

describe("rental detail — external preview fields", () => {
  it("keeps Contact Host accessible on a development-preview MDE-managed listing", async () => {
    await render(preview({ isExternalSource: false, isNotIndependentlyVerified: false }));
    expect(document.querySelector('[data-testid="rental-contact-host-cta"]')).not.toBeNull();
  });


  it("says 'Bedrooms unknown' for an unknown count instead of a false Studio", async () => {
    await render(preview());
    const specs = document.querySelector('[data-testid="rental-detail-specs"]');
    expect(specs?.textContent).toContain("Bedrooms unknown");
    expect(specs?.textContent).not.toContain("Studio");
  });

  it("links to the advertiser's own listing for a development preview", async () => {
    await render(preview());
    const link = document.querySelector('[data-testid="rental-detail-source-link"]');
    expect(link?.getAttribute("href")).toBe("https://www.fincaraiz.com.co/apartaestudio/193916988");
    expect(link?.getAttribute("rel")).toContain("nofollow");
  });

  it("shows the real destination and requires confirmation before opening an external source", async () => {
    // SAN-1612: an outbound link is only offered for an approved advertiser host, the same rule
    // the browse card and the map panel use. An unapproved host shows no link at all (next test).
    await render(preview({ sourceUrl: "https://www.rentberry.com/listing/42" }));
    const link = document.querySelector<HTMLAnchorElement>('[data-testid="rental-detail-source-link"]');
    expect(link?.getAttribute("href")).toBe("https://www.rentberry.com/listing/42");
    expect(link?.textContent).toContain("rentberry.com");
    expect(link?.getAttribute("rel")).toContain("noopener");
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => { link?.dispatchEvent(click); });
    expect(confirmation).toHaveBeenCalledWith(expect.stringContaining("rentberry.com"));
    expect(click.defaultPrevented).toBe(true);
    confirmation.mockRestore();
  });

  it("offers no outbound link for a host outside the approved advertiser allowlist", async () => {
    await render(preview({ sourceUrl: "https://newsource.example/listing/42" }));
    expect(document.querySelector('[data-testid="rental-detail-source-link"]')).toBeNull();
  });

  it.each([
    "http://external.example/listing",
    "https://attacker@newsource.example/listing",
    "https://user:pass@newsource.example/listing",
    "https://mdeai.co/rentals/1",
    "https://www.mdeai.co/rentals/1",
    "javascript:alert(1)",
    "not-a-url",
  ])("rejects malformed or misleading original listing URL %s", async (sourceUrl) => {
    await render(preview({ sourceUrl }));
    expect(document.querySelector('[data-testid="rental-detail-source-link"]')).toBeNull();
  });

  it("links to the original advertisement on an active, attributed external listing", async () => {
    const external = mapApartmentRowToDetail({
      ...row, status: "active", source_url: "https://www.fincaraiz.com.co/apartaestudio/193916988",
      metadata: { source_record_type: "third_party_advertisement" },
      rental_can_request_viewing: true,
    });
    await render(external);
    expect(external.isExternalSource).toBe(true);
    expect(document.querySelector('[data-testid="rental-detail-source-link"]')?.getAttribute("href"))
      .toBe("https://www.fincaraiz.com.co/apartaestudio/193916988");
    // Native booking review belongs to MDE-managed rentals, not third-party advertisements.
    expect(document.querySelector('[data-testid="rental-detail-booking-review-link"]')).toBeNull();
  });

  it("does not offer a fake AI question or inert Save action", async () => {
    const managed = mapApartmentRowToDetail({
      ...row,
      status: "active",
      available_from: "2026-10-01",
      rental_can_request_viewing: true,
    });
    await render(managed);
    expect(managed.isExternalSource).toBe(false);
    expect(document.querySelector('[data-testid="rental-detail-booking-review-link"]')).not.toBeNull();
    const labels = Array.from(document.querySelectorAll("button")).map((button) => button.textContent ?? "");
    expect(labels.some((label) => /ask a question/i.test(label))).toBe(false);
    expect(labels.some((label) => /^\s*save\s*$/i.test(label))).toBe(false);
    expect(labels.some((label) => /request viewing/i.test(label))).toBe(true);
  });

  it("reserves device safe-area space under the fixed mobile action", async () => {
    await render(preview());
    const bar = document.querySelector('[data-testid="rental-detail-mobile-cta"]');
    expect(bar).not.toBeNull();
    // SAN-1606: the action moved above the phone tab bar, so the shared clearance token — which
    // folds in the home-indicator inset — owns the bottom geometry instead of a per-bar padding.
    expect(bar?.className).toContain("bottom-[var(--mde-mobile-nav-clearance)]");
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("env(safe-area-inset-bottom");
    expect(css).toMatch(/--mde-mobile-nav-clearance:[\s\S]*?--mde-mobile-nav-inset/);
  });

  it("keeps a real bedroom count", async () => {
    await render(preview({ bedrooms: 2 }));
    expect(document.querySelector('[data-testid="rental-detail-specs"]')?.textContent).toContain("2 beds");
  });

  it("does not offer a source link on a normal MDE listing", async () => {
    const owned = mapApartmentRowToDetail({ ...row, source_url: "https://mdeai.co/rentals/owned" });
    await render({ ...owned, status: "active" });
    expect(document.querySelector('[data-testid="rental-detail-source-link"]')).toBeNull();
  });
});
