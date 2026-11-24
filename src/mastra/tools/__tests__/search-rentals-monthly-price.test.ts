import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = { projection: "", bedroomFilters: [] as string[], furnishingFilters: [] as boolean[], neighborhoodFilters: [] as string[], budgetFilters: [] as string[], rows: null as null | Array<Record<string, unknown>> };
  const row = {
    id: "apt-1",
    title: "Centro Budget Studio · 300 USD",
    neighborhood: "Centro",
    bedrooms: 1,
    price_daily: 18,
    price_monthly: 300,
    wifi_speed: 100,
    amenities: ["wifi"],
    images: ["https://images.unsplash.com/a.jpg", "https://images.unsplash.com/b.jpg"],
    host_name: "Host",
    source_url: null,
    available_from: "2026-04-25",
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 1,
    slug: "apt-1",
    latitude: 6.25,
    longitude: -75.57,
  };

  const chain: Record<string, unknown> = {};
  const passthrough = vi.fn(() => chain);
  Object.assign(chain, {
    select: vi.fn((projection: string) => {
      state.projection = projection;
      return chain;
    }),
    eq: vi.fn((key: string, value: boolean) => { if (key === "furnished") state.furnishingFilters.push(value); return chain; }),
    not: passthrough,
    order: passthrough,
    limit: passthrough,
    ilike: vi.fn((key: string, value: string) => { if (key === "neighborhood") state.neighborhoodFilters.push(value); return chain; }),
    gte: vi.fn((key: string, value: number) => { if (key === "bedrooms") state.bedroomFilters.push(`gte:${value}`); return chain; }),
    lte: vi.fn((key: string, value: number) => { if (key === "bedrooms") state.bedroomFilters.push(`lte:${value}`); return chain; }),
    or: vi.fn((value: string) => { state.budgetFilters.push(value); return chain; }),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const projectedRow = state.projection.includes("price_monthly")
        ? row
        : { ...row, price_monthly: undefined };
      const data = state.rows ?? [projectedRow];
      return Promise.resolve({ data, error: null, count: data.length }).then(resolve, reject);
    },
  });

  return {
    state,
    createClient: vi.fn(() => ({ from: vi.fn(() => chain) })),
  };
});

// These tests exercise the canonical verified-inventory path only.
 // The separate source-linked public discovery path has its own regression tests.
vi.mock("@/lib/rentals/public-external-discovery", () => ({
  searchPublicExternalRentals: vi.fn().mockResolvedValue([]),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/server-env", () => ({
  getSupabaseServerAnonEnv: () => ({ url: "https://example.supabase.co", anonKey: "anon" }),
}));
vi.mock("../../lib/intelligence-rental-search", () => ({
  searchRentalsIntelligent: vi.fn(),
}));

describe("searchRentals — SAN-1356 monthly price projection", () => {
  it("selects price_monthly so stored monthly rent reaches rental cards", async () => {
    const { searchRentals } = await import("../search-rentals");

    const result = await searchRentals({ neighborhood: "Centro", limit: 5 });

    expect(mocks.state.projection).toContain("price_monthly");
    expect(result.results[0]?.price_monthly).toBe(300);
  });

  it("uses the renter's explicit comparison COP ceiling even when the model omits it", async () => {
    const { searchRentalsTool } = await import("../search-rentals");
    const { COMPARISON_COP_MONTHLY_BUDGET_KEY } = await import("../../lib/comparison-table-intent");
    mocks.state.budgetFilters.length = 0;
    await searchRentalsTool.execute!({ neighborhood: "Laureles", limit: 5 }, {
      requestContext: {
        get: (key: string) => key === COMPARISON_COP_MONTHLY_BUDGET_KEY ? 3_000_000 : undefined,
        set: () => undefined,
      },
    } as never);
    expect(mocks.state.budgetFilters).toEqual(expect.arrayContaining([
      expect.stringContaining("currency.eq.COP"),
    ]));
    expect(mocks.state.budgetFilters.some((text) => text.includes("price_monthly.lte.3000000"))).toBe(true);
  });

  it("passes an exact bedroom interval through the existing Mastra tool to Supabase", async () => {
    const { searchRentalsTool } = await import("../search-rentals");
    mocks.state.bedroomFilters.length = 0;
    const parsed = (searchRentalsTool.inputSchema as unknown as import("zod").ZodType)
      .parse({ neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2, limit: 8 });
    await searchRentalsTool.execute!(parsed, {} as never);
    expect(mocks.state.bedroomFilters).toEqual(["gte:2", "lte:2"]);
    expect(() => (searchRentalsTool.inputSchema as unknown as import("zod").ZodType)
      .parse({ minBedrooms: 2, maxBedrooms: -1 })).toThrow();
  });

  it("preserves exact two-bedroom intent even if the model only supplied a minimum", async () => {
    const { searchRentalsTool } = await import("../search-rentals");
    mocks.state.bedroomFilters.length = 0;
    await searchRentalsTool.execute!({
      minBedrooms: 2, queryText: "Find exactly two-bedroom apartments in Laureles", limit: 8,
    }, {} as never);
    expect(mocks.state.bedroomFilters).toEqual(["gte:2", "lte:2"]);
  });

  it("keeps an at-least-two-bedroom request broad", async () => {
    const { searchRentalsTool } = await import("../search-rentals");
    mocks.state.bedroomFilters.length = 0;
    await searchRentalsTool.execute!({
      minBedrooms: 2, queryText: "Apartments with at least two bedrooms in Laureles", limit: 8,
    }, {} as never);
    expect(mocks.state.bedroomFilters).toEqual(["gte:2"]);
  });

  it("adds a grounded rental reply only for a WhatsApp tool context", async () => {
    const { searchRentalsTool } = await import("../search-rentals");
    const args = { neighborhood: "Centro", stayType: "monthly" as const, limit: 5 };
    const whatsappContext = {
      requestContext: {
        get: (name: string) => name === "channel" ? { platform: "whatsapp" } : undefined,
        set: () => undefined, // the audited-search wrapper also stores timing spans
      },
    };
    const whatsapp = await searchRentalsTool.execute!(args, whatsappContext as never) as {
      whatsapp_reply?: string;
    };
    expect(whatsapp.whatsapp_reply).toContain("Centro Budget Studio");
    expect(whatsapp.whatsapp_reply).toContain("USD 300/month");
    expect(whatsapp.whatsapp_reply).toContain("https://mdeai.co/rentals/apt-1");

    const web = await searchRentalsTool.execute!(args, {} as never) as { whatsapp_reply?: string };
    expect(web.whatsapp_reply).toBeUndefined();
  });


  it("records this run's result IDs in the same order as the returned cards", async () => {
    const { searchRentalsTool } = await import("../search-rentals");
    const { RequestContext } = await import("@mastra/core/request-context");
    const { currentRentalResultIds } = await import("../../lib/generative-ui-context");
    const base = { title: "Centro", neighborhood: "Centro", bedrooms: 1, price_daily: 18, price_monthly: 300,
      wifi_speed: 100, amenities: [], images: [], host_name: "Host", source_url: null, available_from: null,
      available_to: null, pet_friendly: false, parking_included: false, minimum_stay_days: 1, latitude: 6.25, longitude: -75.57 };
    mocks.state.rows = ["apt-c", "apt-a", "apt-b"].map((id, i) => ({ ...base, id, slug: id, price_monthly: 300 + i }));
    try {
      const requestContext = new RequestContext();
      const result = await searchRentalsTool.execute!({ neighborhood: "Centro", limit: 5 }, { requestContext } as never) as { results: Array<{ id: string }> };
      expect(result.results.length).toBe(3);
      expect(await currentRentalResultIds(requestContext as never)).toEqual(result.results.map((row) => row.id));
    } finally {
      mocks.state.rows = null;
    }
  });

  it("registers distinct result IDs before comparison", async () => {
    const { searchRentals, searchRentalsTool } = await import("../search-rentals");
    const { APARTMENT_DUPLICATE_FIELDS } = await import("@/lib/rentals/duplicate-listings");
    const { RequestContext } = await import("@mastra/core/request-context");
    const { currentRentalResultIds } = await import("../../lib/generative-ui-context");
    const base = { ...Object.fromEntries(APARTMENT_DUPLICATE_FIELDS.map((field) => [field, null])),
      title: "Calle 10 #42-15, Laureles", neighborhood: "Laureles", address: "Calle 10 #42-15",
      landlord_id: "owner-a", bedrooms: 2, bathrooms: 1, furnished: true,
      price_monthly: 2_400_000, currency: "COP", wifi_speed: 0, amenities: [], images: [],
      host_name: "Host", pet_friendly: false, parking_included: false, minimum_stay_days: 1, status: "active" };
    mocks.state.rows = [{ ...base, id: "apt-a" }, { ...base, id: "apt-b" },
      { ...base, id: "apt-c", title: "Another apartment", address: "Calle 12 #30-20" }];
    try {
      const query = { neighborhood: "Laureles", minBedrooms: 2, maxBedrooms: 2, limit: 2 };
      const result = await searchRentals(query);
      expect(result.total).toBe(2);
      expect(result.results.map((row) => row.id)).toEqual(["apt-a", "apt-c"]);
      const requestContext = new RequestContext();
      const answer = await searchRentalsTool.execute!(query, { requestContext } as never) as { results: Array<{ id: string }> };
      expect(answer.results.map((row) => row.id)).toEqual(["apt-a", "apt-c"]);
      expect(answer.results[0]).toMatchObject({ comparison_facts: {
        id: "apt-a", priceMonthly: 2400000, priceNightly: null, bathrooms: 1, furnished: true,
      } });
      expect(await currentRentalResultIds(requestContext as never)).toEqual(["apt-a", "apt-c"]);
    } finally {
      mocks.state.rows = null;
    }
  });

  it("does not replace the visible list when this run's search finds nothing", async () => {
    const { searchRentalsTool } = await import("../search-rentals");
    const { RequestContext } = await import("@mastra/core/request-context");
    const { RENTAL_RUN_RESULT_IDS_KEY } = await import("../../lib/generative-ui-context");
    mocks.state.rows = [];
    try {
      const requestContext = new RequestContext();
      await searchRentalsTool.execute!({ neighborhood: "Centro", limit: 5 }, { requestContext } as never);
      expect(requestContext.get(RENTAL_RUN_RESULT_IDS_KEY)).toBeUndefined();
    } finally {
      mocks.state.rows = null;
    }
  });

  it("preserves source gallery images and total count in Ask MDE tool results", async () => {
    const { searchRentalsTool } = await import("../search-rentals");
    const result = (await searchRentalsTool.execute!(
      { neighborhood: "Centro", limit: 5 },
      {} as never,
    )) as { results: Array<{ image: string; images?: string[]; photo_count?: number }> };
    expect(result.results[0]?.image).toBe("https://images.unsplash.com/a.jpg");
    expect(result.results[0]?.images).toEqual([
      "https://images.unsplash.com/a.jpg", "https://images.unsplash.com/b.jpg",
    ]);
    expect(result.results[0]?.photo_count).toBeUndefined();
    const modelResult = searchRentalsTool.toModelOutput?.(result as never) as {
      type: string;
      value: { results: Array<{ id: string; image: string; images?: string[]; photo_count?: number }> };
    };
    expect(modelResult.type).toBe("json");
    expect(modelResult.value.results[0]?.id).toBe("apt-1");
    expect(modelResult.value.results[0]?.image).toBe("https://images.unsplash.com/a.jpg");
    expect(modelResult.value.results[0]?.images).toBeUndefined();
    expect(modelResult.value.results[0]?.photo_count).toBeUndefined();
    const modelWithOmittedPhotos = searchRentalsTool.toModelOutput?.({
      ...result,
      results: [{ ...result.results[0]!, photo_count: 76 }],
    } as never) as { value: { results: Array<{ photo_count?: number }> } };
    expect(modelWithOmittedPhotos.value.results[0]?.photo_count).toBeUndefined();
  });

  it("preserves price_monthly through the Mastra tool output envelope", async () => {
    const { searchRentalsTool } = await import("../search-rentals");

    const result = (await searchRentalsTool.execute!(
      { neighborhood: "Centro", limit: 5 },
      {} as never,
    )) as { results: Array<{ price_monthly?: number }> };

    expect(result.results[0]?.price_monthly).toBe(300);
  });
});

describe("SAN-1694 original-turn search constraints", () => {
  it("overrides model-rewritten neighborhood and exact bedrooms using the original renter text", async () => {
    const { searchRentalsTool } = await import("../search-rentals");
    const { RENTAL_SEARCH_TEXT_KEY } = await import("../../lib/comparison-table-intent");
    mocks.state.neighborhoodFilters.length = 0;
    mocks.state.bedroomFilters.length = 0;
    await searchRentalsTool.execute!({
      neighborhood: "El Poblado", minBedrooms: 3, maxBedrooms: 3,
      queryText: "Compare apartments", limit: 8,
    }, { requestContext: { get: (key: string) => key === RENTAL_SEARCH_TEXT_KEY ? "Find 2BR apartments in Laureles and compare the first two." : undefined, set: () => undefined } } as never);
    expect(mocks.state.neighborhoodFilters).toEqual(["%Laureles%"]);
    expect(mocks.state.bedroomFilters).toEqual(["gte:2", "lte:2"]);
  });
});

it("budget refinement preserves the preceding explicit 2BR Laureles search and overrides model nightly slots", async () => {
  const { searchRentalsTool } = await import("../search-rentals");
  const { RENTAL_SEARCH_TEXT_KEY, RENTAL_REFINEMENT_TEXT_KEY } = await import("../../lib/comparison-table-intent");
  mocks.state.neighborhoodFilters.length = 0;
  mocks.state.bedroomFilters.length = 0;
  mocks.state.budgetFilters.length = 0;
  await searchRentalsTool.execute!({
    neighborhood: "El Poblado", minBedrooms: 3, maxBedrooms: 3,
    maxPricePerNight: 100, stayType: "nightly", limit: 8,
  }, { requestContext: {
    get: (key: string) => key === RENTAL_SEARCH_TEXT_KEY ? "Show only apartments under COP 3 million per month." :
      key === RENTAL_REFINEMENT_TEXT_KEY ? "Find 2BR apartments in Laureles and compare the first two." : undefined,
    set: () => undefined,
  } } as never);
  expect(mocks.state.neighborhoodFilters).toEqual(["%Laureles%"]);
  expect(mocks.state.bedroomFilters).toEqual(["gte:2", "lte:2"]);
  expect(mocks.state.budgetFilters.filter((filter) => filter.includes("price_"))).toEqual(["and(currency.eq.COP,price_monthly.not.is.null,price_monthly.lte.3000000)"]);
});

describe("SAN-1694 original furnishing wins over stale model arguments", () => {
  it.each([
    ["Find furnished 2BR apartments in Laureles and compare the first two.", false, [true]],
    ["Find unfurnished 2BR apartments in Laureles and compare the first two.", true, [false]],
    ["Find 2BR apartments in Laureles, furnished or unfurnished, and compare the first two.", true, []],
  ] as const)("applies the recorded original preference: %s", async (original, furnished, expected) => {
    const { searchRentalsTool } = await import("../search-rentals");
    const { RENTAL_SEARCH_TEXT_KEY } = await import("../../lib/comparison-table-intent");
    mocks.state.furnishingFilters.length = 0;
    await searchRentalsTool.execute!({ furnished, queryText: "Find apartments", limit: 8 },
      { requestContext: { get: (key: string) => key === RENTAL_SEARCH_TEXT_KEY ? original : undefined, set: () => undefined } } as never);
    expect(mocks.state.furnishingFilters).toEqual(expected);
  });
  it("clears stale model furnishing on a plain rental search using the actual user turn", async () => {
    const { searchRentalsTool } = await import("../search-rentals");
    const { RENTAL_SEARCH_TEXT_KEY, RENTAL_REFINEMENT_FURNISHING_KEY, trustedRentalSearchText, isRentalBudgetRefinement } = await import("../../lib/comparison-table-intent");
    const messages = [{ role: "user", content: "Find 2BR apartments in Laureles, furnished or unfurnished." }];
    const original = trustedRentalSearchText(messages);
    expect(isRentalBudgetRefinement(messages)).toBe(false);
    mocks.state.furnishingFilters.length = 0;
    await searchRentalsTool.execute!({ furnished: true, queryText: "Find furnished apartments", limit: 8 },
      { requestContext: { get: (key: string) => key === RENTAL_SEARCH_TEXT_KEY ? original :
        key === RENTAL_REFINEMENT_FURNISHING_KEY ? true : undefined, set: () => undefined } } as never);
    expect(mocks.state.furnishingFilters).toEqual([]);
  });
  it.each([
    ["Find unfurnished 2BR apartments in Laureles.", [false]],
    ["Find 2BR apartments in Laureles, furnished or unfurnished.", []],
  ] as const)("preserves the base preference during a pure budget refinement: %s", async (base, expected) => {
    const { searchRentalsTool } = await import("../search-rentals");
    const { RENTAL_SEARCH_TEXT_KEY, RENTAL_REFINEMENT_TEXT_KEY } = await import("../../lib/comparison-table-intent");
    mocks.state.furnishingFilters.length = 0;
    await searchRentalsTool.execute!({ furnished: true, queryText: "Find furnished apartments", limit: 8 },
      { requestContext: { get: (key: string) => key === RENTAL_SEARCH_TEXT_KEY ? "Show only apartments under COP 2 million per month." :
        key === RENTAL_REFINEMENT_TEXT_KEY ? base : undefined, set: () => undefined } } as never);
    expect(mocks.state.furnishingFilters).toEqual(expected);
  });
});

it("keeps unsupported base requests and uses the server COP ceiling as a pair with its currency", async () => {
  const { searchRentalsTool } = await import("../search-rentals");
  const { RENTAL_SEARCH_TEXT_KEY, RENTAL_REFINEMENT_TEXT_KEY, COMPARISON_COP_MONTHLY_BUDGET_KEY } = await import("../../lib/comparison-table-intent");
  mocks.state.budgetFilters.length = 0;
  const result = await searchRentalsTool.execute!({ limit: 8 }, { requestContext: {
    get: (key: string) => key === RENTAL_SEARCH_TEXT_KEY ? "Show only apartments under COP 3 million per month." :
      key === RENTAL_REFINEMENT_TEXT_KEY ? "Find pet-friendly 2BR apartments in Laureles." :
      key === COMPARISON_COP_MONTHLY_BUDGET_KEY ? 2_000_000 : undefined,
    set: () => undefined,
  } } as never) as { unappliedRequests: string[] };
  expect(mocks.state.budgetFilters.filter(filter => filter.includes("price_"))).toEqual(["and(currency.eq.COP,price_monthly.not.is.null,price_monthly.lte.2000000)"]);
  expect(result.unappliedRequests.join(" ")).toMatch(/pet/i);
});

describe("SAN-1694 furnishing choice between budget refinements", () => {
  it.each([
    ["Show furnished apartments.", true, [true]],
    ["Show unfurnished apartments.", false, [false]],
    ["Either furnished or unfurnished.", null, []],
  ] as const)("retains original location and bedrooms and applies latest furnishing: %s", async (choice, furnishing, expected) => {
    const { searchRentalsTool } = await import("../search-rentals");
    const { rentalRefinementContext, RENTAL_SEARCH_TEXT_KEY, RENTAL_REFINEMENT_TEXT_KEY, RENTAL_REFINEMENT_FURNISHING_KEY } = await import("../../lib/comparison-table-intent");
    const original = "Find unfurnished 2BR apartments in Laureles.";
    const cap = "Show only apartments under COP 2 million per month.";
    const messages = [original, "Show only apartments under COP 3 million per month.", choice, cap].map(content => ({ role: "user", content }));
    const refinement = rentalRefinementContext(messages);
    expect(refinement).toEqual({ baseText: original, furnishing });
    mocks.state.neighborhoodFilters.length = 0;
    mocks.state.bedroomFilters.length = 0;
    mocks.state.furnishingFilters.length = 0;
    mocks.state.budgetFilters.length = 0;
    await searchRentalsTool.execute!({ neighborhood: "El Poblado", minBedrooms: 3, maxBedrooms: 3, furnished: true, limit: 8 },
      { requestContext: {
        get: (key: string) => key === RENTAL_SEARCH_TEXT_KEY ? cap :
          key === RENTAL_REFINEMENT_TEXT_KEY ? refinement.baseText :
          key === RENTAL_REFINEMENT_FURNISHING_KEY ? refinement.furnishing : undefined,
        set: () => undefined,
      } } as never);
    expect(mocks.state.neighborhoodFilters).toEqual(["%Laureles%"]);
    expect(mocks.state.bedroomFilters).toEqual(["gte:2", "lte:2"]);
    expect(mocks.state.furnishingFilters).toEqual(expected);
    expect(mocks.state.budgetFilters.filter(filter => filter.includes("price_"))).toEqual(["and(currency.eq.COP,price_monthly.not.is.null,price_monthly.lte.2000000)"]);
  });
});

it("uses the resolved monthly amount and currency in the WhatsApp reply", async () => {
  const { searchRentalsTool } = await import("../search-rentals");
  const { RENTAL_SEARCH_TEXT_KEY, COMPARISON_COP_MONTHLY_BUDGET_KEY } = await import("../../lib/comparison-table-intent");
  const ctx = (text: string, cop: number | null) => ({ requestContext: {
    get: (key: string) => key === "channel" ? "whatsapp" : key === RENTAL_SEARCH_TEXT_KEY ? text : key === COMPARISON_COP_MONTHLY_BUDGET_KEY ? cop : undefined,
    set: () => undefined,
  } });
  const input = { maxPriceMonthly: 1200, budgetCurrency: "USD" as const, limit: 5 };
  const usd = await searchRentalsTool.execute!(input, ctx("Show apartments under USD 900 per month.", null) as never) as { whatsapp_reply?: string };
  expect(usd.whatsapp_reply).toContain("under USD 900/month");
  expect(usd.whatsapp_reply).not.toContain("USD 1,200");
  const cop = await searchRentalsTool.execute!(input, ctx("Show apartments under COP 3 million per month.", 3_000_000) as never) as { whatsapp_reply?: string };
  expect(cop.whatsapp_reply).toContain("not compared to your budget");
  expect(cop.whatsapp_reply).not.toContain("USD 1,200");
});

it("keeps the base location, exact bedrooms, latest budget and amenity disclosure when clearing furnishing", async () => {
  const { searchRentalsTool } = await import("../search-rentals");
  const { rentalRefinementContext, RENTAL_SEARCH_TEXT_KEY, RENTAL_REFINEMENT_TEXT_KEY, RENTAL_REFINEMENT_BUDGET_KEY } = await import("../../lib/comparison-table-intent");
  const original = "Find pet-friendly furnished 2BR apartments in Laureles under COP 4 million per month.";
  // Use an explicit rental noun so this is unambiguously a rental clear even without page hints.
  const current = "Show either furnished or unfurnished apartments.";
  const messages = [original, "Show only apartments under COP 3 million per month.", "Show only apartments under COP 2 million per month.", current].map(content => ({role: "user", content}));
  const refinement = rentalRefinementContext(messages);
  expect(refinement).toEqual({baseText: original, furnishing: null, budget: {maxPriceMonthly: 2_000_000, budgetCurrency: "COP"}});
  mocks.state.neighborhoodFilters.length = 0;
  mocks.state.bedroomFilters.length = 0;
  mocks.state.furnishingFilters.length = 0;
  mocks.state.budgetFilters.length = 0;
  const result = await searchRentalsTool.execute!({ neighborhood: "El Poblado", minBedrooms: 3, maxBedrooms: 3, maxPriceMonthly: 1200, budgetCurrency: "USD", furnished: true, queryText: "Find furnished apartments", limit: 8 },
    {requestContext: {get: (key: string) => key === RENTAL_SEARCH_TEXT_KEY ? current : key === RENTAL_REFINEMENT_TEXT_KEY ? refinement.baseText : key === RENTAL_REFINEMENT_BUDGET_KEY ? refinement.budget : undefined, set: () => undefined}} as never) as {unappliedRequests: string[]};
  expect(mocks.state.neighborhoodFilters).toEqual(["%Laureles%"]);
  expect(mocks.state.bedroomFilters).toEqual(["gte:2", "lte:2"]);
  expect(mocks.state.furnishingFilters).toEqual([]);
  expect(mocks.state.budgetFilters.filter(filter => filter.includes("price_"))).toEqual(["and(currency.eq.COP,price_monthly.not.is.null,price_monthly.lte.2000000)"]);
  expect(result.unappliedRequests.join(" ")).toMatch(/pet/i);
});

it("keeps model query wording and disclosures if a standalone clear has no recoverable base", async () => {
  const { searchRentalsTool } = await import("../search-rentals");
  const { RENTAL_SEARCH_TEXT_KEY } = await import("../../lib/comparison-table-intent");
  const { RENTAL_A2UI_CONTEXT_DESCRIPTION } = await import("@/lib/rentals/a2ui-context");
  mocks.state.neighborhoodFilters.length = 0;
  mocks.state.bedroomFilters.length = 0;
  mocks.state.furnishingFilters.length = 0;
  const result = await searchRentalsTool.execute!({ queryText: "Find pet-friendly furnished 2BR apartments in Laureles.", furnished: true, limit: 8 },
    {requestContext: {get: (key: string) => key === RENTAL_SEARCH_TEXT_KEY ? "Either furnished or unfurnished." : key === "ag-ui" ? {context: [{description: RENTAL_A2UI_CONTEXT_DESCRIPTION, value: JSON.stringify(["37a05b09-f560-4776-92fd-b8bb2b92e601"])}]} : undefined, set: () => undefined}} as never) as {unappliedRequests: string[]};
  expect(mocks.state.neighborhoodFilters).toEqual(["%Laureles%"]);
  expect(mocks.state.bedroomFilters).toEqual(["gte:2", "lte:2"]);
  expect(mocks.state.furnishingFilters).toEqual([]);
  expect(result.unappliedRequests.join(" ")).toMatch(/pet/i);
});
