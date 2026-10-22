// @vitest-environment jsdom
import { act } from "react";
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
    onSuggestion: (suggestion: PartnerProfileSuggestion, revision: number) => void;
  }) => (
    <div>
      <button type="button" data-testid="suggest-current"
        onClick={() => onSuggestion({ category: "Café" }, context.formRevision)}>
        Suggest
      </button>
      <button type="button" data-testid="suggest-old"
        onClick={() => onSuggestion({ category: "Café" }, 0)}>
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
function click(container: HTMLElement, selector: string) {
  const control = container.querySelector(selector) as HTMLButtonElement | null;
  expect(control).not.toBeNull();
  act(() => control?.click());
}
function editCategory(container: HTMLElement, value: string) {
  const input = container.querySelector('input[aria-label="Category"]') as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function category(container: HTMLElement) {
  return (container.querySelector('input[aria-label="Category"]') as HTMLInputElement).value;
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
    click(container, '[data-testid="suggest-current"]');
    expect(category(container)).toBe("");
    click(container, '[data-testid="onboarding-suggestion-accept"]');
    expect(category(container)).toBe("Café");
    expect(container.querySelector('[data-testid="onboarding-suggestion-card"]')).toBeNull();
  });

  it("keeps a newer manual edit when an old response arrives", () => {
    const container = mount();
    editCategory(container, "Restaurant");
    click(container, '[data-testid="suggest-old"]');
    expect(category(container)).toBe("Restaurant");
    expect(container.querySelector('[data-testid="onboarding-suggestion-card"]')).toBeNull();
  });

  it("invalidates a displayed proposal after the user edits the form", () => {
    const container = mount();
    click(container, '[data-testid="suggest-current"]');
    editCategory(container, "Restaurant");
    expect(container.querySelector('[data-testid="onboarding-suggestion-stale"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="onboarding-suggestion-accept"]')).toBeNull();
    expect(category(container)).toBe("Restaurant");
  });

  it("Ignore never changes the form", () => {
    const container = mount();
    click(container, '[data-testid="suggest-current"]');
    click(container, '[data-testid="onboarding-suggestion-ignore"]');
    expect(category(container)).toBe("");
  });
});
