import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, getSession, mockFetch } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser, getSession } }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "www.mdeai.co", "x-forwarded-proto": "https" }),
}));
vi.mock("@/lib/supabase/edge-functions", () => ({
  getSupabaseFunctionsBaseUrl: () => "https://example.invalid/functions/v1",
  getSupabaseAnonAuthHeaders: (token?: string | null) => ({
    apikey: "public_fixture",
    Authorization: `Bearer ${token ?? "public_fixture"}`,
    "Content-Type": "application/json",
  }),
}));

import { POST } from "./route";

const valid = {
  eventId: "22222222-2222-4222-8222-222222222222",
  ticketId: "33333333-3333-4333-8333-333333333333",
  quantity: 1,
  buyerName: "QA Buyer",
  buyerEmail: "buyer@example.invalid",
  idempotencyKey: "44444444-4444-4444-8444-444444444444",
  returnPath: "/events/22222222-2222-4222-8222-222222222222",
};

const call = (input: unknown) => POST(new Request("https://www.mdeai.co/api/tickets/checkout", {
  method: "POST",
  body: JSON.stringify(input),
  headers: { "Content-Type": "application/json" },
}));

describe("SAN-1263 checkout verified buyer forwarding", () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: null }, error: null });
    getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
    mockFetch.mockReset().mockImplementation(() => new Response(JSON.stringify({
      success: true,
      data: { stripe_session_url: "https://checkout.stripe.com/c/test", order_id: "order", access_token: "fixture-access" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", mockFetch);
  });

  it("accepts the documented 8/9/10 quantities and rejects 11", async () => {
    for (const quantity of [8, 9, 10]) {
      expect((await call({ ...valid, quantity })).status).toBe(200);
    }
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect((await call({ ...valid, quantity: 11 })).status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("guest checkout keeps the public credential and cannot assign an owner ID", async () => {
    const response = await call(valid);
    expect(response.status).toBe(200);
    expect(getSession).toHaveBeenCalledOnce();
    expect(getUser).not.toHaveBeenCalled();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/ticket-checkout");
    expect(options.headers.Authorization).toBe("Bearer public_fixture");
    const body = JSON.parse(options.body);
    expect(body.buyer_user_id).toBeUndefined();
    expect(body.buyer_email).toBe(valid.buyerEmail);
  });

  it("signed-in checkout forwards only an actual validated session JWT", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "verified-session-token" } }, error: null });
    getUser.mockResolvedValue({ data: { user: { id: "verified-qa-user" } }, error: null });
    const response = await call({ ...valid, buyer_user_id: "attacker-supplied-id" });
    expect(response.status).toBe(200);
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe("Bearer verified-session-token");
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).buyer_user_id).toBeUndefined();
  });

  it("rejects an unverified token rather than silently treating its owner as guest", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "unverified-token" } }, error: null });
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    expect((await call(valid)).status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("invalid input cannot query auth or create a Stripe Checkout", async () => {
    expect((await call({ ...valid, quantity: 0 })).status).toBe(400);
    expect((await call({ ...valid, quantity: 11 })).status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("uses the trusted server origin even if the incoming Checkout URL has a hostile host", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.mdeai.co");
    const response = await POST(new Request("https://attacker.example/api/tickets/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(valid),
    }));
    expect(response.status).toBe(200);
    const forwarded = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(forwarded.return_url_success).toBe(
      `https://www.mdeai.co${valid.returnPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    );
    expect(forwarded.return_url_cancel).toBe(
      `https://www.mdeai.co${valid.returnPath}?checkout=cancelled`,
    );
    expect(forwarded.return_url_success).not.toContain("attacker.example");
  });

  it("rejects external return paths before creating any Stripe Checkout", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.mdeai.co");
    const response = await call({ ...valid, returnPath: "//attacker.example/events/steal" });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("CHECKOUT_RETURN_PATH_INVALID");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 503 instead of redirecting production buyers to a Vercel deployment host", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_URL", "mdeai-abc123-amoco.vercel.app");
    const response = await call(valid);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("CHECKOUT_ORIGIN_NOT_CONFIGURED");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uses the Vercel preview host only with explicit VERCEL_ENV=preview", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_URL", "mde-preview.vercel.app");
    const response = await call(valid);
    expect(response.status).toBe(200);
    const forwarded = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(forwarded.return_url_success).toContain("https://mde-preview.vercel.app/events/");
  });

  it("fails closed for invalid Checkout origin configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://attacker.example");
    const response = await call(valid);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("CHECKOUT_ORIGIN_INVALID");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
