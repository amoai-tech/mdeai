// @vitest-environment jsdom
import { act, type ReactNode } from "react";
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
// This component test exercises React state and the actual vote requests, not Radix focus management.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
import { RestaurantVotePanel } from "../restaurant-vote-panel";

const target = {
  contestId: "11111111-1111-4111-8111-111111111111",
  entityId: "22222222-2222-4222-8222-222222222222",
};
let root: Root;
let container: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
}
async function click(selector: string) {
  const button = container.querySelector(selector);
  expect(button, `missing button: ${selector}`).not.toBeNull();
  await act(async () => { button!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocked.router.push = mocked.push;
  window.localStorage.clear();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocked.getSession.mockResolvedValue({ data: { session: {
    access_token: "test-access-token", user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  } } });
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ receipt: null }) });
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("lost vote-cast response", () => {
  it("shows Check my vote / Retry instead of allowing a second vote", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/restaurants/my-vote")) return { ok: true, status: 200, json: async () => ({ receipt: null }) };
      if (url.includes("/vote-nonce")) return { ok: true, status: 200, json: async () => ({ data: { nonce: "test-nonce" } }) };
      if (url.includes("/vote-cast")) throw new Error("lost cast response");
      throw new Error("unexpected URL: " + url);
    });
    await act(async () => root.render(<RestaurantVotePanel restaurantName="Carmen" voteTarget={target} />));
    await settle();
    await click('[data-testid="vote-cta"]');
    await click('[data-testid="vote-confirm"]');
    await settle();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/vote-cast"))).toHaveLength(1);
    expect(container.querySelector('[data-testid="vote-cta"]')).toBeNull();
    expect(container.querySelector('[data-testid="vote-check-failed"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="vote-retry-check"]')).not.toBeNull();

    const voteId = "55555555-5555-4555-8555-555555555555";
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/restaurants/my-vote")) return {
        ok: true, status: 200, json: async () => ({ receipt: { vote_id: voteId, entity_id: target.entityId, status: "cast" } }),
      };
      throw new Error("recovery must not send a new vote");
    });
    await click('[data-testid="vote-retry-check"]');
    await settle();
    expect(container.querySelector('[data-testid="vote-receipt-id"]')?.textContent).toContain(voteId);
    expect(container.querySelector('[data-testid="vote-cta"]')).toBeNull();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/vote-cast"))).toHaveLength(1);
  });
});
