import { describe, expect, it } from "vitest";
import {
  heroRentalIntent,
  parseRentalIntentFromText,
  rentalIntentToSearchParams,
} from "@/lib/rental-intent-schema";
import { buildRentalSearchParams } from "@/lib/rental-query-parser";

describe("GEM-RE-002 · RentalIntentSchema", () => {
  it("hero prompt normalizes to same slots via parser and schema", () => {
    const intent = heroRentalIntent();
    const params = buildRentalSearchParams("1BR in Laureles under $80/night", {});
    expect(intent.neighborhood).toBe("Laureles");
    expect(intent.minBedrooms).toBe(1);
    expect(intent.maxPricePerNight).toBe(80);
    expect(intent.stayType).toBe("nightly");
    expect(params?.neighborhood).toBe(intent.neighborhood);
    expect(params?.minBedrooms).toBe(intent.minBedrooms);
    expect(params?.maxPricePerNight).toBe(intent.maxPricePerNight);
  });

  it("round-trips intent → search params", () => {
    const intent = parseRentalIntentFromText("2BR provenza under $120/night", {});
    expect(intent?.action).toBe("search_now");
    if (!intent) throw new Error("expected a parsed intent");
    const api = rentalIntentToSearchParams(intent);
    expect(api.neighborhood).toBe("El Poblado");
    expect(api.minBedrooms).toBe(2);
    expect(api.maxPricePerNight).toBe(120);
  });

  it("preserves an exact COP monthly cap through the existing search contract", () => {
    const text = "Find 2 bedroom apartments in Laureles under COP 3000000 per month";
    const intent = parseRentalIntentFromText(text, {});
    expect(intent?.action).toBe("search_now");
    if (!intent) throw new Error("expected monthly rental intent");
    const api = rentalIntentToSearchParams(intent);
    expect(api.maxPriceMonthly).toBe(3_000_000);
    expect(api.budgetCurrency).toBe("COP");
    expect(api.stayType).toBe("monthly");
    expect(api.maxPricePerNight).toBeUndefined();
  });

  it("understands the spoken COP three-million monthly budget", () => {
    const intent = parseRentalIntentFromText(
      "Find 2-bedroom apartments in Laureles under COP 3 million monthly",
    );
    expect(intent?.maxPriceMonthly).toBe(3_000_000);
    expect(intent?.budgetCurrency).toBe("COP");
    expect(intent?.maxPricePerNight).toBeUndefined();
  });

  it("impossible query clarifies or skips search", () => {
    const intent = parseRentalIntentFromText("castle with private airport", {});
    expect(intent?.action).not.toBe("search_now");
  });

  it("Spanish rental query does not force search_now in Phase 1", () => {
    const intent = parseRentalIntentFromText(
      "apartamento de 2 habitaciones en Laureles",
      {},
    );
    // Phase 1 English parser — unrecognized ES may return null (agent/clarify path).
    if (intent) {
      expect(intent.action).not.toBe("search_now");
    } else {
      expect(intent).toBeNull();
    }
  });
});
