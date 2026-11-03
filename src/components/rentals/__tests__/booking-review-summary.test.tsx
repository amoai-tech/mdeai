// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RentalDetail } from "@/lib/rentals/get-rental-detail";
import { BookingReviewSummary } from "../booking-review-summary";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type SummaryDetail = Pick<
  RentalDetail,
  "id" | "title" | "neighborhood" | "priceNightly" | "priceMonthly" | "currency" | "deposit" | "images" | "minimumStayDays" | "houseRules"
>;

const listing = (overrides: Partial<SummaryDetail> = {}): RentalDetail =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    title: "Laureles 2BR",
    neighborhood: "Laureles",
    priceNightly: null,
    priceMonthly: 1900000,
    currency: "COP",
    deposit: null,
    images: [],
    minimumStayDays: 30,
    houseRules: null,
    ...overrides,
  }) as unknown as RentalDetail;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function renderSummary(detail: RentalDetail | null, detailUnavailable = false): HTMLElement {
  act(() => {
    root.render(
      <BookingReviewSummary
        detail={detail}
        fallbackTitle="Stored listing title"
        startDate="2026-12-01"
        endDate={null}
        detailUnavailable={detailUnavailable}
      />,
    );
  });
  return container;
}

/**
 * These pin the two facts a renter compares across screens: the minimum-stay unit must match
 * the listing's availability copy, and a price the advertiser never wrote must never be
 * presented as their listed price.
 */
describe("BookingReviewSummary", () => {
  it("renders the minimum stay in nights, matching the listing availability copy", () => {
    const text = renderSummary(listing({ minimumStayDays: 30 })).textContent ?? "";
    expect(text).toContain("30 nights");
    expect(text).not.toContain("30 days");
  });

  it("singularises a one-night minimum stay", () => {
    const text = renderSummary(listing({ minimumStayDays: 1 })).textContent ?? "";
    expect(text).toContain("1 night");
    expect(text).not.toContain("1 nights");
  });

  it("leads with a stored nightly rate instead of the derived monthly estimate", () => {
    const text = renderSummary(listing({ priceNightly: 80, priceMonthly: null, currency: "USD" })).textContent ?? "";
    expect(text).toContain("$80/night");
    expect(text).not.toContain("~$2,400");
    expect(text).toContain("nightly rate above is the advertiser");
  });

  it("keeps a stored monthly rent as the lead price", () => {
    const text = renderSummary(listing({ priceMonthly: 1900000, currency: "COP" })).textContent ?? "";
    expect(text).toContain("COP 1,900,000/mo");
    expect(text).toContain("listed monthly price");
  });

  it("does not claim the price is unpublished when the listing itself is no longer visible", () => {
    const text = renderSummary(null, false).textContent ?? "";
    expect(text).toContain("listing no longer visible");
    expect(text).toContain("can’t be confirmed");
    expect(text).not.toContain("No price is published");
    expect(text).not.toContain("Price not stated");
  });

  it("still reports an unpublished price on a readable listing", () => {
    const text = renderSummary(listing({ priceNightly: null, priceMonthly: null })).textContent ?? "";
    expect(text).toContain("Price not stated");
    expect(text).toContain("No price is published");
    expect(text).not.toContain("no longer visible");
  });

  it("says the price is unavailable during an outage instead of claiming none is published", () => {
    const text = renderSummary(null, true).textContent ?? "";
    expect(text).toContain("Price unavailable right now");
    expect(text).not.toContain("Price not stated");
    expect(text).not.toContain("No price is published");
    expect(text).toContain("Nothing has been charged");
  });
});
