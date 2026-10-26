import { describe, expect, it, vi } from "vitest";
import { hydrateEventTicketOffers, type EventCard } from "../search-events";

const card = (id: string): EventCard => ({
  id, title: id, category: "culture", venue: "Medellín",
  neighborhood: "Medellín", startsAt: "2027-02-24T01:00:00Z",
  pricePerTicket: null, canBuyTickets: false,
  currency: "USD", imageUrl: "",
});

function clientWithResult(data: unknown, error: {message: string} | null = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({data,error}).then(resolve),
  };
  return {
    client: {from: vi.fn().mockReturnValue(chain)} as unknown as NonNullable<Parameters<typeof hydrateEventTicketOffers>[1]>,
    chain,
  };
}

const tier = (price_cents: number, overrides: Record<string, unknown> = {}) => ({
  price_cents, currency: "COP", qty_total: 10, qty_sold: 0, qty_pending: 0,
  sale_starts_at: null, sale_ends_at: null, ...overrides,
});

describe("search-events tier hydration", () => {
  it("reuses real tier prices/actions/slug for Ask MDE instead of zero legacy summaries", async () => {
    const {client,chain} = clientWithResult([
      {id:"tierless",slug:"parade",ticket_url:null,currency:"USD",event_tickets:[]},
      {id:"paid",slug:"reina",ticket_url:null,currency:"USD",event_tickets:[tier(4000000)]},
      {id:"sold-out",slug:"sold-out",ticket_url:null,currency:"COP",
        event_tickets:[tier(1000000,{qty_sold:10})]},
      {id:"free",slug:"free-entry",ticket_url:null,currency:"COP",event_tickets:[tier(0)]},
    ]);
    const data = await hydrateEventTicketOffers(
      [card("tierless"),card("paid"),card("sold-out"),card("free")],client,
    );
    expect(data.map(x=>({price:x.pricePerTicket,buy:x.canBuyTickets,currency:x.currency,url:x.ticketUrl})))
      .toEqual([
        {price:null,buy:false,currency:"USD",url:"/events/parade"},
        {price:40000,buy:true,currency:"COP",url:"/events/reina"},
        {price:10000,buy:false,currency:"COP",url:"/events/sold-out"},
        {price:0,buy:true,currency:"COP",url:"/events/free-entry"},
      ]);
    expect(chain.in).toHaveBeenCalledWith("id",["tierless","paid","sold-out","free"]);
    expect(chain.eq).toHaveBeenCalledWith("event_tickets.is_active",true);
    expect(chain.eq).toHaveBeenCalledWith("event_tickets.is_hidden",false);
  });

  it("fails safely with unknown prices and no Buy when tier lookup fails", async () => {
    const {client} = clientWithResult(null,{message:"database unavailable"});
    const data = await hydrateEventTicketOffers([card("unavailable")],client);
    expect(data[0]).toMatchObject({
      pricePerTicket:null,canBuyTickets:false,ticketUrl:"/events/unavailable",
    });
  });
});
