// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HostEventCopilotBridge } from "@/components/host/host-event-copilot-bridge";
import { HostEventForm } from "@/components/host/host-event-form";
import type { EventDraftState } from "@/lib/types";
import { HOST_EVENT_INSTRUCTIONS } from "@/mastra/agents/host-event-prompt";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HitlProps = {
  args: { draft?: Partial<EventDraftState> };
  status: "inProgress" | "executing" | "complete";
  toolCallId?: string;
  respond?: (result: unknown) => Promise<void>;
};

let registeredRender: React.ComponentType<HitlProps> | undefined;
let mockAgentState: Partial<EventDraftState> | undefined;
const frontendTools: Record<string, string> = {};
vi.mock("@copilotkit/react-core/v2", () => ({
  useAgent: () => ({ agent: { state: mockAgentState } }),
  useAgentContext: () => undefined,
  useFrontendTool: (config: { name: string; description: string }) => {
    frontendTools[config.name] = config.description;
  },
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
  mockAgentState = undefined;
});

describe("HostEventCopilotBridge publish HITL", () => {
  it("tells the AI to use whole COP amounts, not payment minor units", () => {
    render(
      <HostEventCopilotBridge>
        {({ draft, setDraft }) => <HostEventForm draft={draft} onChange={setDraft} />}
      </HostEventCopilotBridge>,
    );
    expect(frontendTools.set_pricing).toMatch(/whole COP/);
    expect(HOST_EVENT_INSTRUCTIONS).toContain("40000 means COP 40,000");
    expect(HOST_EVENT_INSTRUCTIONS).toContain("never cents");
  });

  it("does not let stale Mastra working memory replace a host's manual edits", () => {
    mockAgentState = {
      title: "Old agent title",
      neighborhood: "Laureles",
      dateIso: "2026-12-15T20:00",
      venue: "Son Havana",
      capacity: 60,
      priceMinCop: 40000,
    };
    render(
      <HostEventCopilotBridge>
        {({ draft, setDraft }) => <HostEventForm draft={draft} onChange={setDraft} />}
      </HostEventCopilotBridge>,
    );
    fireEvent.change(screen.getByTestId("host-event-field-title"), {
      target: { value: "Host corrected title" },
    });
    expect(screen.getByTestId("host-event-field-title")).toHaveProperty(
      "value",
      "Host corrected title",
    );
    const PublishPanel = registeredRender;
    if (!PublishPanel) throw new Error("HITL renderer not registered");
    render(<PublishPanel args={{}} status="executing" />);
    expect(JSON.parse(screen.getByTestId("captured-publish-draft").textContent ?? "{}"))
      .toMatchObject({ title: "Host corrected title" });
  });
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
