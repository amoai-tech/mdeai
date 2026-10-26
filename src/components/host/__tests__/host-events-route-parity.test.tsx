// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const loadHostEventsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "organizer-a" } } }) },
  })),
}));
vi.mock("@/lib/events/load-host-events", () => ({
  loadHostEvents: loadHostEventsMock,
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => { throw new Error("Unexpected login redirect"); }),
}));
// Sentinel makes a page-local copy fail even if it visually looks identical.
vi.mock("@/components/host/host-events-content", () => ({
  HostEventsContent: ({ error, events, newEventHref }: {
    error: string | null;
    events: unknown[];
    newEventHref: string;
  }) => (
    <div
      data-testid="shared-events-body"
      data-error={error ?? ""}
      data-count={events.length}
      data-create-path={newEventHref}
    />
  ),
}));

import AppEventsPage from "@/app/app/events/(workspace)/page";
import LegacyEventsPage from "@/app/host/events/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SAN-1598 shared Events route contract", () => {
  it.each([
    ["/app/events", AppEventsPage, "/app/events/new"],
    ["/host/events", LegacyEventsPage, "/host/event/new"],
  ])("%s uses the shared body and preserves a loader failure", async (_url, page, createPath) => {
    loadHostEventsMock.mockResolvedValue({ ok: false, message: "database unavailable" });
    render(await page());

    const sharedBody = screen.getByTestId("shared-events-body");
    expect(sharedBody.getAttribute("data-error")).toBe("database unavailable");
    expect(sharedBody.getAttribute("data-count")).toBe("0");
    expect(sharedBody.getAttribute("data-create-path")).toBe(createPath);
    expect(loadHostEventsMock).toHaveBeenCalledWith(expect.anything(), "organizer-a");
  });
});
