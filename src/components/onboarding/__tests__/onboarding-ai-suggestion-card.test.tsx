// @vitest-environment jsdom
import { act } from "react";
import { fireEvent, within } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OnboardingAiSuggestionCard } from "../onboarding-ai-suggestion-card";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | null = null;

afterEach(() => {
  if (mounted) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = null;
  }
});

function mount(onAccept = vi.fn(), onIgnore = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(
      <OnboardingAiSuggestionCard
        suggestion={{ businessName: "Café Central", category: "Café", neighborhood: "Laureles", reason: "From your message" }}
        onAccept={onAccept}
        onIgnore={onIgnore}
      />,
    );
  });
  mounted = { container, root };
  return { container, onAccept, onIgnore };
}

function click(container: HTMLElement, testId: string) {
  fireEvent.click(within(container).getByTestId(testId));
}

function setValue(container: HTMLElement, testId: string, value: string) {
  fireEvent.change(within(container).getByTestId(testId), { target: { value } });
}

describe("OnboardingAiSuggestionCard (SAN-709)", () => {
  it("does not persist before explicit form activation", () => {
    const onAccept = vi.fn();
    const { container } = mount(onAccept);
    expect(onAccept).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Nothing is saved until");
  });

  it("accepts the proposal without writing anything itself", () => {
    const { container, onAccept } = mount();
    click(container, "onboarding-suggestion-accept");
    expect(onAccept).toHaveBeenCalledWith(
      expect.objectContaining({ businessName: "Café Central", category: "Café" }),
    );
  });

  it("ignores the proposal", () => {
    const { container, onIgnore } = mount();
    click(container, "onboarding-suggestion-ignore");
    expect(onIgnore).toHaveBeenCalledTimes(1);
  });

  it("edits, validates and applies the changed values", () => {
    const { container, onAccept } = mount();
    click(container, "onboarding-suggestion-edit");
    setValue(container, "suggestion-edit-businessName", "Café Central Updated");
    click(container, "onboarding-suggestion-save");
    expect(onAccept).toHaveBeenCalledWith(
      expect.objectContaining({ businessName: "Café Central Updated" }),
    );
  });

  it("shows a readable error and does not apply an invalid edit", () => {
    const { container, onAccept } = mount();
    click(container, "onboarding-suggestion-edit");
    setValue(container, "suggestion-edit-businessName", "A");
    click(container, "onboarding-suggestion-save");
    expect(onAccept).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="suggestion-error"]')?.textContent,
    ).toContain("at least 2");
  });
});
