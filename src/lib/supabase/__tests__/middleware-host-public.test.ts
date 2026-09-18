import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getClaims: authMocks.getClaims },
  })),
}));

import { updateSession } from "../middleware";

function request(path: string) {
  return new NextRequest(`https://www.mdeai.co${path}`);
}

describe("Supabase proxy session gate", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("E2E_BYPASS_AUTH", "");
    authMocks.getClaims.mockReset().mockResolvedValue({
      data: { claims: null },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("allows the public /host marketing landing", async () => {
    const response = await updateSession(request("/host"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-pathname")).toBe("/host");
    expect(authMocks.getClaims).toHaveBeenCalledOnce();
  });

  it("redirects a signed-out protected route to login with the original path", async () => {
    const response = await updateSession(request("/host/events?view=mine"));
    const location = new URL(response.headers.get("location")!);
    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/host/events?view=mine");
  });

  it("keeps the guest ticket token route public but protects the wallet list", async () => {
    const guest = await updateSession(request("/me/tickets/t_123?token=guest"));
    expect(guest.status).toBe(200);

    const wallet = await updateSession(request("/me/tickets"));
    expect(wallet.status).toBe(307);
    expect(new URL(wallet.headers.get("location")!).pathname).toBe("/login");
  });

  it("protects trips and the host event wizard while /host stays public", async () => {
    for (const path of ["/trips", "/trips/t_123", "/host/event/new"]) {
      const response = await updateSession(request(path));
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
    }
  });

  it("relays a root auth code to /auth/callback", async () => {
    const response = await updateSession(request("/?code=abc123"));
    const location = new URL(response.headers.get("location")!);
    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/auth/callback");
    expect(location.searchParams.get("code")).toBe("abc123");
    expect(authMocks.getClaims).not.toHaveBeenCalled();
  });

  it("does not loop login errors back through the auth relay", async () => {
    const response = await updateSession(request("/login?error=access_denied"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-pathname")).toBe("/login?error=access_denied");
  });

  it("allows authenticated claims through protected routes", async () => {
    authMocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user-123" } },
      error: null,
    });
    const response = await updateSession(request("/saved"));
    expect(response.status).toBe(200);
  });

  it("fails deterministically when the required Supabase environment is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    await expect(updateSession(request("/host"))).rejects.toThrow(
      "Missing NEXT_PUBLIC_SUPABASE_URL",
    );
  });
});
