// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EventPublishApprovalPanel } from "@/components/host/event-publish-approval-panel";
import { EventDraftStateSchema } from "@/lib/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const draft = EventDraftStateSchema.parse({
  title: "Salsa Night",
  neighborhood: "Laureles",
  dateIso: "2026-11-01T20:00:00-05:00",
  venue: "Son Havana",
  capacity: 80,
  priceMinCop: 50000,
});

const success = {
  ok: true,
  json: async () => ({
    success: true,
    eventId: "event-1",
    slug: "salsa-night",
    approvalRequestId: "approval-1",
  }),
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function mount(element: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(element));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  vi.unstubAllGlobals();
});

function click(element: Element | null) {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("EventPublishApprovalPanel", () => {
  it("submits the normalized draft and shows the saved receipt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(success);
    vi.stubGlobal("fetch", fetchMock);
    const view = mount(<EventPublishApprovalPanel draft={draft} status="executing" respond={() => {}} />);

    expect(view.textContent).toContain("Ready to publish?");
    click(view.querySelector('[data-testid="host-event-approve"]'));

    await vi.waitFor(() => {
      expect(view.querySelector('[data-testid="host-event-approval-receipt"]')).toBeTruthy();
    });
    expect(view.textContent).toContain("Event published and saved.");
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.draft.status).toBeUndefined();
    expect(body.draft.publishedEventId).toBeUndefined();
    expect(body.approvalRequestId).toBeUndefined();
  });

  it("retries the same proposal after a transient failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, error: { message: "Temporary failure" }, approvalRequestId: "approval-1" }),
      })
      .mockResolvedValueOnce(success);
    vi.stubGlobal("fetch", fetchMock);
    const view = mount(<EventPublishApprovalPanel draft={draft} status="executing" respond={() => {}} />);

    click(view.querySelector('[data-testid="host-event-approve"]'));
    await vi.waitFor(() => {
      expect(view.textContent).toContain("Temporary failure");
    });
    click(Array.from(view.querySelectorAll("button")).find((button) => button.textContent === "Try again") ?? null);

    await vi.waitFor(() => {
      expect(view.querySelector('[data-testid="host-event-approval-receipt"]')).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    const second = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(second.proposalId).toBe(first.proposalId);
    expect(second.approvalRequestId).toBe("approval-1");
  });
});
