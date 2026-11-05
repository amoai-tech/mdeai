import { describe, expect, it } from "vitest";
import type { PublicEventDetail } from "../types";
import { buildEventStructuredData, serializeEventStructuredData } from "../event-structured-data";

function event(overrides: Partial<PublicEventDetail> = {}): PublicEventDetail {
  return {
    id: "a1b2c3d4-0001-0001-0001-000000000003",
    slug: "feria-de-las-flores",
    name: "Feria de las Flores",
    description: "Desfile de silleteros",
    address: "Avenida El Poblado",
    city: "Medellín",
    startsAt: "2026-12-06T19:00:00+00:00",
    endsAt: "2026-12-06T23:00:00+00:00",
    imageUrl: "https://res.cloudinary.com/mdeai/image/upload/feria.jpg",
    currency: "COP",
    latitude: 6.21,
    longitude: -75.57,
    host: null,
    venue: null,
    tickets: [],
    ...overrides,
  };
}

function tier(overrides: Partial<PublicEventDetail["tickets"][number]> = {}) {
  return {
    id: "tier-1",
    name: "General",
    priceCents: 8_000_000,
    currency: "COP",
    qtyTotal: 100,
    qtySold: 10,
    qtyPending: 0,
    minPerOrder: 1,
    maxPerOrder: 10,
    saleStartsAt: null,
    saleEndsAt: null,
    position: 0,
    ...overrides,
  };
}

describe("buildEventStructuredData — core facts", () => {
  it("emits an Event node with the stored name and ISO dates", () => {
    const jsonLd = buildEventStructuredData(event());
    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("Event");
    expect(jsonLd.name).toBe("Feria de las Flores");
    expect(jsonLd.startDate).toBe("2026-12-06T19:00:00.000Z");
    expect(jsonLd.endDate).toBe("2026-12-06T23:00:00.000Z");
  });

  it("omits endDate when no end time was stored", () => {
    const jsonLd = buildEventStructuredData(event({ endsAt: null }));
    expect(jsonLd).not.toHaveProperty("endDate");
  });

  it("omits a start date that cannot be parsed instead of guessing one", () => {
    const jsonLd = buildEventStructuredData(event({ startsAt: "not-a-date" }));
    expect(jsonLd).not.toHaveProperty("startDate");
    expect(jsonLd).not.toHaveProperty("endDate");
  });

  it("never invents an organizer or a venue", () => {
    const jsonLd = buildEventStructuredData(
      event({ host: { name: "Producciones MDE", avatarUrl: null }, address: null, city: null }),
    );
    expect(jsonLd).not.toHaveProperty("organizer");
    expect(jsonLd).not.toHaveProperty("performer");
  });
});

describe("buildEventStructuredData — location", () => {
  it("is absent when no venue name or street address was saved", () => {
    const jsonLd = buildEventStructuredData(event({ address: null, city: null, venue: null }));
    expect(jsonLd).not.toHaveProperty("location");
  });

  it("does not treat a city alone as an address", () => {
    const jsonLd = buildEventStructuredData(event({ address: null, city: "Medellín", venue: null }));
    expect(jsonLd).not.toHaveProperty("location");
  });

  it("uses the saved venue with a PostalAddress", () => {
    const jsonLd = buildEventStructuredData(
      event({
        address: null,
        city: null,
        venue: { name: "Plaza Mayor", address: "Calle 41 #55-80", city: "Medellín" },
      }),
    );
    expect(jsonLd.location).toEqual({
      "@type": "Place",
      name: "Plaza Mayor",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Calle 41 #55-80",
        addressLocality: "Medellín",
      },
    });
  });

  it("uses the stored event address when there is no venue row", () => {
    const jsonLd = buildEventStructuredData(event());
    expect(jsonLd.location).toEqual({
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Avenida El Poblado",
        addressLocality: "Medellín",
      },
    });
  });
});

describe("buildEventStructuredData — image", () => {
  it("is absent when no image is stored", () => {
    const jsonLd = buildEventStructuredData(event({ imageUrl: null }));
    expect(jsonLd).not.toHaveProperty("image");
  });

  it("uses an absolute stored image URL", () => {
    const jsonLd = buildEventStructuredData(event());
    expect(jsonLd.image).toEqual(["https://res.cloudinary.com/mdeai/image/upload/feria.jpg"]);
  });

  it("resolves a site-relative stored image only when the origin is known", () => {
    expect(buildEventStructuredData(event({ imageUrl: "/images/feria.jpg" }))).not.toHaveProperty("image");
    expect(
      buildEventStructuredData(event({ imageUrl: "/images/feria.jpg" }), { siteOrigin: "https://www.mdeai.co" })
        .image,
    ).toEqual(["https://www.mdeai.co/images/feria.jpg"]);
  });
});

describe("buildEventStructuredData — offers", () => {
  it("emits no offers and no price at all when the event has no active tiers", () => {
    const jsonLd = buildEventStructuredData(event({ tickets: [] }));
    expect(jsonLd).not.toHaveProperty("offers");
    const serialized = serializeEventStructuredData(jsonLd);
    expect(serialized).not.toContain('"price"');
    expect(serialized).not.toContain("priceCurrency");
    expect(serialized).not.toContain("InStock");
    expect(serialized).not.toContain("availability");
  });

  it("emits one Offer per real active tier, in major currency units", () => {
    const jsonLd = buildEventStructuredData(
      event({
        tickets: [
          tier({ id: "tier-1", name: "General", priceCents: 8_000_000, currency: "COP" }),
          tier({ id: "tier-2", name: "VIP", priceCents: 15_000_000, currency: "COP", position: 1 }),
          tier({ id: "tier-3", name: "USD", priceCents: 4_500, currency: "usd", position: 2 }),
        ],
      }),
    );
    expect(jsonLd.offers).toEqual([
      { "@type": "Offer", name: "General", price: 80_000, priceCurrency: "COP" },
      { "@type": "Offer", name: "VIP", price: 150_000, priceCurrency: "COP" },
      { "@type": "Offer", name: "USD", price: 45, priceCurrency: "USD" },
    ]);
  });

  it("drops tiers whose stored price or currency is not usable instead of inventing one", () => {
    const jsonLd = buildEventStructuredData(
      event({
        tickets: [
          tier({ id: "bad-price", priceCents: Number.NaN }),
          tier({ id: "negative", priceCents: -1 }),
          tier({ id: "bad-currency", currency: "", name: "Broken" }),
          tier({ id: "good", priceCents: 20_000, currency: "COP", name: "General" }),
        ],
      }),
    );
    expect(jsonLd.offers).toEqual([
      { "@type": "Offer", name: "General", price: 200, priceCurrency: "COP" },
    ]);
  });

  it("never asserts availability from tier inventory", () => {
    const jsonLd = buildEventStructuredData(event({ tickets: [tier({ qtySold: 100, qtyTotal: 100 })] }));
    expect(serializeEventStructuredData(jsonLd)).not.toContain("availability");
    expect(serializeEventStructuredData(jsonLd)).not.toContain("InStock");
    expect(serializeEventStructuredData(jsonLd)).not.toContain("SoldOut");
  });
});

describe("serializeEventStructuredData — safe inline JSON", () => {
  it("escapes stored text so it cannot close the script element", () => {
    const jsonLd = buildEventStructuredData(
      event({ name: '</script><script>alert("x")</script>', description: "a & b" }),
    );
    const serialized = serializeEventStructuredData(jsonLd);
    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<");
    expect(serialized).not.toContain(">");
    expect(serialized).not.toContain("&");
    // The escape is reversible: the stored name survives parsing.
    expect(JSON.parse(serialized).name).toBe('</script><script>alert("x")</script>');
  });

  it("escapes the JavaScript-only line separators", () => {
    const serialized = serializeEventStructuredData(buildEventStructuredData(event({ name: "a\u2028b\u2029c" })));
    expect(serialized).not.toContain("\u2028");
    expect(serialized).not.toContain("\u2029");
    expect(JSON.parse(serialized).name).toBe("a\u2028b\u2029c");
  });
});
