// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { CONCIERGE_LABELS } from "@/components/chat/chat-center-panel";
import { RENTAL_EXAMPLE_QUERY, rentalFailureRecovery } from "@/lib/rental-failure-recovery";
import { buildRentalSearchParams } from "@/lib/rental-query-parser";

describe("the rental example renters are shown", () => {
  it("is in pesos per month and the search understands it as a monthly COP cap", () => {
    expect(buildRentalSearchParams(RENTAL_EXAMPLE_QUERY, {})).toMatchObject({
      neighborhood: "Laureles",
      minBedrooms: 1,
      stayType: "monthly",
      maxPriceMonthly: 3_000_000,
      budgetCurrency: "COP",
    });
  });

  it("is what the chat welcome offers, with no nightly-dollar wording", () => {
    expect(CONCIERGE_LABELS.welcomeMessageText).toContain(RENTAL_EXAMPLE_QUERY);
    expect(CONCIERGE_LABELS.welcomeMessageText).not.toMatch(/\$|night/i);
  });

  it("is what the slow-search message suggests, with no nightly-dollar wording", () => {
    const message = rentalFailureRecovery("gemini_timeout").userMessage;
    expect(message).toContain(RENTAL_EXAMPLE_QUERY);
    expect(message).not.toMatch(/\$|night/i);
  });
});
