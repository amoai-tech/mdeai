// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { Rental } from "@/mastra/tools/search-rentals";

type CapturedTool = {
  name: string;
  description: string;
  followUp: boolean;
  handler: (args: { listingId?: string; index?: number }) => Promise<unknown>;
};

const captured = vi.hoisted(() => ({ tool: null as CapturedTool | null }));

vi.mock("@copilotkit/react-core/v2", () => ({
  useFrontendTool: (tool: CapturedTool) => {
    captured.tool = tool;
  },
}));

import { RentalDetailsFrontendTool } from "@/components/rentals/rental-details-tool";

const rows = [
  { id: "a", title: "First apartment" },
  { id: "b", title: "Second apartment" },
] as Rental[];

afterEach(cleanup);

describe("RentalDetailsFrontendTool (SAN-1421 post-merge)", () => {
  it("registers the tool the agent is told to call", () => {
    render(<RentalDetailsFrontendTool results={rows} onOpen={vi.fn()} />);
    expect(captured.tool?.name).toBe("openRentalDetails");
    expect(captured.tool?.description).toContain("Details panel");
    // A UI-only action must not start a follow-up model run; production hit the 100-run limit.
    expect(captured.tool?.followUp).toBe(false);
  });

  it("opens the first apartment by default, or the position/id the agent names", async () => {
    const onOpen = vi.fn();
    render(<RentalDetailsFrontendTool results={rows} onOpen={onOpen} />);
    await waitFor(() => expect(captured.tool).not.toBeNull());

    expect(await captured.tool!.handler({})).toContain("First apartment");
    expect(onOpen).toHaveBeenLastCalledWith(rows[0]);

    expect(await captured.tool!.handler({ index: 2 })).toContain("Second apartment");
    expect(onOpen).toHaveBeenLastCalledWith(rows[1]);

    expect(await captured.tool!.handler({ listingId: "rental-a" })).toContain("First apartment");
    expect(onOpen).toHaveBeenLastCalledWith(rows[0]);
  });

  it("refuses an apartment or position that is not on the page instead of opening another one", async () => {
    const onOpen = vi.fn();
    render(<RentalDetailsFrontendTool results={rows} onOpen={onOpen} />);
    await waitFor(() => expect(captured.tool).not.toBeNull());

    expect(await captured.tool!.handler({ listingId: "not-shown" })).toContain(
      "No apartment with id not-shown",
    );
    expect(await captured.tool!.handler({ index: 99 })).toContain("No apartment 99");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("says so when there is nothing to open", async () => {
    const onOpen = vi.fn();
    render(<RentalDetailsFrontendTool results={[]} onOpen={onOpen} />);
    await waitFor(() => expect(captured.tool).not.toBeNull());

    expect(await captured.tool!.handler({ index: 1 })).toContain("No apartments are shown yet");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
