// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ push: vi.fn(), getSession: vi.fn(), router: { push: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => mocked.router,
  usePathname: () => "/restaurants/33333333-3333-4333-8333-333333333333",
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: mocked.getSession } }),
}));
vi.mock("@/lib/supabase/env", () => ({
  getSupabaseEnv: () => ({ url: "https://example.supabase.co", anonKey: "test-publishable-key" }),
}));
import { RestaurantVotePanel } from "../restaurant-vote-panel";

const target = {
  contestId: "11111111-1111-4111-8111-111111111111",
  entityId: "22222222-2222-4222-8222-222222222222",
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  mocked.router.push = mocked.push;
  window.localStorage.clear();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocked.getSession.mockResolvedValue({ data: { session: {
    access_token: "test-access-token", user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  } } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("expired saved-vote session", () => {
  it.each([false, true])("redirects to sign-in and hides Vote on 401 (saved key: %s)", async (withKey) => {
    window.history.replaceState({}, "", "/restaurants/33333333-3333-4333-8333-333333333333?contest_id=" + target.contestId);
    if (withKey) window.localStorage.setItem(
      `mde:restaurant-vote:${target.contestId}:${target.entityId}:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
      "44444444-4444-4444-8444-444444444444",
    );
    act(() => root.render(<RestaurantVotePanel restaurantName="Carmen" voteTarget={target} />));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(mocked.push).toHaveBeenCalledWith(
      "/login?next=%2Frestaurants%2F33333333-3333-4333-8333-333333333333%3Fcontest_id%3D" + target.contestId,
    );
    expect(container.querySelector('[data-testid="vote-cta"]')).toBeNull();
  });
});
