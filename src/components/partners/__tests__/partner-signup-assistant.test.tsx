// @vitest-environment jsdom
import { act } from "react";
import { fireEvent, within } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { PartnerSignupFormState } from "@/lib/partners/activate-client";
import type { PartnerProfileSuggestion } from "@/lib/onboarding/ai-suggestion";
import { PartnerSignupAssistant } from "../partner-signup-assistant";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotKitProvider: ({ children }: { children: ReactNode }) => children,
  CopilotChatConfigurationProvider: ({ children }: { children: ReactNode }) => children,
  CopilotChat: () => null,
}));

vi.mock("@/components/onboarding/onboarding-copilot-bridge", () => ({
  OnboardingCopilotBridge: ({
    context,
    onSuggestion,
  }: {
    context: { formRevision: number };
    onSuggestion: (_suggestion: PartnerProfileSuggestion, revision: number) => void;
  }) => (
    <div>
      <button type="button" data-testid="suggest-current"
        onClick={() => { onSuggestion({ category: "Café" }, context.formRevision); }}>
        Suggest
      </button>
      <button type="button" data-testid="suggest-old"
        onClick={() => { onSuggestion({ category: "Café" }, 0); }}>
        Late response
      </button>
    </div>
  ),
}));

vi.mock("@/components/partners/partner-signup-wizard", () => ({
  PartnerSignupWizard: ({
    form,
    onFormChange,
  }: {
    form?: PartnerSignupFormState;
    onFormChange?: Dispatch<SetStateAction<PartnerSignupFormState>>;
  }) => form ? (
    <input
      aria-label="Category"
      value={form.category ?? ""}
      onChange={(event) => onFormChange?.((current) => ({
        ...current, category: event.target.value,
      }))}
    />
  ) : null,
}));

let mounted: { root: Root; container: HTMLDivElement } | null = null;
function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(
      <PartnerSignupAssistant
        partnerType="venue"
        isAuthenticated
        loginNextPath="/partners/signup?type=venue"
      />,
    );
  });
  mounted = { root, container };
  return container;
}
function click(container: HTMLElement, testId: string) {
  fireEvent.click(within(container).getByTestId(testId));
}
function editCategory(container: HTMLElement, value: string) {
  fireEvent.change(within(container).getByRole("textbox", { name: "Category" }), {
    target: { value },
  });
}
function expectCategory(container: HTMLElement, expected: string) {
  expect(within(container).getByRole("textbox", { name: "Category" }))
    .toHaveProperty("value", expected);
}

afterEach(() => {
  if (mounted) {
    act(() => mounted?.root.unmount());
    mounted.container.remove();
    mounted = null;
  }
});

describe("SAN-709 assistant proposal revision guard", () => {
  it("applies a reviewed current proposal but never writes on its own", () => {
    const container = mount();
    click(container, "suggest-current");
    expectCategory(container, "");
    click(container, "onboarding-suggestion-accept");
    expectCategory(container, "Café");
    expect(within(container).queryByTestId("onboarding-suggestion-card")).toBeNull();
  });

  it("keeps a newer manual edit when an old response arrives", () => {
    const container = mount();
    editCategory(container, "Restaurant");
    click(container, "suggest-old");
    expectCategory(container, "Restaurant");
    expect(within(container).queryByTestId("onboarding-suggestion-card")).toBeNull();
  });

  it("invalidates a displayed proposal after the user edits the form", () => {
    const container = mount();
    click(container, "suggest-current");
    editCategory(container, "Restaurant");
    expect(within(container).queryByTestId("onboarding-suggestion-stale")).not.toBeNull();
    expect(within(container).queryByTestId("onboarding-suggestion-accept")).toBeNull();
    expectCategory(container, "Restaurant");
  });

  it("Ignore never changes the form", () => {
    const container = mount();
    click(container, "suggest-current");
    click(container, "onboarding-suggestion-ignore");
    expectCategory(container, "");
  });
});
