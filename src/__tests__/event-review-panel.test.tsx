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
  sessionStorage.clear();
});

function click(element: Element | null) {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("EventPublishApprovalPanel", () => {
  it("shows the host every ticket tier, capacity and description before publishing", () => {
    const detailedDraft = EventDraftStateSchema.parse({
      ...draft,
      capacity: 60,
      description: "Hosted salsa event in Laureles",
      ticketTiers: [
        { name: "General Admission", priceCop: 40000, quantity: 40 },
        { name: "VIP", priceCop: 75000, quantity: 20 },
      ],
    });
    const view = mount(
      <EventPublishApprovalPanel draft={detailedDraft} status="executing" respond={() => {}} />,
    );
    const details = view.querySelector('[data-testid="host-event-review-details"]');
    expect(details?.textContent).toContain("60 people");
    expect(details?.textContent).toContain("Hosted salsa event in Laureles");
    expect(details?.textContent).toContain("General Admission: 40,000 COP");
    expect(details?.textContent).toContain("VIP: 75,000 COP");
    expect(details?.textContent).toContain("20 tickets");
  });

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

  it("recovers the same proposal after remount following a lost response", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("Network disconnected"))
      .mockResolvedValueOnce(success);
    vi.stubGlobal("fetch", fetchMock);
    const first = mount(<EventPublishApprovalPanel draft={draft} status="executing" respond={() => {}} />);
    click(first.querySelector('[data-testid="host-event-approve"]'));
    await vi.waitFor(() => expect(first.textContent).toContain("Network disconnected"));
    const firstBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));

    act(() => root?.unmount());
    first.remove();
    root = undefined;
    container = undefined;
    const second = mount(<EventPublishApprovalPanel draft={draft} status="executing" respond={() => {}} />);
    click(second.querySelector('[data-testid="host-event-approve"]'));
    await vi.waitFor(() => expect(second.textContent).toContain("Event published and saved."));
    const secondBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(secondBody.proposalId).toBe(firstBody.proposalId);
    expect(sessionStorage.getItem("mde:pending-event-publish")).toBeNull();
  });

  it("restores the committed receipt on remount without publishing again", async () => {
    const fetchMock = vi.fn().mockResolvedValue(success);
    vi.stubGlobal("fetch", fetchMock);
    const first = mount(
      <EventPublishApprovalPanel
        draft={draft}
        reviewId="tool-call-1"
        status="executing"
        respond={() => {}}
      />,
    );
    click(first.querySelector('[data-testid="host-event-approve"]'));
    await vi.waitFor(() => expect(first.textContent).toContain("Event published and saved."));

    act(() => root?.unmount());
    first.remove();
    root = undefined;
    container = undefined;
    const second = mount(
      <EventPublishApprovalPanel
        draft={draft}
        reviewId="tool-call-1"
        status="executing"
        respond={() => {}}
      />,
    );
    await vi.waitFor(() => expect(second.textContent).toContain("Event published and saved."));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.querySelector('[data-testid="host-event-approve"]')).toBeNull();
  });

  it("does not show an old receipt for a new review with the same details", async () => {
    const fetchMock = vi.fn().mockResolvedValue(success);
    vi.stubGlobal("fetch", fetchMock);
    const first = mount(
      <EventPublishApprovalPanel
        draft={draft}
        reviewId="tool-call-1"
        status="executing"
        respond={() => {}}
      />,
    );
    click(first.querySelector('[data-testid="host-event-approve"]'));
    await vi.waitFor(() => expect(first.textContent).toContain("Event published and saved."));

    act(() => root?.unmount());
    first.remove();
    root = undefined;
    container = undefined;
    const second = mount(
      <EventPublishApprovalPanel
        draft={draft}
        reviewId="tool-call-2"
        status="executing"
        respond={() => {}}
      />,
    );
    expect(second.textContent).not.toContain("Event published and saved.");
    expect(second.querySelector('[data-testid="host-event-approve"]')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["edit", "rejected"] as const)(
    "does not fabricate a saved receipt for a local %s decision",
    async (decision) => {
      const respond = vi.fn();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, decision, eventId: null, slug: null }),
      });
      vi.stubGlobal("fetch", fetchMock);
      const view = mount(
        <EventPublishApprovalPanel draft={draft} status="executing" respond={respond} />,
      );
      click(view.querySelector(`[data-testid="host-event-${decision === "edit" ? "edit" : "reject"}"]`));
      await vi.waitFor(() => expect(respond).toHaveBeenCalledWith(decision));
      expect(view.querySelector('[data-testid="host-event-approval-receipt"]')).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
