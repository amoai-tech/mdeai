// @vitest-environment jsdom
import { StrictMode, useEffect } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotKitCoreReact } from "@copilotkit/react-core/v2/context";
import { useGenerativeUIRuntime } from "@copilotkit/react-core/v2/generative-ui/native";
import {
  MDE_DASHBOARD_THREAD_ID,
  MdeDashboardRenderProvider,
  MdeDashboardSurface,
} from "@/components/copilot/a2ui/mde-dashboard-surface";

type Runtime = NonNullable<ReturnType<typeof useGenerativeUIRuntime>>;
const operations = [{
  version: "1.0",
  createSurface: {
    surfaceId: "lifecycle-test",
    components: [{ id: "root", component: "Text", text: "Local dashboard" }],
  },
}];

function Probe({ capture }: { capture: (runtime: Runtime) => void }) {
  const runtime = useGenerativeUIRuntime();
  useEffect(() => {
    if (runtime) capture(runtime);
  }, [capture, runtime]);
  return null;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SAN-1683 local dashboard renderer lifecycle", () => {
  it("releases SDK root subscriptions on strict-mode cleanup and creates fresh surfaces on remount", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const original = CopilotKitCoreReact.prototype.subscribe;
    const cleanups: Array<() => number> = [];
    vi.spyOn(CopilotKitCoreReact.prototype, "subscribe").mockImplementation(function (
      this: CopilotKitCoreReact, subscriber,
    ) {
      const subscription = original.call(this, subscriber);
      if (subscriber.onAgentRunStarted) {
        const spy = vi.spyOn(subscription, "unsubscribe");
        cleanups.push(() => spy.mock.calls.length);
      }
      return subscription;
    });

    const capture = vi.fn<(runtime: Runtime) => void>();
    const mount = () => render(
      <StrictMode>
        <MdeDashboardRenderProvider>
          <Probe capture={capture} />
          <MdeDashboardSurface surfaceId="lifecycle-test" operations={operations} fallback="Loading" />
        </MdeDashboardRenderProvider>
      </StrictMode>,
    );

    const first = mount();
    await screen.findByTestId("mde-surface-lifecycle-test");
    const firstRuntime = capture.mock.calls.at(-1)![0];
    const firstSurface = firstRuntime.manager.getSurface(MDE_DASHBOARD_THREAD_ID, "lifecycle-test");
    expect(firstSurface).toBeDefined();
    expect(cleanups.length).toBeGreaterThanOrEqual(2);
    expect(cleanups.filter((count) => count() === 0)).toHaveLength(1);
    first.unmount();
    expect(cleanups.every((count) => count() === 1)).toBe(true);

    const second = mount();
    await screen.findByTestId("mde-surface-lifecycle-test");
    const secondRuntime = capture.mock.calls.at(-1)![0];
    const secondSurface = secondRuntime.manager.getSurface(MDE_DASHBOARD_THREAD_ID, "lifecycle-test");
    expect(secondRuntime.manager).not.toBe(firstRuntime.manager);
    expect(secondSurface).toBeDefined();
    expect(secondSurface).not.toBe(firstSurface);
    second.unmount();
    expect(cleanups.every((count) => count() === 1)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
