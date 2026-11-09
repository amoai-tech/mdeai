import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import {
  checkSearchFastPathSharedRateLimit,
  resetApiIpRateLimitsForTests,
} from "@/lib/api-ip-rate-limit";

const full = { allowed: false, count: 31, max: 30, retryAfterSeconds: 120, storeAvailable: true };
const unavailable = { allowed: true, count: 0, max: 30, retryAfterSeconds: 0, storeAvailable: false };

const req = () => new Request("http://localhost/api/venues/search", { method: "POST" });

beforeEach(() => {
  // The in-process buckets are module state; each test starts from an empty window.
  resetApiIpRateLimitsForTests();
});

afterEach(() => {
  durable.impl = async () => ({ allowed: true, count: 1, max: 30, retryAfterSeconds: 0, storeAvailable: true });
});

describe("checkSearchFastPathSharedRateLimit", () => {
  it("allows a request the shared store allows", async () => {
    expect(await checkSearchFastPathSharedRateLimit(req(), "venue-search")).toBeNull();
  });

  it("rejects with 429 when the shared store says the bucket is full", async () => {
    durable.impl = async () => full;
    const res = await checkSearchFastPathSharedRateLimit(req(), "venue-search");
    expect(res?.status).toBe(429);
  });

  it("falls back to the in-process bucket when the store is unavailable", async () => {
    // A null alone could also mean "failed open". Exhausting the in-process bucket proves the
    // fallback really runs: the 31st request in the window must be rejected.
    durable.impl = async () => unavailable;
    const results: (number | null)[] = [];
    for (let i = 0; i < 31; i += 1) {
      const res = await checkSearchFastPathSharedRateLimit(req(), "venue-search");
      results.push(res ? res.status : null);
    }
    expect(results.slice(0, 30).every((status) => status === null)).toBe(true);
    expect(results[30]).toBe(429);
  });

  it("falls back the same way when the limiter throws", async () => {
    durable.impl = async () => {
      throw new Error("rpc down");
    };
    const results: (number | null)[] = [];
    for (let i = 0; i < 31; i += 1) {
      const res = await checkSearchFastPathSharedRateLimit(req(), "venue-search");
      results.push(res ? res.status : null);
    }
    expect(results[30]).toBe(429);
  });
});

describe("shared limit configuration", () => {
  it("asks the store for a 60-second window, matching the old in-process guard", async () => {
    const seen: unknown[][] = [];
    durable.impl = async (...args: unknown[]) => {
      seen.push(args);
      return { allowed: true, count: 1, max: 30, retryAfterSeconds: 0, storeAvailable: true };
    };
    await checkSearchFastPathSharedRateLimit(req(), "venue-search:cafe");
    // key, max, windowSeconds
    expect(seen[0]?.[1]).toBe(30);
    expect(seen[0]?.[2]).toBe(60);
  });

  it("keys each bucket separately, so one route cannot exhaust another", async () => {
    const keys: string[] = [];
    durable.impl = async (...args: unknown[]) => {
      keys.push(String(args[0]));
      return { allowed: true, count: 1, max: 30, retryAfterSeconds: 0, storeAvailable: true };
    };
    await checkSearchFastPathSharedRateLimit(req(), "venue-search:cafe");
    await checkSearchFastPathSharedRateLimit(req(), "venue-search:nightlife");
    expect(keys[0]).toContain("venue-search:cafe");
    expect(keys[1]).toContain("venue-search:nightlife");
  });
});
