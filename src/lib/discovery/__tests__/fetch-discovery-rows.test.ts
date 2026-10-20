import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchLiveDestinations,
  fetchLiveEvents,
  fetchLiveRestaurants,
} from "@/lib/discovery/fetch-discovery-rows";
import { HomeDiscoverySectionsUI, type DiscoveryData } from "@/components/home/home-discovery-rows";

/** Records every chained filter and resolves with the given rows, whatever the method. */
function fakeClient(rows: Array<Record<string, unknown>>) {
  const calls: string[] = [];
  const chain: unknown = new Proxy(
    {},
    {
      get: (_t, method: string) => {
        if (method === "then") {
          return (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
        }
        return (...args: unknown[]) => {
          calls.push(`${method}(${args.map((a) => (typeof a === "object" ? "{}" : String(a))).join(",")})`);
          return chain;
        };
      },
    },
  );
  return { client: { from: () => chain } as unknown as SupabaseClient, calls };
}

afterEach(() => vi.unstubAllEnvs());

describe("homepage events (SAN-1556): only real, upcoming, honestly described", () => {
  const event = (over: Record<string, unknown>) => ({
    id: "e1", slug: "parade", name: "Parade", event_type: "Culture", address: "Parque Lleras, El Poblado",
    city: "Medellín", event_start_time: "2099-12-06T14:00:00Z", ticket_price_min: 0, currency: "USD",
    primary_image_url: null, ...over,
  });

  it("asks only for active, published events that have not started", async () => {
    const { client, calls } = fakeClient([]);
    await fetchLiveEvents(client);
    expect(calls).toContain("eq(is_active,true)");
    expect(calls.some((c) => c.startsWith("gte(event_start_time,"))).toBe(true);
  });

  it("excludes QA/test events in the query itself, so they cannot crowd real events out of the first rows", async () => {
    const { client, calls } = fakeClient([]);
    await fetchLiveEvents(client);
    expect(calls).toContain("not(name,imatch,^\\s*(qa|test)\\y)");
    expect(calls).toContain("limit(4)");
  });

  it("invents no rating and shows the real date instead of 'Tonight'", async () => {
    const { client } = fakeClient([event({})]);
    const cards = await fetchLiveEvents(client);
    expect(cards.map((c) => c.name)).toEqual(["Parade"]);
    expect(cards[0].rating).toBeNull();
    expect(cards[0].meta).toMatch(/Dec 6/);
    expect(cards[0].meta).not.toMatch(/tonight|this week|next week/i);
    expect(cards[0].href).toBe("/events/parade");
  });

  it("spells the city correctly when an event has no address or city (the shared helper returns 'Medellin')", async () => {
    const { client } = fakeClient([event({ address: null, city: null })]);
    const [card] = await fetchLiveEvents(client);
    expect(card.why).toBe("Medellín");
  });

  it("keeps an unknown price unknown (not 'Free') and prints pesos as pesos, whatever the case stored", async () => {
    const { client } = fakeClient([
      event({ id: "a", name: "Pageant", ticket_price_min: null }),
      event({ id: "b", name: "Gala", ticket_price_min: 5000000, currency: "cop" }),
    ]);
    const [unknown, paid] = await fetchLiveEvents(client);
    expect(unknown.meta).not.toMatch(/free|\$/i);
    expect(paid.meta).toMatch(/COP 5,000,000$/);
  });
});

describe("homepage restaurants (SAN-1556)", () => {
  it("filters is_active itself, because the development read policy also returns inactive rows", async () => {
    const { client, calls } = fakeClient([]);
    await fetchLiveRestaurants(client);
    expect(calls).toContain("eq(is_active,true)");
  });

  it("leaves an unrated restaurant unrated and adds no 'Highly rated' filler", async () => {
    const { client } = fakeClient([
      { id: "r1", name: "Casa", neighborhood: "Laureles", cuisine_types: ["colombian"], price_level: 2, primary_image_url: null, rating: null, ai_summary: null },
    ]);
    const [card] = await fetchLiveRestaurants(client);
    expect(card.rating).toBeNull();
    expect(card.why).toBe("");
  });
});

describe("homepage destinations (SAN-1556)", () => {
  const dest = (name: string, over: Record<string, unknown> = {}) => ({
    id: name, name, category: "Culture", description: `About ${name}`, primary_image_url: null, ...over,
  });

  it("shows each place once, featured places first, and no neighbourhood rows", async () => {
    const { client, calls } = fakeClient([
      dest("Catedral Metropolitana"), dest("Parque Arví"), dest("Parque Arví"), dest("Comuna 13"),
    ]);
    const cards = await fetchLiveDestinations(client);
    expect(cards.map((c) => c.name)).toEqual(["Comuna 13", "Parque Arví", "Catedral Metropolitana"]);
    expect(calls).toContain("neq(category,Neighborhood)");
  });

  it("shows a photo only when we host it; stock or dead links give an honest text card", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    const own = "https://abc.supabase.co/storage/v1/object/public/destinations/a.jpg";
    const { client } = fakeClient([
      dest("Comuna 13", { primary_image_url: "https://upload.wikimedia.org/wikipedia/commons/9/9f/Comuna_13_Medellin.jpg" }),
      dest("Plaza Botero", { primary_image_url: own }),
      dest("Parque Explora", { primary_image_url: "https://images.unsplash.com/photo-1.jpg" }),
    ]);
    const cards = await fetchLiveDestinations(client);
    expect(Object.fromEntries(cards.map((c) => [c.name, c.image]))).toEqual({
      "Comuna 13": "",
      "Plaza Botero": own,
      "Parque Explora": "",
    });
  });
});

describe("homepage destination photos (SAN-1556): real, openly licensed, credited", () => {
  const COMMONS = "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Comuna_13%2C_Medell%C3%ADn_02.jpg/960px-Comuna_13%2C_Medell%C3%ADn_02.jpg";
  const credit = { author: "Bernard Gagnon", license: "CC BY-SA 4.0", source_url: "https://commons.wikimedia.org/wiki/File:Comuna_13,_Medell%C3%ADn_02.jpg", alt: "Brick houses on the hillsides of Comuna 13" };
  const dest = (name: string, over: Record<string, unknown> = {}) => ({
    id: name, name, category: "Culture", description: `About ${name}`, primary_image_url: null, details: {}, ...over,
  });

  it("shows a Commons photo with its credit and descriptive alt text", async () => {
    const { client } = fakeClient([dest("Comuna 13", { primary_image_url: COMMONS, details: { image_credit: credit } })]);
    const [card] = await fetchLiveDestinations(client);
    expect(card.image).toBe(COMMONS);
    expect(card.imageAlt).toBe("Brick houses on the hillsides of Comuna 13");
    expect(card.imageCredit).toEqual({ text: "Photo: Bernard Gagnon · CC BY-SA 4.0", href: credit.source_url });
  });

  it("never shows a Commons photo that has no recorded author, licence and source", async () => {
    const { client } = fakeClient([
      dest("No credit", { primary_image_url: COMMONS }),
      dest("Half credit", { primary_image_url: COMMONS, details: { image_credit: { author: "Someone" } } }),
    ]);
    const cards = await fetchLiveDestinations(client);
    expect(cards.map((c) => c.image)).toEqual(["", ""]);
  });

  it("keeps the duplicate row that has a usable photo", async () => {
    const { client } = fakeClient([
      dest("Parque Arví", { id: "stock", primary_image_url: "https://images.unsplash.com/photo-1.jpg" }),
      dest("Parque Arví", { id: "credited", primary_image_url: COMMONS, details: { image_credit: credit } }),
    ]);
    const cards = await fetchLiveDestinations(client);
    expect(cards.map((c) => c.id)).toEqual(["credited"]);
    expect(cards[0].image).toBe(COMMONS);
  });

  it("renders the photo, its credit text and a credits line with a link outside the card links", () => {
    const html = renderToStaticMarkup(
      HomeDiscoverySectionsUI({
        data: { destinations: [{ id: "d", name: "Comuna 13", kind: "Neighborhood", rating: null, meta: "", why: "", image: COMMONS, query: "q", imageAlt: "Brick houses on the hillsides of Comuna 13", imageCredit: { text: "Photo: Bernard Gagnon · CC BY-SA 4.0", href: credit.source_url } }], rentals: [], restaurants: [], cafes: [], events: [] },
      }),
    );
    expect(html).toContain("<img");
    expect(html).toContain('alt="Brick houses on the hillsides of Comuna 13"');
    expect(html).toContain("Photo: Bernard Gagnon · CC BY-SA 4.0");
    expect(html).toContain("Photo credits, via Wikimedia Commons");
    expect(html).toContain(`href="${credit.source_url}"`);
  });
});

describe("HomeDiscoverySectionsUI (SAN-1556): no stand-in data", () => {
  const none: DiscoveryData = { destinations: [], rentals: [], restaurants: [], cafes: [], events: [] };
  const card = { id: "1", name: "Pageant", kind: "Event", rating: null, meta: "", why: "", image: "", query: "q" };
  const render = (data: Partial<DiscoveryData>) =>
    renderToStaticMarkup(HomeDiscoverySectionsUI({ data: { ...none, ...data } }));

  it("renders only the sections that have real records (fewer than four is fine)", () => {
    const html = render({ events: [{ ...card, startsAt: "2099-12-06T14:00:00Z", meta: "Sun, Dec 6, 9:00 AM · Free" }] });
    expect(html).toContain("Upcoming events");
    expect(html).toContain("Pageant");
    expect(html).not.toContain("Rentals in Medellín");
    expect(html).not.toContain("Eat and drink");
    expect(html).not.toContain("Things to see");
  });

  it("leads an event with its real date, in Medellín time", () => {
    const html = render({ events: [{ ...card, startsAt: "2099-12-06T03:00:00Z" }] });
    // 03:00 UTC is still Dec 5 in Medellín (UTC-5).
    expect(html).toMatch(/Dec<\/span><span[^>]*>5</);
  });

  it("shows an honest empty state, with no invented cards, when nothing is available", () => {
    const html = render({});
    expect(html).toContain("Recommendations are unavailable right now");
    expect(html).toContain('href="/chat"');
    expect(html).not.toMatch(/unsplash|Carmen|Pergamino|Feria/i);
  });

  it("puts restaurants and cafés in one tabbed section, only offering tabs that have records", () => {
    const both = render({
      restaurants: [{ ...card, id: "r", name: "Casa" }],
      cafes: [{ ...card, id: "c", name: "Tinto" }],
    });
    expect(both).toContain("Eat and drink");
    expect(both).toContain("Restaurants");
    expect(both).toContain("Cafés");
    const onlyCafes = render({ cafes: [{ ...card, id: "c", name: "Tinto" }] });
    expect(onlyCafes).toContain("Tinto");
    expect(onlyCafes).not.toMatch(/role="tab"/);
  });

  it("shows a star rating only when one exists", () => {
    const rated = { ...card, id: "2", name: "Rated", rating: 4.9 };
    const html = render({ rentals: [card, rated] });
    expect(html.match(/★/g)).toHaveLength(1);
  });

  it("uses an honest text card, not a stock picture, when a record has no photo", () => {
    const html = render({ destinations: [{ ...card, id: "d", name: "Plaza Botero", kind: "Culture" }] });
    expect(html).toContain("Plaza Botero");
    expect(html).not.toContain("<img");
  });
});
