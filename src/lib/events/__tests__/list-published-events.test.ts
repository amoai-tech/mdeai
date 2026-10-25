import { describe, expect, it, vi, beforeEach } from "vitest";
import { mapEventRowToBrowseItem } from "../list-published-events";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { GET } from "@/app/api/events/public/route";

describe("mapEventRowToBrowseItem", () => {
  it("maps slug and ticketUrl for browse cards", () => {
    const item = mapEventRowToBrowseItem({
      id: "e1",
      slug: "salsa-night",
      name: "Salsa Night",
      event_type: "music",
      address: "Laureles, Calle 10",
      city: "Medellín",
      event_start_time: "2026-06-10T01:00:00.000Z",
      ticket_price_min: 25000,
      currency: "COP",
      primary_image_url: "https://cdn.example/photo.jpg",
      ticket_url: null,
      status: "published",
    });
    expect(item.slug).toBe("salsa-night");
    expect(item.ticketUrl).toBe("/events/salsa-night");
    expect(item.category).toBe("music");
    expect(item.currency).toBe("COP");
    expect(item.pricePerTicket).toBeNull();
    expect(item.canBuyTickets).toBe(false);
    expect(item.neighborhood).toBe("Laureles");
  });
  it("uses active tier minor units and tier currency, not stale event summary", () => {
    const item = mapEventRowToBrowseItem({
      id: "e2",
      slug: "reina",
      name: "Reina de Antioquia",
      event_type: "culture",
      address: null,
      city: "Medellín",
      event_start_time: "2027-02-24T01:00:00.000Z",
      ticket_price_min: null,
      currency: "USD",
      primary_image_url: null,
      ticket_url: null,
      status: "published",
      event_tickets: [
        { price_cents: 12000000, currency: "COP", qty_total: 100, qty_sold: 0, qty_pending: 0, sale_starts_at: null, sale_ends_at: null },
        { price_cents: 4000000, currency: "COP", qty_total: 300, qty_sold: 9, qty_pending: 0, sale_starts_at: null, sale_ends_at: null },
      ],
    });
    expect(item.pricePerTicket).toBe(40000);
    expect(item.currency).toBe("COP");
    expect(item.canBuyTickets).toBe(true);
  });

  it("offers the cheapest actually purchasable tier when cheaper tickets are sold out", () => {
    const item = mapEventRowToBrowseItem({
      id: "e4", slug: null, name: "VIP Only", event_type: null,
      address: null, city: null, event_start_time: "2027-01-01T00:00:00Z",
      ticket_price_min: 0, currency: "USD", primary_image_url: null,
      ticket_url: null, status: "published",
      event_tickets: [
        { price_cents: 4000000, currency: "COP", qty_total: 10, qty_sold: 10, qty_pending: 0, sale_starts_at: null, sale_ends_at: null },
        { price_cents: 12000000, currency: "COP", qty_total: 20, qty_sold: 0, qty_pending: 0, sale_starts_at: null, sale_ends_at: null },
      ],
    });
    expect(item.pricePerTicket).toBe(120000);
    expect(item.canBuyTickets).toBe(true);
  });

  it("shows known pricing but not purchase when the only tier is sold out", () => {
    const item = mapEventRowToBrowseItem({
      id: "e3", slug: null, name: "Sold Out", event_type: null,
      address: null, city: null, event_start_time: "2027-01-01T00:00:00Z",
      ticket_price_min: 0, currency: "USD", primary_image_url: null,
      ticket_url: null, status: "published",
      event_tickets: [
        { price_cents: 0, currency: "COP", qty_total: 10, qty_sold: 10, qty_pending: 0, sale_starts_at: null, sale_ends_at: null },
      ],
    });
    expect(item.pricePerTicket).toBe(0);
    expect(item.canBuyTickets).toBe(false);
  });
});

describe("GET /api/events/public", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it("returns 400 on invalid category", async () => {
    const res = await GET(
      new Request("http://localhost/api/events/public?category=invalid"),
    );
    expect(res.status).toBe(400);
  });

  it("returns published events JSON", async () => {
    const chain = {
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      then: undefined as unknown,
    };
    chain.range.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            id: "e1",
            slug: "salsa-night",
            name: "Salsa Night",
            event_type: "music",
            address: "Laureles, Calle 10",
            city: "Medellín",
            event_start_time: "2026-06-10T01:00:00.000Z",
            ticket_price_min: 0,
            currency: "COP",
            primary_image_url: null,
            ticket_url: null,
            status: "published",
          },
        ],
        error: null,
        count: 1,
      }),
    );

    const select = vi.fn().mockReturnValue(chain);
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as never);

    const res = await GET(new Request("http://localhost/api/events/public"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].slug).toBe("salsa-night");
    expect(body.total).toBe(1);
    expect(body.results[0].pricePerTicket).toBeNull();
    expect(body.results[0].canBuyTickets).toBe(false);
    expect(chain.not).toHaveBeenCalledWith(
      "name", "imatch", "^[[:space:]]*(qa|test)([[:space:]_:-]|$)",
    );
    expect(chain.gte).toHaveBeenCalledWith("event_start_time", expect.any(String));
    expect(select).toHaveBeenCalledWith(
      expect.stringContaining("event_tickets("),
      { count: "exact" },
    );
    expect(chain.eq).toHaveBeenCalledWith("event_tickets.is_active", true);
    expect(chain.eq).toHaveBeenCalledWith("event_tickets.is_hidden", false);

    await GET(new Request("http://localhost/api/events/public?price=paid"));
    expect(select).toHaveBeenCalledWith(
      expect.stringContaining("event_tickets!inner("),
      { count: "exact" },
    );
    expect(chain.gt).toHaveBeenCalledWith("event_tickets.price_cents", 0);

    await GET(new Request("http://localhost/api/events/public?price=free"));
    expect(chain.eq).toHaveBeenCalledWith("event_tickets.price_cents", 0);
  });
});
