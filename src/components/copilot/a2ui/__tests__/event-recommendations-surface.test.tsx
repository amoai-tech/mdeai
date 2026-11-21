// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const runtime: { value: unknown } = { value: null };

vi.mock("@copilotkit/react-core/v2/generative-ui", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGenerativeUIRuntime: () => runtime.value,
    GenerativeUISurface: (props: { id: string }) => <div data-testid="mock-surface" data-target={props.id} />,
  };
});

const { EventRecommendationsSurface, EVENT_RECOMMENDATIONS_SURFACE_ID } = await import(
  "@/components/copilot/a2ui/event-recommendations-surface"
);

describe("EventRecommendationsSurface", () => {
  it("renders nothing without the generative-UI runtime (deterministic tests, no provider)", () => {
    runtime.value = null;
    expect(renderToStaticMarkup(<EventRecommendationsSurface />)).toBe("");
  });

  it("registers the event-recommendations target when the runtime exists", () => {
    runtime.value = {};
    const html = renderToStaticMarkup(<EventRecommendationsSurface />);
    expect(html).toContain('data-testid="mock-surface"');
    expect(html).toContain(`data-target="${EVENT_RECOMMENDATIONS_SURFACE_ID}"`);
  });
});
