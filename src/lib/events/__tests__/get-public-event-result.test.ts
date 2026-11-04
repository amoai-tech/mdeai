import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { createClient } from "@/lib/supabase/server";
import { getPublicEventResult } from "../get-public-event";

const row = {
  id: "a1b2c3d4-0001-0001-0001-000000000003",
  slug: "feria",
  name: "Feria de las Flores Preview Parade",
  description: null, address: "Avenida El Poblado", city: "Medellín",
  event_start_time: "2026-12-06T14:00:00+00:00", event_end_time: null,
  primary_image_url: null, source: "manual", maps_url: null, currency: "COP",
  latitude: 6.21, longitude: -75.57, status: "published", is_active: true,
  details: {}, event_venues: null,
} as const;

function client(eventResponse: { data: unknown; error: unknown }, tickets: { data: unknown; error: unknown }) {
  const builder = (response: { data: unknown; error: unknown }) => ({
    select: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(response),
    then: undefined,
  });
  const eventQ = builder(eventResponse);
  const ticketQ = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(tickets),
  };
  let call = 0;
  return { from: vi.fn(() => (call++ === 0 ? eventQ : ticketQ)) };
}

describe("SAN-1620 — a failed read is not a missing event", () => {
  it("returns ok for a readable published event", async () => {
    vi.mocked(createClient).mockResolvedValue(client({ data: row, error: null }, { data: [], error: null }) as never);
    const result = await getPublicEventResult("feria");
    expect(result.status).toBe("ok");
  });

  it("returns not-found when the lookup finds no row", async () => {
    vi.mocked(createClient).mockResolvedValue(client({ data: null, error: null }, { data: [], error: null }) as never);
    expect(await getPublicEventResult("missing")).toEqual({ status: "not-found" });
  });

  it("returns unavailable when the event query fails", async () => {
    vi.mocked(createClient).mockResolvedValue(
      client({ data: null, error: { message: "connection reset" } }, { data: [], error: null }) as never);
    expect(await getPublicEventResult("feria")).toEqual({ status: "unavailable" });
  });

  it("returns unavailable — not no-tickets — when the ticket query fails", async () => {
    vi.mocked(createClient).mockResolvedValue(
      client({ data: row, error: null }, { data: null, error: { message: "timeout" } }) as never);
    expect(await getPublicEventResult("feria")).toEqual({ status: "unavailable" });
  });
});
