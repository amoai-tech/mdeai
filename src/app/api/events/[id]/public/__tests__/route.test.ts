import { describe, expect, it, vi } from "vitest";

const state: { result: unknown } = { result: { status: "not-found" } };
vi.mock("@/lib/events/get-public-event", () => ({
  getPublicEventResult: async () => state.result,
}));
import { GET } from "../route";

const call = () => GET(new Request("https://mdeai.co/api/events/x/public"), {
  params: Promise.resolve({ id: "a1b2c3d4-0001-0001-0001-000000000003" }),
});

describe("SAN-1620 — public event API keeps error vs absence distinct", () => {
  it("returns 404 only when the event genuinely does not exist", async () => {
    state.result = { status: "not-found" };
    const response = await call();
    expect(response.status).toBe(404);
  });

  it("returns a retryable 503 when the read failed", async () => {
    state.result = { status: "unavailable" };
    const response = await call();
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(await response.json()).toEqual({ error: "Event temporarily unavailable" });
  });

  it("returns the event when it is readable", async () => {
    state.result = { status: "ok", event: { id: "e1", name: "Feria" } };
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ event: { id: "e1", name: "Feria" } });
  });
});
