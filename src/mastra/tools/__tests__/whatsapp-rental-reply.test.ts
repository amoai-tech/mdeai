import { describe, expect, it } from "vitest";
import {
  formatMonthlyPrice,
  formatWhatsAppRentalReply,
  isConfirmedBudgetMatch,
  safeListingUrl,
  type WhatsAppRentalItem,
} from "../whatsapp-rental-reply";

const item = (over: Partial<WhatsAppRentalItem> = {}): WhatsAppRentalItem => ({
  title: "Apartamento Laureles",
  neighborhood: "Laureles",
  price_monthly: 2_900_000,
  currency: "COP",
  bedrooms: 2,
  amenities: ["Wi-Fi", "Furnished", "Parking"],
  tags: [],
  source_url: "https://www.mdeai.co/rentals/apartamento-laureles",
  can_schedule_viewing: false,
  schedule_viewing_url: null,
  ...over,
});

describe("formatMonthlyPrice", () => {
  it("renders COP millions the way a local reads them", () => {
    expect(formatMonthlyPrice(2_900_000, "COP")).toBe("COP 2.9M");
    expect(formatMonthlyPrice(3_000_000, "COP")).toBe("COP 3M");
  });
});

describe("safeListingUrl", () => {
  it("only allows absolute http(s) links", () => {
    expect(safeListingUrl("https://www.mdeai.co/rentals/x")).toBe("https://www.mdeai.co/rentals/x");
    expect(safeListingUrl("/rentals/x")).toBeNull();
    expect(safeListingUrl("javascript:alert(1)")).toBeNull();
    expect(safeListingUrl(null)).toBeNull();
  });
});

describe("isConfirmedBudgetMatch", () => {
  const budget = { amount: 3_500_000, currency: "COP" };
  it("includes a same-currency listing inside the budget", () => {
    expect(isConfirmedBudgetMatch(item(), budget)).toBe(true);
  });
  it("excludes a same-currency listing above the budget", () => {
    expect(isConfirmedBudgetMatch(item({ price_monthly: 4_000_000 }), budget)).toBe(false);
  });
  it("never treats an unknown monthly price as a confirmed match", () => {
    expect(isConfirmedBudgetMatch(item({ price_monthly: undefined }), budget)).toBe(false);
  });
  it("never compares another currency to the budget", () => {
    expect(isConfirmedBudgetMatch(item({ currency: "USD", price_monthly: 2000 }), budget)).toBe(false);
  });
});

describe("formatWhatsAppRentalReply", () => {
  const budget = { amount: 3_500_000, currency: "COP" };

  it("lists real titles, prices, bedrooms, amenities and a working link", () => {
    const reply = formatWhatsAppRentalReply([item()], budget);
    expect(reply).toContain("Apartamento Laureles");
    expect(reply).toContain("COP 2.9M/month");
    expect(reply).toContain("2 bedrooms");
    expect(reply).toContain("furnished");
    expect(reply).toContain("Wi-Fi");
    expect(reply).toContain("https://www.mdeai.co/rentals/apartamento-laureles");
  });

  it("caps the answer at three listings", () => {
    const many = [item({ title: "A" }), item({ title: "B" }), item({ title: "C" }), item({ title: "D" })];
    const reply = formatWhatsAppRentalReply(many, budget);
    expect(reply).toContain("A");
    expect(reply).not.toContain("D");
  });

  it("separates other-currency listings from confirmed budget matches", () => {
    const reply = formatWhatsAppRentalReply(
      [item(), item({ title: "USD loft", currency: "USD", price_monthly: 1500 })],
      budget,
    );
    expect(reply).toContain("not compared to your budget");
    expect(reply).toContain("USD loft");
  });

  it("says so plainly when nothing matches", () => {
    const reply = formatWhatsAppRentalReply([item({ price_monthly: 4_000_000 })], budget);
    expect(reply).toContain("could not find");
  });

  it("never offers an unauthorized viewing action", () => {
    const reply = formatWhatsAppRentalReply(
      [item({ can_schedule_viewing: false, schedule_viewing_url: "https://www.mdeai.co/rentals/x" })],
      budget,
    );
    expect(reply).not.toContain("Request a viewing");
  });

  it("offers the viewing link only when the listing is requestable", () => {
    const reply = formatWhatsAppRentalReply(
      [item({ can_schedule_viewing: true, schedule_viewing_url: "https://www.mdeai.co/rentals/x" })],
      budget,
    );
    expect(reply).toContain("Request a viewing: https://www.mdeai.co/rentals/x");
  });

  it("omits a listing link that is not a real absolute URL", () => {
    const reply = formatWhatsAppRentalReply([item({ source_url: "/rentals/broken" })], budget);
    expect(reply).not.toContain("/rentals/broken");
  });

  it("omits an unknown price instead of inventing one", () => {
    const reply = formatWhatsAppRentalReply(
      [item({ price_monthly: undefined, currency: "USD", tags: [] })],
      budget,
    );
    expect(reply).toContain("price on request");
    expect(reply).not.toContain("COP 0");
  });
});
