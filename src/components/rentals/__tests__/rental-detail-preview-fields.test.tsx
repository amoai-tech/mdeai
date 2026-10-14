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
