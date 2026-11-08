// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

type Captured = {
  name: string;
  followUp: boolean;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};
const state = vi.hoisted(() => ({
  tool: null as Captured | null,
  push: vi.fn(),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  useFrontendTool: (tool: Captured) => { state.tool = tool; },
}));
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useOptionalConciergeCoAgent: () => ({ isReady: true }),
}));
vi.mock("@/lib/deterministic-e2e", () => ({ isDeterministicE2E: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));

import { EventPageControlTool, RentalPageControlTool } from "@/components/browse/page-filter-tools";

afterEach(() => { cleanup(); state.tool = null; state.push.mockClear(); });

function tool(): Captured {
  if (!state.tool) throw new Error("page tool not registered");
  return state.tool;
}

describe("page filter tools", () => {
  it("registers the rental page action and updates the existing URL", async () => {
    render(<RentalPageControlTool filters={{ neighborhood: "Laureles", beds: "2", from: null, through: null }} />);
    await waitFor(() => expect(state.tool).not.toBeNull());
    expect(tool().name).toBe("updateRentalBrowseFilters");
    expect(tool().followUp).toBe(false);
    await tool().handler({ beds: "1" });
    expect(state.push).toHaveBeenCalledWith("/rentals?neighborhood=Laureles&beds=1");
  });

  it("registers the event page action and preserves untouched filters", async () => {
    render(<EventPageControlTool filters={{ category: "music", neighborhood: "Laureles", dateWindow: "this_weekend", price: null }} />);
    await waitFor(() => expect(state.tool).not.toBeNull());
    expect(tool().name).toBe("updateEventBrowseFilters");
    await tool().handler({ dateWindow: "next_week" });
    expect(state.push).toHaveBeenCalledWith(
      "/events?category=music&neighborhood=Laureles&dateWindow=next_week",
    );
  });
});
