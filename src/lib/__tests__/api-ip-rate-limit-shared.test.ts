import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Public search must be limited by a store every instance shares, and must still work when that
 * store is unavailable. These two behaviours are the whole point of the helper.
 */
const durable = vi.hoisted(() => ({
  impl: async () => ({ allowed: true, count: 1, max: 30, retryAfterSeconds: 0, storeAvailable: true }),
}));

vi.mock("@/lib/distributed-rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/distributed-rate-limit")>(
    "@/lib/distributed-rate-limit",
  );
  return {
    ...actual,
    checkRateLimitDurable: (...args: unknown[]) => durable.impl(...(args as [])),
    clientIpFromRequest: () => "203.0.113.9",
  };
});

import { checkSearchFastPathSharedRateLimit } from "@/lib/api-ip-rate-limit";

const req = () => new Request("http://localhost/api/venues/search", { method: "POST" });

afterEach(() => {
  durable.impl = async () => ({ allowed: true, count: 1, max: 30, retryAfterSeconds: 0, storeAvailable: true });
});

describe("checkSearchFastPathSharedRateLimit", () => {
  it("allows a request the shared store allows", async () => {
    expect(await checkSearchFastPathSharedRateLimit(req(), "venue-search")).toBeNull();
  });

  it("rejects with 429 when the shared store says the bucket is full", async () => {
    durable.impl = async () => ({ allowed: false, count: 31, max: 30, retryAfterSeconds: 120, storeAvailable: true });
    const res = await checkSearchFastPathSharedRateLimit(req(), "venue-search");
    expect(res?.status).toBe(429);
  });

  it("still protects the route when the store is unavailable", async () => {
    // Falls back to the in-process bucket rather than failing open or returning a 503 to a visitor
    // who did nothing wrong.
    durable.impl = async () => ({ allowed: true, count: 0, max: 30, retryAfterSeconds: 0, storeAvailable: false });
    expect(await checkSearchFastPathSharedRateLimit(req(), "venue-search")).toBeNull();
  });

  it("falls back when the limiter itself throws", async () => {
    durable.impl = async () => { throw new Error("rpc down"); };
    expect(await checkSearchFastPathSharedRateLimit(req(), "venue-search")).toBeNull();
  });
});
