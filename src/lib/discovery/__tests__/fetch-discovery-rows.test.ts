import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchLiveDestinations,
  fetchLiveEvents,
  fetchLiveRestaurants,
} from "@/lib/discovery/fetch-discovery-rows";
import { HomeDiscoveryRowsUI } from "@/components/home/home-discovery-rows";
import { NON_QA_EVENT_SLUG_FILTER, QA_EVENT_NAME_SQL_PATTERN } from "@/lib/events/public-event-fixtures";

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
    expect(calls).toContain(`not(name,imatch,${QA_EVENT_NAME_SQL_PATTERN})`);
    expect(calls).toContain(`or(${NON_QA_EVENT_SLUG_FILTER})`);
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

describe("HomeDiscoveryRowsUI (SAN-1556): no stand-in data", () => {
  const card = { id: "1", name: "Pageant", kind: "Event", rating: null, meta: "", why: "", image: "", query: "q" };

  it("renders a row with fewer than four real cards and hides rows with none", () => {
    const html = renderToStaticMarkup(
      HomeDiscoveryRowsUI({
        rows: [
          { id: "events", label: "Upcoming events", href: "/events", ctaLabel: "View all events", cards: [card] },
          { id: "cafes", label: "Cafés", href: "/cafes", ctaLabel: "Explore cafés", cards: [] },
        ],
      }),
    );
    expect(html).toContain("Upcoming events");
    expect(html).toContain("Pageant");
    expect(html).not.toContain("Cafés");
  });

  it("shows an honest empty state, with no invented cards, when nothing is available", () => {
    const html = renderToStaticMarkup(HomeDiscoveryRowsUI({ rows: [{ id: "events", label: "Upcoming events", href: "/events", ctaLabel: "x", cards: [] }] }));
    expect(html).toContain("Recommendations are unavailable right now");
    expect(html).toContain('href="/chat"');
    expect(html).not.toMatch(/unsplash|Carmen|Pergamino|Feria/i);
  });

  it("shows a star rating only when one exists", () => {
    const rated = { ...card, id: "2", name: "Rated", rating: 4.9 };
    const html = renderToStaticMarkup(
      HomeDiscoveryRowsUI({ rows: [{ id: "r", label: "Restaurants", href: "/restaurants", ctaLabel: "x", cards: [card, rated] }] }),
    );
    expect(html.match(/★/g)).toHaveLength(1);
  });
});
