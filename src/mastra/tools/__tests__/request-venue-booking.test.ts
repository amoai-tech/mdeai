import { describe, expect, it, vi, beforeEach } from "vitest";
import { noopObserve } from "@mastra/core/tools";
import { RequestContext } from "@mastra/core/request-context";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const { insertVenueBookingRequest, createServiceRoleClient } = vi.hoisted(() => ({
  insertVenueBookingRequest: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/venues/venue-booking-core", () => ({
  insertVenueBookingRequest,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient,
}));

import { requestVenueBookingTool } from "../request-venue-booking";

const validInput = {
  venueKind: "restaurant" as const,
  placeId: "ChIJtest12345678",
  requestedAt: "2026-06-15T20:00:00.000Z",
  partySize: 4,
  contactName: "Tourist",
  contactEmail: "tourist@example.com",
  venueTitle: "Mamasita",
};

function mockSupabase() {
  return {} as SupabaseClient<Database>;
}

/** Minimal valid tool-execution context for the candidate's public ToolExecutionContext. */
function execContext(userId?: string) {
  const entries: Array<readonly [string, unknown]> = userId
    ? [["mdeaiUserId", userId]]
    : [];
  return {
    requestContext: new RequestContext<unknown>(entries),
    observe: noopObserve,
  };
}

describe("requestVenueBookingTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServiceRoleClient.mockReturnValue(mockSupabase());
  });

  it("returns sign-in message when user is anonymous", async () => {
    const result = await requestVenueBookingTool.execute!(
      validInput,
      execContext(),
    );
    expect(result).toEqual({
      success: false,
      message: "Sign in to request a booking.",
    });
    expect(insertVenueBookingRequest).not.toHaveBeenCalled();
  });

  it("never inserts from an AI tool invocation, even with an authenticated actor", async () => {
    const result = await requestVenueBookingTool.execute!(
      validInput,
      execContext("user-abc"),
    );
    expect(result).toEqual({
      success: false,
      message: expect.stringContaining("no request has been saved"),
    });
    expect(insertVenueBookingRequest).not.toHaveBeenCalled();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("returns validation error without creating a booking", async () => {
    const result = await requestVenueBookingTool.execute!(
      { ...validInput, partySize: 0 },
      execContext("user-abc"),
    );
    // Mastra may reject malformed inputs before execute() runs.
    expect(result).not.toMatchObject({ success: true });
    expect(insertVenueBookingRequest).not.toHaveBeenCalled();
  });
});
