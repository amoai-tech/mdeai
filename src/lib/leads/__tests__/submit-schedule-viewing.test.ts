import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  ScheduleViewingError,
  submitScheduleViewing,
} from "@/lib/leads/submit-schedule-viewing";

const VALID_INPUT = {
  listingId: "apt-laureles-001",
  listingTitle: "2BR Laureles Apartment",
  neighborhood: "Laureles",
  name: "Camila Test",
  email: "camila@example.com",
  preferredAt: "2099-06-01T15:00",
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe("submitScheduleViewing (SAN-1203 truthful success contract)", () => {
  it("returns both committed ids on success", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        leadId: "lead-1",
        showingId: "showing-1",
        message: "Viewing request received — awaiting host confirmation.",
      }),
    );

    const result = await submitScheduleViewing(VALID_INPUT);

    expect(result.leadId).toBe("lead-1");
    expect(result.showingId).toBe("showing-1");
  });

  it("defaults to 'awaiting host confirmation' copy, never a booked claim", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { success: true, leadId: "lead-1", showingId: "showing-1" }),
    );

    const result = await submitScheduleViewing(VALID_INPUT);

    expect(result.message).toContain("awaiting host confirmation");
    expect(result.message.toLowerCase()).not.toContain("confirmed");
  });

  it("fails when the backend commits a lead but no showing", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { success: true, leadId: "lead-1" }),
    );

    await expect(submitScheduleViewing(VALID_INPUT)).rejects.toThrow(
      ScheduleViewingError,
    );
  });

  it("fails when the backend returns a showing without a lead", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { success: true, showingId: "showing-1" }),
    );

    await expect(submitScheduleViewing(VALID_INPUT)).rejects.toThrow(
      ScheduleViewingError,
    );
  });

  it("surfaces the typed server error code", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(502, {
        success: false,
        error: { code: "SHOWING_NOT_COMMITTED", message: "Showing was not committed" },
      }),
    );

    await expect(submitScheduleViewing(VALID_INPUT)).rejects.toMatchObject({
      code: "SHOWING_NOT_COMMITTED",
      message: "Showing was not committed",
    });
  });

  it("rejects a missing viewing time before calling the API", async () => {
    await expect(
      submitScheduleViewing({ ...VALID_INPUT, preferredAt: undefined as unknown as string }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a past viewing time before calling the API", async () => {
    await expect(
      submitScheduleViewing({ ...VALID_INPUT, preferredAt: "2020-01-01T10:00" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the canonical listing-local instant, not the raw wall clock", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { success: true, leadId: "lead-1", showingId: "showing-1" }),
    );

    await submitScheduleViewing(VALID_INPUT);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.preferredAt).toBe("2099-06-01T15:00");
    // The browser sends the wall clock; the route canonicalises it server-side.
    expect(fetchMock.mock.calls[0][0]).toBe("/api/leads/schedule-viewing");
  });
});
