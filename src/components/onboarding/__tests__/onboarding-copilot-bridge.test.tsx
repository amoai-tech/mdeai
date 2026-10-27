// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingCopilotBridge } from "../onboarding-copilot-bridge";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({ tool: vi.fn(), context: vi.fn() }));
vi.mock("@copilotkit/react-core/v2", () => ({
  useFrontendTool: mocks.tool,
  useAgentContext: mocks.context,
}));

type Tool = {
  parameters: { safeParse: (_value: unknown) => { success: boolean } };
  handler: (_args: {
    formRevision: number;
    category?: string;
    status?: string;
  }) => Promise<{ ok: boolean; state?: string; saved?: boolean }>;
};
let mounted: { root: Root; container: HTMLDivElement } | null = null;

afterEach(() => {
  if (mounted) {
    act(() => mounted?.root.unmount());
    mounted.container.remove();
    mounted = null;
  }
  mocks.tool.mockReset();
  mocks.context.mockReset();
});

describe("SAN-709 real CopilotKit frontend bridge", () => {
  it("only sends current, reviewed, allowlisted proposals to the UI", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted = { root, container };
    const onSuggestion = vi.fn();
    const context = (formRevision: number) => ({
      partnerType: "venue",
      currentForm: { businessName: "", category: "Restaurant", neighborhood: "" },
      formRevision,
    });

    act(() => {
      root.render(<OnboardingCopilotBridge context={context(3)} onSuggestion={onSuggestion} />);
    });
    expect(mocks.context).toHaveBeenCalledWith(expect.objectContaining({
      value: expect.objectContaining({ formRevision: 3 }),
    }));
    let tool = mocks.tool.mock.lastCall?.[0] as Tool;
    expect(tool.parameters.safeParse({ formRevision: 3, category: "Café" }).success)
      .toBe(true);
    expect(tool.parameters.safeParse({
      formRevision: 3, category: "Café", status: "active",
    }).success).toBe(false);
    let result!: Awaited<ReturnType<Tool["handler"]>>;
    await act(async () => { result = await tool.handler({ formRevision: 3, category: "Café" }); });
    expect(result).toMatchObject({ ok: true, state: "awaiting_user_review", saved: false });
    expect(onSuggestion).toHaveBeenCalledWith({ category: "Café" }, 3);

    act(() => {
      root.render(<OnboardingCopilotBridge context={context(4)} onSuggestion={onSuggestion} />);
    });
    tool = mocks.tool.mock.lastCall?.[0] as Tool;
    onSuggestion.mockClear();
    await act(async () => { result = await tool.handler({ formRevision: 3, category: "Café" }); });
    expect(result.ok).toBe(false);
    expect(onSuggestion).not.toHaveBeenCalled();
  });
});
