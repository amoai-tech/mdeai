// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HostEventManualPublish } from "@/components/host/host-event-manual-publish";
import { EMPTY_EVENT_DRAFT, EventDraftStateSchema } from "@/lib/types";

vi.mock("@/components/host/event-publish-approval-panel", () => ({
  EventPublishApprovalPanel: ({
    draft,
    respond,
    onPublished,
  }: {
    draft: Record<string, unknown>;
    respond: (decision: "edit" | "approved") => void;
    onPublished: (v: { eventId: string; slug: string; approvalRequestId: string }) => void;
  }) => (
    <section data-testid="same-atomic-review-panel">
      <output data-testid="manual-publish-payload">{JSON.stringify(draft)}</output>
      <button onClick={() => respond("edit")}>Edit reviewed draft</button>
      <button onClick={() => onPublished({
        eventId: "event-qa", slug: "qa-event", approvalRequestId: "approval-qa",
      })}>Complete saved event</button>
    </section>
  ),
}));

afterEach(cleanup);

const ready = EventDraftStateSchema.parse({
  title: "[QA] Salsa Night",
  neighborhood: "Laureles",
  dateIso: "2026-11-18T20:00",
  venue: "Son Havana",
  capacity: 2,
  priceMinCop: 40000,
});

describe("manual host publish without a working AI provider", () => {
  it("requires valid technical event fields before opening the same review panel", () => {
    render(<HostEventManualPublish draft={EMPTY_EVENT_DRAFT} onPublished={vi.fn()} />);
    expect((screen.getByTestId("host-event-review-manual") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("same-atomic-review-panel")).toBeNull();
  });

  it("reviews the actual filled form with normalized Colombia date and whole-COP price", () => {
    const onPublished = vi.fn();
    render(<HostEventManualPublish draft={ready} onPublished={onPublished} />);
    const button = screen.getByTestId("host-event-review-manual");
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    const reviewed = JSON.parse(screen.getByTestId("manual-publish-payload").textContent ?? "{}");
    expect(reviewed).toMatchObject({
      title: "[QA] Salsa Night",
      dateIso: "2026-11-18T20:00-05:00",
      capacity: 2,
      priceMinCop: 40000,
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("Complete saved event"));
    expect(onPublished).toHaveBeenCalledWith({
      eventId: "event-qa", slug: "qa-event", approvalRequestId: "approval-qa",
    });
  });

  it("cancelling review writes no result and lets the host edit and review again", () => {
    const onPublished = vi.fn();
    render(<HostEventManualPublish draft={ready} onPublished={onPublished} />);
    fireEvent.click(screen.getByTestId("host-event-review-manual"));
    fireEvent.click(screen.getByText("Edit reviewed draft"));
    expect(screen.queryByTestId("same-atomic-review-panel")).toBeNull();
    expect(onPublished).not.toHaveBeenCalled();
    expect((screen.getByTestId("host-event-review-manual") as HTMLButtonElement).disabled).toBe(false);
  });
});
