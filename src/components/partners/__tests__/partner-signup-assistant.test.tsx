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

vi.mock("@/components/onboarding/business-url-import-card", () => ({
  BusinessUrlImportCard: ({ onApply }: { onApply: (suggestion: PartnerProfileSuggestion) => void }) => (
    <button type="button" data-testid="url-apply"
      onClick={() => onApply({ category: "Imported venue" })}>
      Accept website fields
    </button>
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
// React 19 queues updates from fireEvent; flush them before asserting.
async function click(container: HTMLElement, testId: string) {
  await act(async () => {
    fireEvent.click(within(container).getByTestId(testId));
    await Promise.resolve();
  });
}
async function editCategory(container: HTMLElement, value: string) {
  await act(async () => {
    fireEvent.change(within(container).getByRole("textbox", { name: "Category" }), {
      target: { value },
    });
    await Promise.resolve();
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
  it("applies a reviewed current proposal but never writes on its own", async () => {
    const container = mount();
    await click(container, "suggest-current");
    expectCategory(container, "");
    await click(container, "onboarding-suggestion-accept");
    expectCategory(container, "Café");
    expect(within(container).queryByTestId("onboarding-suggestion-card")).toBeNull();
  });

  it("keeps a newer manual edit when an old response arrives", async () => {
    const container = mount();
    await editCategory(container, "Restaurant");
    await click(container, "suggest-old");
    expectCategory(container, "Restaurant");
    expect(within(container).queryByTestId("onboarding-suggestion-card")).toBeNull();
  });

  it("invalidates a displayed proposal after the user edits the form", async () => {
    const container = mount();
    await click(container, "suggest-current");
    await editCategory(container, "Restaurant");
    expect(within(container).queryByTestId("onboarding-suggestion-stale")).not.toBeNull();
    expect(within(container).queryByTestId("onboarding-suggestion-accept")).toBeNull();
    expectCategory(container, "Restaurant");
  });

  it("invalidates an earlier AI proposal after website autofill is accepted", async () => {
    const container = mount();
    await click(container, "suggest-current");
    await click(container, "url-apply");
    expectCategory(container, "Imported venue");
    expect(within(container).queryByTestId("onboarding-suggestion-stale")).not.toBeNull();
    expect(within(container).queryByTestId("onboarding-suggestion-accept")).toBeNull();
    await click(container, "suggest-old");
    expectCategory(container, "Imported venue");
  });

  it("Ignore never changes the form", async () => {
    const container = mount();
    await click(container, "suggest-current");
    await click(container, "onboarding-suggestion-ignore");
    expectCategory(container, "");
  });
});
