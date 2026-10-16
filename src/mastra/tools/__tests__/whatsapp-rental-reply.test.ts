import { describe, expect, it } from "vitest";
import {
  detailLine,
  formatMonthlyPrice,
  formatWhatsAppRentalReply,
  isConfirmedBudgetMatch,
  isFurnished,
  isSelfAttested,
  safeListingUrl,
  type WhatsAppRentalItem,
} from "../whatsapp-rental-reply";
import { isWhatsAppRun } from "../search-rentals";

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

const budget = { amount: 3_500_000, currency: "COP" };

describe("formatMonthlyPrice", () => {
  it("shows the original amount exactly, never a rounded claim", () => {
    expect(formatMonthlyPrice(2_900_000, "COP")).toBe("COP 2,900,000");
    expect(formatMonthlyPrice(2_950_000, "COP")).toBe("COP 2,950,000");
  });
});

describe("safeListingUrl", () => {
  it("only allows absolute http(s) links with a hostname", () => {
    expect(safeListingUrl("https://www.mdeai.co/rentals/x")).toBe("https://www.mdeai.co/rentals/x");
    expect(safeListingUrl("https://?q=1")).toBeNull();
    expect(safeListingUrl("/rentals/x")).toBeNull();
    expect(safeListingUrl("javascript:alert(1)")).toBeNull();
    expect(safeListingUrl(null)).toBeNull();
  });
});

describe("isFurnished", () => {
  it("does not call an unfurnished listing furnished", () => {
    expect(isFurnished(item({ amenities: [], tags: ["Unfurnished"] }))).toBe(false);
    expect(isFurnished(item({ amenities: [], tags: ["sin amoblar"] }))).toBe(false);
  });
  it("detects furnished and amoblado", () => {
    expect(isFurnished(item({ amenities: ["Furnished"], tags: [] }))).toBe(true);
    expect(isFurnished(item({ amenities: [], tags: ["Amoblado"] }))).toBe(true);
  });
});

describe("detailLine", () => {
  it("keeps the unknown-bedroom warning alongside the neighborhood signal", () => {
    const line = detailLine(item({ bedrooms: 0, neighborhood: "Laureles" }));
    expect(line).toContain("bedrooms not confirmed");
    expect(line).not.toContain("0 bedrooms");
  });
  it("labels self-attested listings as owner-provided", () => {
    expect(isSelfAttested(item({ tags: ["self-attested"] }))).toBe(true);
    expect(detailLine(item({ tags: ["self-attested"] }))).toContain("owner-provided details");
  });
});

describe("isConfirmedBudgetMatch", () => {
  it("includes same-currency inside the budget and excludes above it", () => {
    expect(isConfirmedBudgetMatch(item(), budget)).toBe(true);
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
  it("lists real titles, exact COP prices, bedrooms, amenities and a working link", () => {
    const reply = formatWhatsAppRentalReply([item()], budget);
    expect(reply).toContain("Apartamento Laureles");
    expect(reply).toContain("COP 2,900,000/month");
    expect(reply).toContain("2 bedrooms");
    expect(reply).toContain("furnished");
    expect(reply).toContain("Wi-Fi");
    expect(reply).toContain("https://www.mdeai.co/rentals/apartamento-laureles");
  });

  it("keeps one total limit across confirmed and other-currency listings", () => {
    const reply = formatWhatsAppRentalReply(
      [
        item({ title: "COP one" }),
        item({ title: "COP two" }),
        item({ title: "USD one", currency: "USD", price_monthly: 1500 }),
        item({ title: "USD two", currency: "USD", price_monthly: 1600 }),
      ],
      budget,
    );
    const listed = ["COP one", "COP two", "USD one", "USD two"].filter((t) => reply.includes(t));
    expect(listed).toHaveLength(3);
  });

  it("separates other-currency listings and never calls them under budget", () => {
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

describe("isWhatsAppRun", () => {
  const ctx = (platform: string) => ({
    requestContext: {
      get: (key: string) =>
        key === "channel" || key === "__mastra_chat_channel_render" ? { platform } : undefined,
    },
  });

  it("detects WhatsApp through the tool's requestContext argument", () => {
    expect(isWhatsAppRun(ctx("whatsapp"))).toBe(true);
  });

  it("detects WhatsApp when the context is the RequestContext itself", () => {
    expect(isWhatsAppRun({ get: () => ({ platform: "whatsapp" }) })).toBe(true);
  });

  it("does not claim WhatsApp for another platform or no context", () => {
    expect(isWhatsAppRun(ctx("slack"))).toBe(false);
    expect(isWhatsAppRun(undefined)).toBe(false);
  });
});
