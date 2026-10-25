import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/restaurants/33333333-3333-4333-8333-333333333333",
}));
vi.mock("@/lib/supabase/env", () => ({
  getSupabaseEnv: () => ({ url: "https://example.supabase.co", anonKey: "test-publishable-key" }),
}));
import { RestaurantVotePanel } from "../restaurant-vote-panel";

describe("vote after login / hydration race", () => {
  it("server-renders the new panel's vote button disabled until the saved-vote check", () => {
    const html = renderToStaticMarkup(
      <RestaurantVotePanel
        restaurantName="Carmen"
        voteTarget={{
          contestId: "11111111-1111-4111-8111-111111111111",
          entityId: "22222222-2222-4222-8222-222222222222",
        }}
      />,
    );
    expect(html).toContain('data-testid="vote-cta"');
    expect(html).toContain('data-hydrated="false"');
    expect(html).toMatch(/<button[^>]+data-testid="vote-cta"[^>]+disabled=""/);
    expect(html).toContain("Checking saved vote");
  });
});
