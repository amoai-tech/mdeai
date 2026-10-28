// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A draft, upcoming or closed contest must never offer an actionable Vote: `vote-cast` requires
 * `status = 'live'` and a current window, so the old button could only fail. A returning voter's
 * receipt must still render after the contest closes, which is why the recovery branches run first.
 */
const mocked = vi.hoisted(() => ({
  router: { push: vi.fn() },
  getSession: vi.fn(),
}));

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
  window.localStorage.clear();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocked.getSession.mockResolvedValue({ data: { session: null } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ receipt: null }) }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderPanel(window: { state: "open" | "upcoming" | "closed" | "draft" | "archived"; opensAt: string | null; closesAt: string | null }) {
  act(() =>
    root.render(
      <RestaurantVotePanel contestWindow={window} restaurantName="Carmen" voteTarget={target} />,
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("vote panel contest window", () => {
  it.each([
    ["draft", "still a draft"],
    ["upcoming", "Voting opens on"],
    ["closed", "Voting closed on"],
    ["archived", "has ended"],
  ] as const)("hides the Vote CTA for a %s contest", async (state, copy) => {
    await renderPanel({
      state,
      opensAt: "2026-12-01T12:00:00Z",
      closesAt: "2026-12-15T12:00:00Z",
    });

    expect(container.querySelector('[data-testid="vote-cta"]')).toBeNull();
    const notOpen = container.querySelector('[data-testid="vote-not-open"]');
    expect(notOpen).not.toBeNull();
    expect(notOpen?.getAttribute("data-state")).toBe(state);
    expect(notOpen?.textContent).toContain(copy);
  });

  it("keeps the Vote CTA for a genuinely open contest", async () => {
    await renderPanel({ state: "open", opensAt: null, closesAt: null });
    expect(container.querySelector('[data-testid="vote-not-open"]')).toBeNull();
    expect(container.querySelector('[data-testid="vote-cta"]')).not.toBeNull();
  });

  it("preserves the existing null-target not-open state", async () => {
    act(() => root.render(<RestaurantVotePanel restaurantName="Carmen" voteTarget={null} />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(container.querySelector('[data-testid="vote-cta"]')).toBeNull();
    expect(container.querySelector('[data-testid="vote-not-open"]')).not.toBeNull();
  });
});
