// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HostEventCopilotBridge } from "@/components/host/host-event-copilot-bridge";
import { HostEventForm } from "@/components/host/host-event-form";
import type { EventDraftState } from "@/lib/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HitlProps = {
  args: { draft?: Partial<EventDraftState> };
  status: "inProgress" | "executing" | "complete";
  toolCallId?: string;
  respond?: (result: unknown) => Promise<void>;
};

let registeredRender: React.ComponentType<HitlProps> | undefined;
vi.mock("@copilotkit/react-core/v2", () => ({
  useAgent: () => ({ agent: { state: undefined } }),
  useAgentContext: () => undefined,
  useFrontendTool: () => undefined,
  useHumanInTheLoop: (config: { render: React.ComponentType<HitlProps> }) => {
    registeredRender = config.render;
  },
  UseAgentUpdate: { OnStateChanged: "OnStateChanged" },
}));
vi.mock("@/components/host/event-publish-approval-panel", () => ({
  EventPublishApprovalPanel: ({ draft }: { draft: EventDraftState }) => (
    <output data-testid="captured-publish-draft">{JSON.stringify(draft)}</output>
  ),
}));

afterEach(() => {
  cleanup();
  registeredRender = undefined;
});

describe("HostEventCopilotBridge publish HITL", () => {
  it("reads the visible wizard after edits without re-registering the HITL tool", () => {
    render(
      <HostEventCopilotBridge>
        {({ draft, setDraft }) => <HostEventForm draft={draft} onChange={setDraft} />}
      </HostEventCopilotBridge>,
    );
    const PublishPanel = registeredRender;
    expect(PublishPanel).toBeDefined();

    // The host completes the visible form AFTER the bridge has first mounted.
    for (const [id, value] of [
      ["host-event-field-title", "Salsa Night from Wizard"],
      ["host-event-field-neighborhood", "Laureles"],
      ["host-event-field-date", "2026-12-15T20:00"],
      ["host-event-field-venue", "Son Havana"],
      ["host-event-field-capacity", "60"],
      ["host-event-field-price", "40000"],
    ]) {
      fireEvent.change(screen.getByTestId(id), { target: { value } });
    }
    expect(registeredRender).toBe(PublishPanel);
    if (!PublishPanel) throw new Error("HITL renderer not registered");

    render(<PublishPanel args={{ draft: { description: "Proposed by AI after wizard edits" } }} status="executing" />);
    const reviewed = JSON.parse(
      screen.getByTestId("captured-publish-draft").textContent ?? "{}",
    ) as EventDraftState;
    expect(reviewed).toMatchObject({
      title: "Salsa Night from Wizard",
      neighborhood: "Laureles",
      dateIso: "2026-12-15T20:00-05:00",
      description: "Proposed by AI after wizard edits",
      venue: "Son Havana",
      capacity: 60,
      priceMinCop: 40000,
    });
  });
});
